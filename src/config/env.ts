import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1).optional(),
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  LLM_PROVIDER: z.enum(['openai', 'deepseek']).optional(),
  LLM_MODEL: z.string().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/, {
    message: 'Telegram bot token should look like 123456789:ABC...'
  }),
  X_API_KEY: z.string().optional(),
  X_API_SECRET: z.string().optional(),
  X_ACCESS_TOKEN: z.string().optional(),
  X_ACCESS_SECRET: z.string().optional(),
  DEFAULT_USER_ID: z.string().uuid(),
  PORT: z.coerce.number().int().positive().default(3000)
}).superRefine((value, ctx) => {
  if (!value.OPENAI_API_KEY && !value.DEEPSEEK_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OPENAI_API_KEY'],
      message: 'Set OPENAI_API_KEY or DEEPSEEK_API_KEY'
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${formatted}`);
}

export const env = parsed.data;
