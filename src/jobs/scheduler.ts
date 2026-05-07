import cron from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import type { ScheduledTask } from 'node-cron';
import { env } from '../config/env.js';
import { runDailyGenerator } from './daily-generator.job.js';
import { getAgentSettings, type AgentSettings } from '../services/settings.service.js';
import { publishScheduledPosts } from '../services/post.service.js';

export function startDailyGeneratorScheduler(logger: FastifyBaseLogger): void {
  startPublisherScheduler(logger);

  if (!env.DAILY_GENERATOR_ENABLED) {
    logger.info('Daily generator scheduler disabled.');
    return;
  }

  void startDynamicScheduler(logger);
}

function startPublisherScheduler(logger: FastifyBaseLogger): void {
  cron.schedule('* * * * *', async () => {
    try {
      const published = await publishScheduledPosts();
      if (published.length > 0) {
        logger.info({ count: published.length }, 'Published scheduled posts.');
      }
    } catch (error) {
      logger.error(error, 'Scheduled publisher failed.');
    }
  });

  logger.info('Scheduled publisher enabled.');
}

async function startDynamicScheduler(logger: FastifyBaseLogger): Promise<void> {
  let activeTask: ScheduledTask | null = null;
  let activeKey = '';

  async function refresh(): Promise<void> {
    try {
      const settings = await getAgentSettings();
      const key = getScheduleKey(settings);

      if (key === activeKey) {
        return;
      }

      if (!cron.validate(settings.schedule_cron)) {
        logger.error({ cron: settings.schedule_cron }, 'Daily generator schedule is invalid.');
        return;
      }

      if (activeTask) {
        await activeTask.destroy();
      }

      activeTask = cron.schedule(
        settings.schedule_cron,
        async () => {
          logger.info(
            {
              topics: settings.topics,
              count: settings.daily_post_count
            },
            'Running daily generator.'
          );

          try {
            await runDailyGenerator(settings.topics.join(', '), settings.daily_post_count);
            logger.info('Daily generator completed.');
          } catch (error) {
            logger.error(error, 'Daily generator failed.');
          }
        },
        {
          timezone: settings.timezone
        }
      );

      activeKey = key;
      logger.info(
        {
          cron: settings.schedule_cron,
          timezone: settings.timezone,
          count: settings.daily_post_count
        },
        'Daily generator scheduler enabled.'
      );
    } catch (error) {
      logger.error(error, 'Could not refresh daily generator scheduler.');
    }
  }

  await refresh();
  setInterval(() => {
    void refresh();
  }, 60_000).unref();
}

function getScheduleKey(settings: AgentSettings): string {
  return [
    settings.schedule_cron,
    settings.timezone,
    settings.daily_post_count,
    settings.topics.join('|')
  ].join('::');
}
