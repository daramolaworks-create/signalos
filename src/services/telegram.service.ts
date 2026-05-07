import { env } from '../config/env.js';

export type TelegramCallbackPayload = {
  callback_query?: {
    id: string;
    data?: string;
    message?: {
      chat: {
        id: number;
      };
    };
  };
};

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

const telegramApiBase = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

async function telegramRequest<T>(method: string, body: unknown): Promise<T> {
  const response = await fetch(`${telegramApiBase}/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json()) as TelegramResponse<T>;
  if (!response.ok || !payload.ok) {
    throw new Error(`Telegram ${method} failed: ${payload.description ?? response.statusText}`);
  }

  return payload.result as T;
}

export async function sendApprovalMessage(chatId: string, postId: string, content: string): Promise<void> {
  await telegramRequest('sendMessage', {
    chat_id: chatId,
    text: content,
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Approve', callback_data: `approve:${postId}` },
          { text: 'Reject', callback_data: `reject:${postId}` }
        ],
        [
          { text: 'Rewrite sharper', callback_data: `rewrite_sharper:${postId}` },
          { text: 'Make shorter', callback_data: `rewrite_shorter:${postId}` }
        ]
      ]
    }
  });
}

export async function answerCallbackQuery(callbackQueryId: string, text: string): Promise<void> {
  await telegramRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text
  });
}
