import type { FastifyInstance } from 'fastify';
import { answerCallbackQuery, type TelegramCallbackPayload } from '../services/telegram.service.js';
import { approvePost, rejectPost, rewritePost } from '../services/post.service.js';

type TelegramAction = 'approve' | 'reject' | 'rewrite_sharper' | 'rewrite_shorter';

function parseCallbackData(data: string | undefined): { action: TelegramAction; postId: string } | null {
  if (!data) {
    return null;
  }

  const [action, postId] = data.split(':');
  if (
    (
      action !== 'approve' &&
      action !== 'reject' &&
      action !== 'rewrite_sharper' &&
      action !== 'rewrite_shorter'
    ) ||
    !postId
  ) {
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
      try {
        const post = await approvePost(parsed.postId);
        await answerCallbackQuery(
          callback.id,
          post.status === 'posted' ? 'Already posted.' : 'Approved and scheduled.'
        );
        return { ok: true, decision: 'approved' };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown publishing failure.';
        request.log.error(error);
        await answerCallbackQuery(callback.id, `Approved, but publishing failed: ${message.slice(0, 140)}`);
        return { ok: false, decision: 'approved', error: message };
      }
    }

    if (parsed.action === 'rewrite_sharper' || parsed.action === 'rewrite_shorter') {
      const mode = parsed.action === 'rewrite_sharper' ? 'sharper' : 'shorter';
      await rewritePost(parsed.postId, mode);
      await answerCallbackQuery(callback.id, 'Rewritten draft sent.');
      return { ok: true, decision: parsed.action };
    }

    await rejectPost(parsed.postId);
    await answerCallbackQuery(callback.id, 'Rejected.');
    return { ok: true, decision: 'rejected' };
  });
}
