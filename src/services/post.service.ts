import { env } from '../config/env.js';
import { supabase, type Post } from '../db/supabase.js';
import { generatePosts, rewritePost as rewritePostContent, type RewritePostMode } from './llm.service.js';
import { scorePostRisk } from './safety.service.js';
import { sendApprovalMessage } from './telegram.service.js';
import { publishPost } from './x.service.js';
import { getAgentSettings, getVoiceExamples } from './settings.service.js';

export type GenerateDraftsResult = {
  created: Post[];
  blocked: Array<{
    content: string;
    riskScore: number;
  }>;
};

async function getDefaultTelegramChatId(): Promise<string> {
  const { data, error } = await supabase
    .from('users')
    .select('telegram_chat_id')
    .eq('id', env.DEFAULT_USER_ID)
    .single();

  if (error) {
    throw new Error(`Could not load default user: ${error.message}`);
  }

  if (!data?.telegram_chat_id) {
    throw new Error('Default user does not have telegram_chat_id set.');
  }

  return data.telegram_chat_id;
}

async function createDraft(content: string, riskScore: number): Promise<Post> {
  const { data, error } = await supabase
    .from('posts')
    .insert({
      user_id: env.DEFAULT_USER_ID,
      content,
      risk_score: riskScore,
      status: 'draft'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Could not create draft: ${error.message}`);
  }

  const { error: metricsError } = await supabase
    .from('performance_metrics')
    .insert({ post_id: data.id });

  if (metricsError) {
    throw new Error(`Could not create performance metrics placeholder: ${metricsError.message}`);
  }

  return data;
}

export async function generateDraftsForApproval(topic?: string, count?: number): Promise<GenerateDraftsResult> {
  const settings = await getAgentSettings();
  const voiceExamples = await getVoiceExamples();
  const chatId = await getDefaultTelegramChatId();
  const generated = await generatePosts({
    topic,
    count: count ?? settings.daily_post_count,
    settings,
    voiceExamples
  });
  const created: Post[] = [];
  const blocked: GenerateDraftsResult['blocked'] = [];

  for (const content of generated) {
    const risk = scorePostRisk(content);
    const draft = await createDraft(content, risk.score);

    if (risk.score > settings.risk_threshold) {
      blocked.push({ content, riskScore: risk.score });
      continue;
    }

    await sendApprovalMessage(chatId, draft.id, content);
    created.push(draft);
  }

  return { created, blocked };
}

export async function approvePost(postId: string): Promise<Post> {
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select()
    .eq('id', postId)
    .single();

  if (postError) {
    throw new Error(`Could not load post: ${postError.message}`);
  }

  if (post.status === 'posted') {
    return post;
  }

  if (post.status === 'rejected') {
    throw new Error('Cannot approve a rejected post.');
  }

  if (post.status === 'scheduled') {
    return post;
  }

  const settings = await getAgentSettings();
  if (post.risk_score > settings.risk_threshold) {
    throw new Error('Post risk score is too high for approval.');
  }

  const approvedAt = new Date().toISOString();
  const scheduledAt = await getNextScheduledAt(settings.posting_interval_minutes);
  const { data: scheduled, error: approveError } = await supabase
    .from('posts')
    .update({
      status: 'scheduled',
      approved_at: approvedAt,
      scheduled_at: scheduledAt,
      last_error: null
    })
    .eq('id', postId)
    .select()
    .single();

  if (approveError) {
    throw new Error(`Could not approve post: ${approveError.message}`);
  }

  await logApproval(postId, 'approved');
  return scheduled;
}

export async function publishScheduledPosts(limit = 3): Promise<Post[]> {
  const now = new Date().toISOString();
  const { data: duePosts, error } = await supabase
    .from('posts')
    .select()
    .eq('user_id', env.DEFAULT_USER_ID)
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Could not load scheduled posts: ${error.message}`);
  }

  const publishedPosts: Post[] = [];
  for (const post of duePosts) {
    publishedPosts.push(await publishPostToX(post as Post));
  }

  return publishedPosts;
}

