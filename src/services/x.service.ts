import { TwitterApi, type TwitterApiReadWrite } from 'twitter-api-v2';
import { env } from '../config/env.js';

export type PublishResult = {
  id: string;
};

function getXClient(): TwitterApiReadWrite {
  const missing = [
    ['X_API_KEY', env.X_API_KEY],
    ['X_API_SECRET', env.X_API_SECRET],
    ['X_ACCESS_TOKEN', env.X_ACCESS_TOKEN],
    ['X_ACCESS_SECRET', env.X_ACCESS_SECRET]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing X API credentials: ${missing.join(', ')}`);
  }

  return new TwitterApi({
    appKey: env.X_API_KEY as string,
    appSecret: env.X_API_SECRET as string,
    accessToken: env.X_ACCESS_TOKEN as string,
    accessSecret: env.X_ACCESS_SECRET as string
  }).readWrite;
}

export async function publishPost(content: string): Promise<PublishResult> {
  if (content.length > 280) {
    throw new Error('X posts must be 280 characters or fewer.');
  }

  const result = await callXApi(() => getXClient().v2.tweet(content));
  const id = result.data.id;

  if (!id) {
    throw new Error('X API did not return a post id.');
  }

  return { id };
}

async function callXApi<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new Error(`X API publish failed: ${formatXError(error)}`);
  }
}

function formatXError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unknown error';
  }

  const details = error as Error & {
    code?: number;
    data?: unknown;
    errors?: unknown;
    rateLimitError?: boolean;
  };

  const parts = [error.message];

  if (details.code) {
    parts.push(`code=${details.code}`);
  }

  if (details.data) {
    parts.push(`data=${JSON.stringify(details.data)}`);
  }

  if (details.errors) {
    parts.push(`errors=${JSON.stringify(details.errors)}`);
  }

  if (details.rateLimitError) {
    parts.push('rateLimitError=true');
  }

  return parts.join(' | ');
}

// TODO: Add a platform adapter interface before introducing LinkedIn publishing.
