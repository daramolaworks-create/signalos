import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const port = process.env.PORT ?? '3000';

if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is required.');
}

const telegramBaseUrl = `https://api.telegram.org/bot${token}`;
const localWebhookUrl = `http://localhost:${port}/telegram/webhook`;

type TelegramUpdate = {
  update_id: number;
  callback_query?: unknown;
};

async function telegram<T>(method: string, body?: unknown): Promise<T> {
  const response = await fetch(`${telegramBaseUrl}/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!response.ok || !payload.ok) {
    throw new Error(`Telegram ${method} failed: ${payload.description ?? response.statusText}`);
  }

  return payload.result as T;
}

async function forwardUpdate(update: TelegramUpdate): Promise<void> {
  const response = await fetch(localWebhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(update)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Local webhook failed: ${message}`);
  }
}

async function getInitialOffset(): Promise<number | undefined> {
  const updates = await telegram<TelegramUpdate[]>('getUpdates', { timeout: 0 });
  const lastUpdate = updates.at(-1);
  return lastUpdate ? lastUpdate.update_id + 1 : undefined;
}

async function main(): Promise<void> {
  let offset = await getInitialOffset();
  console.log('Telegram poller running. Old queued updates ignored; tap a button now to process it.');

  while (true) {
    const updates = await telegram<TelegramUpdate[]>('getUpdates', {
      offset,
      timeout: 25,
      allowed_updates: ['callback_query']
    });

    for (const update of updates) {
      offset = update.update_id + 1;
      if (!update.callback_query) {
        continue;
      }

      await forwardUpdate(update);
      console.log(`Processed Telegram callback update ${update.update_id}.`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