export async function retryPost(postId: string): Promise<Post> {
  const { data: post, error } = await supabase
    .from('posts')
    .select()
    .eq('id', postId)
    .single();

  if (error) {
    throw new Error(`Could not load post: ${error.message}`);
  }

  if (post.status !== 'failed' && post.status !== 'scheduled') {
    throw new Error('Only failed or scheduled posts can be retried.');
  }

  const settings = await getAgentSettings();
  const scheduledAt = await getNextScheduledAt(settings.posting_interval_minutes);
  const { data: updated, error: updateError } = await supabase
    .from('posts')
    .update({
      status: 'scheduled',
      scheduled_at: scheduledAt,
      last_error: null
    })
    .eq('id', postId)
    .select()
    .single();

  if (updateError) {
    throw new Error(`Could not retry post: ${updateError.message}`);
  }

  return updated;
}

export async function rewritePost(postId: string, mode: RewritePostMode): Promise<Post> {
  const { data: post, error } = await supabase
    .from('posts')
    .select()
    .eq('id', postId)
    .single();

  if (error) {
    throw new Error(`Could not load post: ${error.message}`);
  }

  if (post.status === 'posted') {
    throw new Error('Cannot rewrite a posted post.');
  }

  const settings = await getAgentSettings();
  const voiceExamples = await getVoiceExamples();
  const content = await rewritePostContent(post.content, settings, mode, voiceExamples);
  const risk = scorePostRisk(content);

  const { data: updated, error: updateError } = await supabase
    .from('posts')
    .update({
      content,
      risk_score: risk.score,
      status: 'draft',
      scheduled_at: null,
      last_error: null
    })
    .eq('id', postId)
    .select()
    .single();

  if (updateError) {
    throw new Error(`Could not save rewritten post: ${updateError.message}`);
  }

  const chatId = await getDefaultTelegramChatId();
  await sendApprovalMessage(chatId, postId, content);

  return updated;
}

export async function listRecentPosts(limit = 30): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select()
    .eq('user_id', env.DEFAULT_USER_ID)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Could not load posts: ${error.message}`);
  }

  return data as Post[];
}

async function publishPostToX(post: Post): Promise<Post> {
  try {
    const published = await publishPost(post.content);
    const { data: updated, error: postedError } = await supabase
      .from('posts')
      .update({
        status: 'posted',
        x_post_id: published.id,
        posted_at: new Date().toISOString(),
        last_error: null
      })
      .eq('id', post.id)
      .select()
      .single();

    if (postedError) {
      throw new Error(`Could not mark post as posted: ${postedError.message}`);
    }

    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown X publishing failure.';
    await supabase
      .from('posts')
      .update({ status: 'failed', last_error: message })
      .eq('id', post.id);
    throw new Error(`Post approved but X publishing failed: ${message}`);
  }
}

export async function rejectPost(postId: string): Promise<void> {
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select()
    .eq('id', postId)
    .single();

  if (postError) {
    throw new Error(`Could not load post: ${postError.message}`);
  }

  if (post.status === 'posted') {
    throw new Error('Cannot reject a posted post.');
  }

  if (post.status === 'rejected') {
    return;
  }

  const { error } = await supabase
    .from('posts')
    .update({ status: 'rejected' })
    .eq('id', postId);

  if (error) {
    throw new Error(`Could not reject post: ${error.message}`);
  }

  await logApproval(postId, 'rejected');
}

async function logApproval(postId: string, decision: 'approved' | 'rejected'): Promise<void> {
  const { error } = await supabase
    .from('approval_logs')
    .insert({ post_id: postId, decision, source: 'telegram' });

  if (error) {
    throw new Error(`Could not log approval decision: ${error.message}`);
  }
}

async function getNextScheduledAt(intervalMinutes: number): Promise<string> {
  const { data, error } = await supabase
    .from('posts')
    .select('scheduled_at')
    .eq('user_id', env.DEFAULT_USER_ID)
    .eq('status', 'scheduled')
    .order('scheduled_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Could not load schedule queue: ${error.message}`);
  }

  const now = new Date();
  const latest = data[0]?.scheduled_at ? new Date(data[0].scheduled_at) : null;

  if (!latest) {
    return now.toISOString();
  }

  const base = latest > now ? latest : now;
  return new Date(base.getTime() + intervalMinutes * 60_000).toISOString();
}
