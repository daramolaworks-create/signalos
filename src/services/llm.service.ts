import OpenAI from 'openai';
import { env } from '../config/env.js';

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

const systemPrompt = `You are writing for a sharp systems thinker.
Style: compressed, high-signal, philosophical, direct.
Inspired by Naval Ravikant and Marc Andreessen, but do not imitate them directly.

Themes:
- leverage
- incentives
- wealth
- power
- technology
- systems
- decision-making
- capital
- human behaviour

Rules:
- no emojis
- no hashtags
- no fluff
- no generic motivation
- no marketing-only posts
- each post must be under 280 characters
- each post must contain a non-obvious insight
- write 5 options`;

function parseGeneratedPosts(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .map((post) => post.replace(/^["']|["']$/g, '').trim())
    .filter((post) => post.length > 0)
    .slice(0, 5);
}

export async function generatePosts(topic?: string): Promise<string[]> {
  const topicLine = topic ? `Topic: ${topic}` : 'Topic: choose a timely, evergreen systems idea.';

  const response = await openai.chat.completions.create({
    model,
    temperature: 0.85,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `${topicLine}\n\nReturn exactly 5 posts, one per line.`
      }
    ]
  });

  const content = response.choices[0]?.message.content;
  if (!content) {
    throw new Error(`${provider} returned no generated content.`);
  }

  const posts = parseGeneratedPosts(content).filter((post) => post.length <= 280);
  if (posts.length === 0) {
    throw new Error(`${provider} returned no posts under 280 characters.`);
  }

  return posts;
}
