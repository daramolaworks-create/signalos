import { env } from '../config/env.js';
import { supabase, type Post } from '../db/supabase.js';
import { generatePosts } from './llm.service.js';
import { scorePostRisk } from './safety.service.js';
import { sendApprovalMessage } from './telegram.service.js';
import { publishPost } from './x.service.js';

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

export async function generateDraftsForApproval(topic?: string): Promise<GenerateDraftsResult> {
  const chatId = await getDefaultTelegramChatId();
  const generated = await generatePosts(topic);
  const created: Post[] = [];
  const blocked: GenerateDraftsResult['blocked'] = [];

  for (const content of generated) {
    const risk = scorePostRisk(content);
    const draft = await createDraft(content, risk.score);

    if (risk.score > 0.7) {
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

  if (post.risk_score > 0.7) {
    throw new Error('Post risk score is too high for approval.');
  }

  const approvedAt = new Date().toISOString();
  const { error: approveError } = await supabase
    .from('posts')
    .update({ status: 'approved', approved_at: approvedAt })
    .eq('id', postId);

  if (approveError) {
    throw new Error(`Could not approve post: ${approveError.message}`);
  }

  await logApproval(postId, 'approved');

  try {
    const published = await publishPost(post.content);
    const { data: updated, error: postedError } = await supabase
      .from('posts')
      .update({
        status: 'posted',
        x_post_id: published.id,
        posted_at: new Date().toISOString()
      })
      .eq('id', postId)
      .select()
      .single();

    if (postedError) {
      throw new Error(`Could not mark post as posted: ${postedError.message}`);
    }

    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown X publishing failure.';
    await supabase.from('posts').update({ status: 'failed' }).eq('id', postId);
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
