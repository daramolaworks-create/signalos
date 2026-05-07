import OpenAI from 'openai';
import { env } from '../config/env.js';
import type { AgentSettings } from './settings.service.js';

const provider = env.LLM_PROVIDER ?? (env.DEEPSEEK_API_KEY ? 'deepseek' : 'openai');
const apiKey = provider === 'deepseek' ? env.DEEPSEEK_API_KEY : env.OPENAI_API_KEY;
const model = env.LLM_MODEL ?? (provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini');

if (!apiKey) {
  throw new Error('Missing LLM API key.');
}

const openai = new OpenAI({
  apiKey,
  baseURL: provider === 'deepseek' ? 'https://api.deepseek.com' : undefined
});

export type GeneratePostsOptions = {
  topic?: string;
  count?: number;
  settings: AgentSettings;
  voiceExamples?: string[];
};

export type RewritePostMode = 'sharper' | 'shorter' | 'contrarian';

function parseGeneratedPosts(raw: string, count: number): string[] {
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .map((post) => post.replace(/^["']|["']$/g, '').trim())
    .filter((post) => post.length > 0)
    .slice(0, count);
}

export async function generatePosts(options: GeneratePostsOptions): Promise<string[]> {
  const count = options.count ?? options.settings.daily_post_count;
  const topics = options.settings.topics.join(', ');
  const topicLine = options.topic
    ? `Topic: ${options.topic}`
    : `Topic: choose from these interests: ${topics}`;

  const response = await openai.chat.completions.create({
    model,
    temperature: 0.85,
    messages: [
      { role: 'system', content: buildSystemPrompt(options.settings, options.voiceExamples ?? []) },
      {
        role: 'user',
        content: `${topicLine}\n\nReturn exactly ${count} posts, one per line.`
      }
    ]
  });

  const content = response.choices[0]?.message.content;
  if (!content) {
    throw new Error(`${provider} returned no generated content.`);
  }

  const posts = parseGeneratedPosts(content, count).filter((post) => post.length <= 280);
  if (posts.length === 0) {
    throw new Error(`${provider} returned no posts under 280 characters.`);
  }

  return posts;
}

export async function rewritePost(
  content: string,
  settings: AgentSettings,
  mode: RewritePostMode,
  voiceExamples: string[] = []
): Promise<string> {
  const response = await openai.chat.completions.create({
    model,
    temperature: 0.75,
    messages: [
      { role: 'system', content: buildSystemPrompt(settings, voiceExamples) },
      {
        role: 'user',
        content: `Rewrite this post to be ${mode}. Keep it under 280 characters. Return only the rewritten post.\n\n${content}`
      }
    ]
  });

  const rewritten = response.choices[0]?.message.content?.trim().replace(/^["']|["']$/g, '');
  if (!rewritten) {
    throw new Error(`${provider} returned no rewritten content.`);
  }

  if (rewritten.length > 280) {
    throw new Error(`${provider} returned a rewrite over 280 characters.`);
  }

  return rewritten;
}

function buildSystemPrompt(settings: AgentSettings, voiceExamples: string[]): string {
  const examplesBlock = voiceExamples.length
    ? `\nVoice examples to learn from, without copying directly:\n${voiceExamples.map((example) => `- ${example}`).join('\n')}\n`
    : '';

  return `You are writing as this persona: ${settings.persona_name}.

Persona:
${settings.persona_description}

Topics of interest:
${settings.topics.map((topic) => `- ${topic}`).join('\n')}

Style rules:
${settings.style_rules}
${examplesBlock}

Hard rules:
- no emojis
- no hashtags
- no fluff
- no generic motivation
- no marketing-only posts
- each post must be under 280 characters
- each post must contain a non-obvious insight
- write the requested number of options`;
}
