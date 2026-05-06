import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateDraftsForApproval } from '../services/post.service.js';

const generateBodySchema = z.object({
  topic: z.string().trim().min(1).max(200).optional()
});

export async function generateRoutes(app: FastifyInstance): Promise<void> {
  app.post('/generate', async (request, reply) => {
    const parsed = generateBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid request body',
        details: parsed.error.flatten()
      });
    }

    const result = await generateDraftsForApproval(parsed.data.topic);

    return {
      ok: true,
      sent_for_approval: result.created.length,
      blocked_for_risk: result.blocked.length,
      drafts: result.created.map((post) => ({
        id: post.id,
        content: post.content,
        risk_score: post.risk_score,
        status: post.status
      })),
      blocked: result.blocked
    };
  });
}
