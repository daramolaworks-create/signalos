import { generateDraftsForApproval } from '../services/post.service.js';

export async function runDailyGenerator(topic = 'evergreen systems, incentives, and technology'): Promise<void> {
  await generateDraftsForApproval(topic);
}

// TODO: Wire this into Railway cron, GitHub Actions, or another scheduler when ready.
