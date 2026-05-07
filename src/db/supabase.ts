import { createClient } from '@supabase/supabase-js';
import type { WebSocketLikeConstructor } from '@supabase/realtime-js';
import WebSocket from 'ws';
import { env } from '../config/env.js';

export type PostStatus = 'draft' | 'approved' | 'scheduled' | 'rejected' | 'posted' | 'failed';

export type Post = {
  id: string;
  user_id: string;
  platform: string;
  type: string;
  content: string;
  status: PostStatus;
  x_post_id: string | null;
  risk_score: number;
  scheduled_at: string | null;
  last_error: string | null;
  created_at: string;
  approved_at: string | null;
  posted_at: string | null;
};

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/rest\/v1\/?$/, '');
}

export const supabase = createClient(
  normalizeSupabaseUrl(env.SUPABASE_URL),
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    realtime: {
      transport: WebSocket as unknown as WebSocketLikeConstructor
    }
  }
);
