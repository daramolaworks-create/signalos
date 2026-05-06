import type { FastifyInstance } from 'fastify';
import { answerCallbackQuery, type TelegramCallbackPayload } from '../services/telegram.service.js';
import { approvePost, rejectPost } from '../services/post.service.js';

function parseCallbackData(data: string | undefined): { action: 'approve' | 'reject'; postId: string } | null {
  if (!data) {
    return null;
  }

  const [action, postId] = data.split(':');
  if ((action !== 'approve' && action !== 'reject') || !postId) {
    return null;
  }

  return { action, postId };
}

export async function telegramRoutes(app: FastifyInstance): Promise<void> {
  app.post('/telegram/webhook', async (request, reply) => {
    const payload = request.body as TelegramCallbackPayload;
    const callback = payload.callback_query;

    if (!callback) {
      return { ok: true, ignored: true };
    }

    const parsed = parseCallbackData(callback.data);
    if (!parsed) {
      await answerCallbackQuery(callback.id, 'Unsupported action.');
      return reply.code(400).send({ ok: false, error: 'Unsupported callback data.' });
    }

    if (parsed.action === 'approve') {
      await approvePost(parsed.postId);
      await answerCallbackQuery(callback.id, 'Approved and published to X.');
      return { ok: true, decision: 'approved' };
    }

    await rejectPost(parsed.postId);
    await answerCallbackQuery(callback.id, 'Rejected.');
    return { ok: true, decision: 'rejected' };
  });
}
