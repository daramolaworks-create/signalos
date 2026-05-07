# SignalOS

SignalOS is a human-approved personal distribution agent for creating, approving, scheduling, and publishing high-signal posts to X. This MVP intentionally avoids full autopilot: every generated post must be approved in Telegram before it is published.

## Stack

- Node.js, TypeScript, Fastify
- Supabase Postgres with pgvector enabled
- Telegram bot approval interface
- X API publishing via OAuth 1.0a credentials
- OpenAI for content generation
- Docker and Railway-ready deployment

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DEEPSEEK_API_KEY=
# OPENAI_API_KEY=
TELEGRAM_BOT_TOKEN=
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_SECRET=
DEFAULT_USER_ID=
ADMIN_PASSWORD=
PORT=3000

# Optional daily draft generation.
DAILY_GENERATOR_ENABLED=false
DAILY_GENERATOR_CRON=0 9 * * *
DAILY_GENERATOR_TIMEZONE=Europe/London
DAILY_GENERATOR_TOPIC=evergreen systems, incentives, and technology
DAILY_GENERATOR_POST_COUNT=10
```

## Supabase Schema

1. Create a Supabase project.
2. Open the SQL editor.
3. Run the contents of `src/db/schema.sql`.
4. Insert a user row and copy its `id` into `DEFAULT_USER_ID`.
5. Set that user's `telegram_chat_id` so SignalOS knows where to send approvals.

Example:

```sql
insert into users (telegram_chat_id, x_user_id)
values ('123456789', 'your_x_user_id')
returning id;
```

## Telegram Webhook

Create a Telegram bot with BotFather, then set the webhook to your deployed URL:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "content-type: application/json" \
  -d '{"url":"https://YOUR_DOMAIN/telegram/webhook"}'
```

To find your chat id, send your bot a message and inspect:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates"
```

For local development, Telegram cannot call `localhost` directly. Either expose your app with a public tunnel and set the webhook to that URL, or run the local poller in a second terminal:

```bash
npm run dev
npm run telegram:poll
```

The poller ignores old queued button taps when it starts, then forwards new Telegram approval callbacks to `http://localhost:3000/telegram/webhook`.

## X API Setup

Create an X developer app with write permissions and OAuth 1.0a user context enabled. Add these credentials to `.env`:

- `X_API_KEY`
- `X_API_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_SECRET`

Publishing is isolated in `src/services/x.service.ts` so future platform adapters can replace or extend it.

## Run Locally

```bash
npm run dev
```

Settings interface:

```text
http://localhost:3000/admin
```

The settings interface controls persona, style rules, topics, voice examples, daily draft count, posting gap, schedule, and the recent draft queue.

Generate drafts:

```bash
curl -X POST http://localhost:3000/generate \
  -H "content-type: application/json" \
  -d '{"topic":"leverage and decision-making","count":10}'
```

Health check:

```bash
curl http://localhost:3000/health
```

## Docker

```bash
docker build -t signalos .
docker run --env-file .env -p 3000:3000 signalos
```

## Railway Deployment

1. Create a Railway project from this repository.
2. Add the environment variables from `.env.example`.
3. Ensure Railway runs `npm run build` and starts with `npm start`.
4. Set the Telegram webhook to `https://YOUR_RAILWAY_DOMAIN/telegram/webhook`.

Open the production settings interface:

```text
https://YOUR_RAILWAY_DOMAIN/admin
```

## Daily Generation

SignalOS can automatically generate drafts every day while keeping publishing human-approved. Enable it with:

```bash
DAILY_GENERATOR_ENABLED=true
DAILY_GENERATOR_CRON=0 9 * * *
DAILY_GENERATOR_TIMEZONE=Europe/London
DAILY_GENERATOR_POST_COUNT=10
```

At the scheduled time, SignalOS generates 10 drafts, stores them in Supabase, and sends them to Telegram. Nothing posts to X until you tap Approve.

You can change persona, topics, daily count, schedule, timezone, and risk threshold from `/admin`.

Approved posts are queued and published at the configured posting gap. The admin draft queue can approve, reject, rewrite, and retry posts.

## Notes

- Posts with `risk_score > 0.7` are stored but not sent for Telegram approval.
- `performance_metrics` is a placeholder for future analytics ingestion.
- TODO: add a LinkedIn adapter behind the same publishing boundary.
- TODO: add scheduled analytics sync for impressions, likes, replies, and reposts.
