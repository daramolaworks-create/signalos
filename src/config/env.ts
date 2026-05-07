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
  ADMIN_PASSWORD: z.string().min(8).optional(),
  ADMIN_TOKEN: z.string().min(16).optional(),
  DAILY_GENERATOR_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  DAILY_GENERATOR_CRON: z.string().min(1).default('0 9 * * *'),
  DAILY_GENERATOR_TIMEZONE: z.string().min(1).default('Europe/London'),
  DAILY_GENERATOR_TOPIC: z.string().min(1).default('evergreen systems, incentives, and technology'),
  DAILY_GENERATOR_POST_COUNT: z.coerce.number().int().min(1).max(25).default(10),
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
