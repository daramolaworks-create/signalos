import type { FastifyInstance, FastifyRequest } from 'fastify';
import cron from 'node-cron';
import { z } from 'zod';
import { env } from '../config/env.js';
import {
  getAgentSettings,
  getVoiceExamples,
  replaceVoiceExamples,
  updateAgentSettings
} from '../services/settings.service.js';
import {
  approvePost,
  listRecentPosts,
  rejectPost,
  retryPost,
  rewritePost
} from '../services/post.service.js';

const adminSecret = env.ADMIN_PASSWORD ?? env.ADMIN_TOKEN;

const updateSettingsSchema = z.object({
  persona_name: z.string().trim().min(1).max(120),
  persona_description: z.string().trim().min(1).max(2000),
  style_rules: z.string().trim().min(1).max(3000),
  topics: z.array(z.string().trim().min(1).max(100)).min(1).max(30),
  daily_post_count: z.number().int().min(1).max(25),
  posting_interval_minutes: z.number().int().min(1).max(1440),
  schedule_cron: z.string().trim().min(1).max(80),
  timezone: z.string().trim().min(1).max(80),
  risk_threshold: z.number().min(0).max(1),
  voice_examples: z.array(z.string().trim().min(1).max(500)).max(25).optional()
}).superRefine((value, ctx) => {
  if (!cron.validate(value.schedule_cron)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['schedule_cron'],
      message: 'Invalid cron expression'
    });
  }
});

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin', async (request, reply) => {
    return reply.type('text/html').send(renderAdminPage());
  });

  app.post('/admin/login', async (request, reply) => {
    const body = request.body as { password?: string };
    if (!adminSecret || body.password !== adminSecret) {
      return reply.code(401).send({ ok: false, error: 'Invalid password' });
    }

    return { ok: true, token: adminSecret };
  });

  app.get('/admin/settings', async (request, reply) => {
    if (!isAuthorized(request)) {
      return reply.code(401).send({ ok: false, error: 'Unauthorized' });
    }

    return {
      ok: true,
      settings: await getAgentSettings(),
      voice_examples: await getVoiceExamples()
    };
  });

  app.put('/admin/settings', async (request, reply) => {
    if (!isAuthorized(request)) {
      return reply.code(401).send({ ok: false, error: 'Unauthorized' });
    }

    const parsed = updateSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'Invalid settings',
        details: parsed.error.flatten()
      });
    }

    const { voice_examples: voiceExamples, ...settingsInput } = parsed.data;
    const settings = await updateAgentSettings(settingsInput);

    if (voiceExamples) {
      await replaceVoiceExamples(voiceExamples);
    }

    return {
      ok: true,
      settings,
      voice_examples: await getVoiceExamples()
    };
  });

  app.get('/admin/posts', async (request, reply) => {
    if (!isAuthorized(request)) {
      return reply.code(401).send({ ok: false, error: 'Unauthorized' });
    }

    return {
      ok: true,
      posts: await listRecentPosts()
    };
  });

  app.post('/admin/posts/:id/approve', async (request, reply) => {
    if (!isAuthorized(request)) {
      return reply.code(401).send({ ok: false, error: 'Unauthorized' });
    }

    const { id } = request.params as { id: string };
    return { ok: true, post: await approvePost(id) };
  });

  app.post('/admin/posts/:id/reject', async (request, reply) => {
    if (!isAuthorized(request)) {
      return reply.code(401).send({ ok: false, error: 'Unauthorized' });
    }

    const { id } = request.params as { id: string };
    await rejectPost(id);
    return { ok: true };
  });

  app.post('/admin/posts/:id/retry', async (request, reply) => {
    if (!isAuthorized(request)) {
      return reply.code(401).send({ ok: false, error: 'Unauthorized' });
    }

    const { id } = request.params as { id: string };
    return { ok: true, post: await retryPost(id) };
  });

  app.post('/admin/posts/:id/rewrite', async (request, reply) => {
    if (!isAuthorized(request)) {
      return reply.code(401).send({ ok: false, error: 'Unauthorized' });
    }

    const { id } = request.params as { id: string };
    const body = request.body as { mode?: 'sharper' | 'shorter' | 'contrarian' };
    return { ok: true, post: await rewritePost(id, body.mode ?? 'sharper') };
  });
}

function isAuthorized(request: FastifyRequest): boolean {
  if (!adminSecret) {
    return false;
  }

  const authHeader = request.headers.authorization;
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;
  const query = request.query as { token?: string };

  return headerToken === adminSecret || query.token === adminSecret;
}

function renderAdminPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SignalOS Settings</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f7f8fa; color: #15171a; }
    main { max-width: 980px; margin: 0 auto; padding: 32px 20px 56px; }
    header { display: flex; justify-content: space-between; align-items: end; gap: 16px; margin-bottom: 24px; }
    h1 { margin: 0; font-size: 30px; letter-spacing: 0; }
    p { color: #5b626b; line-height: 1.5; }
    form { display: grid; gap: 18px; }
    section { background: #fff; border: 1px solid #dde1e6; border-radius: 8px; padding: 18px; display: grid; gap: 14px; }
    h2 { margin: 0; font-size: 16px; }
    label { display: grid; gap: 7px; font-size: 13px; font-weight: 650; color: #30363d; }
    input, textarea, select { width: 100%; box-sizing: border-box; border: 1px solid #c8cdd3; border-radius: 6px; padding: 10px 11px; font: inherit; background: #fff; color: #15171a; }
    textarea { min-height: 112px; resize: vertical; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
    .login { max-width: 420px; margin: 84px auto; }
    .hidden { display: none; }
    .actions { display: flex; justify-content: flex-end; gap: 10px; position: sticky; bottom: 0; background: linear-gradient(180deg, rgba(247,248,250,0), #f7f8fa 28%); padding-top: 24px; }
    button { border: 1px solid #111; background: #111; color: #fff; border-radius: 6px; padding: 10px 14px; font: inherit; font-weight: 700; cursor: pointer; }
    button.secondary { background: #fff; color: #111; }
    details { border: 1px solid #dde1e6; border-radius: 6px; padding: 12px; }
    summary { cursor: pointer; font-weight: 700; }
    .post-list { display: grid; gap: 10px; }
    .post { border: 1px solid #dde1e6; border-radius: 8px; padding: 12px; display: grid; gap: 10px; }
    .post-meta { display: flex; flex-wrap: wrap; gap: 8px; color: #5b626b; font-size: 12px; }
    .post-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .post-actions button { padding: 7px 10px; font-size: 13px; }
    .pill { border: 1px solid #c8cdd3; border-radius: 999px; padding: 2px 8px; background: #f7f8fa; }
    .error-text { color: #b42318; font-size: 12px; }
    #status { min-height: 22px; font-size: 14px; color: #216e39; }
    .hint { margin: 0; font-size: 12px; color: #6b7280; }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } header { display: block; } }
  </style>
</head>
<body>
  <main>
    <section id="login-panel" class="login hidden">
      <h1>SignalOS Settings</h1>
      <p>Enter the admin password to manage persona, topics, and cadence.</p>
      <form id="login-form">
        <label>Admin password
          <input name="password" type="password" autocomplete="current-password" required />
        </label>
        <button type="submit">Log In</button>
        <p id="login-status" class="hint"></p>
      </form>
    </section>

    <div id="app-panel" class="hidden">
      <header>
      <div>
        <h1>SignalOS Settings</h1>
        <p>Shape the agent's voice, interests, daily volume, and schedule. Publishing still requires Telegram approval.</p>
      </div>
      <p id="status"></p>
      </header>

      <form id="settings-form">
      <section>
        <h2>Persona</h2>
        <label>Persona name
          <input name="persona_name" maxlength="120" required />
        </label>
        <label>Persona description
          <textarea name="persona_description" maxlength="2000" required></textarea>
        </label>
        <label>Style rules
          <textarea name="style_rules" maxlength="3000" required></textarea>
        </label>
      </section>

      <section>
        <h2>Interests</h2>
        <label>Topics, one per line
          <textarea name="topics" required></textarea>
        </label>
        <label>Voice examples, one per line
          <textarea name="voice_examples" placeholder="Paste posts or lines that sound like you"></textarea>
        </label>
      </section>

      <section>
        <h2>Cadence</h2>
        <div class="grid">
          <label>Daily drafts
            <input name="daily_post_count" type="number" min="1" max="25" required />
          </label>
          <label>Posting gap after approval
            <select name="posting_interval_minutes" required>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">90 minutes</option>
              <option value="120">2 hours</option>
              <option value="180">3 hours</option>
              <option value="240">4 hours</option>
            </select>
          </label>
          <label>Frequency
            <select name="schedule_frequency" required>
              <option value="daily">Every day</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekly">Once a week</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <label id="weekday-field">Day
            <select name="schedule_weekday">
              <option value="1">Monday</option>
              <option value="2">Tuesday</option>
              <option value="3">Wednesday</option>
              <option value="4">Thursday</option>
              <option value="5">Friday</option>
              <option value="6">Saturday</option>
              <option value="0">Sunday</option>
            </select>
          </label>
          <label>Time
            <input name="schedule_time" type="time" required />
          </label>
          <label>Timezone
            <input name="timezone" required />
          </label>
        </div>
        <details id="advanced-schedule">
          <summary>Advanced schedule</summary>
          <label>Cron expression
            <input name="schedule_cron" required />
          </label>
          <p class="hint">This is generated from the friendly schedule controls. Edit only if you know cron.</p>
        </details>
      </section>

      <section>
        <h2>Safety</h2>
        <label>Risk threshold
          <input name="risk_threshold" type="number" min="0" max="1" step="0.05" required />
        </label>
      </section>

      <section>
        <h2>Draft Queue</h2>
        <p class="hint">Approve, reject, rewrite, or retry recent posts. Telegram remains the main approval surface.</p>
        <div class="post-actions">
          <button class="secondary" type="button" id="refresh-posts">Refresh Queue</button>
        </div>
        <div id="post-list" class="post-list"></div>
      </section>

      <div class="actions">
        <button class="secondary" type="button" id="reload">Reload</button>
        <button type="submit">Save Settings</button>
      </div>
      </form>
    </div>
  </main>

  <script>
    let token = new URLSearchParams(window.location.search).get('token') || window.localStorage.getItem('signalos_admin_token') || '';
    if (token) window.localStorage.setItem('signalos_admin_token', token);
    let headers = { 'content-type': 'application/json', authorization: 'Bearer ' + token };
    const loginPanel = document.querySelector('#login-panel');
    const appPanel = document.querySelector('#app-panel');
    const loginForm = document.querySelector('#login-form');
    const loginStatus = document.querySelector('#login-status');
    const form = document.querySelector('#settings-form');
    const statusEl = document.querySelector('#status');
    const frequencyField = form.elements.namedItem('schedule_frequency');
    const weekdayField = document.querySelector('#weekday-field');
    const advancedSchedule = document.querySelector('#advanced-schedule');

    function setStatus(message, isError = false) {
      statusEl.textContent = message;
      statusEl.style.color = isError ? '#b42318' : '#216e39';
    }

    function showLogin(message = '') {
      loginPanel.classList.remove('hidden');
      appPanel.classList.add('hidden');
      loginStatus.textContent = message;
    }

    function showApp() {
      loginPanel.classList.add('hidden');
      appPanel.classList.remove('hidden');
    }

    async function loadSettings() {
      setStatus('Loading...');
      const response = await fetch('/admin/settings', { headers });
      const payload = await response.json();
      if (response.status === 401) {
        window.localStorage.removeItem('signalos_admin_token');
        token = '';
        showLogin();
        return;
      }
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not load settings');
      const settings = payload.settings;
      for (const [key, value] of Object.entries(settings)) {
        const field = form.elements.namedItem(key);
        if (!field) continue;
        field.value = Array.isArray(value) ? value.join('\\n') : value;
      }
      form.voice_examples.value = (payload.voice_examples || []).join('\\n');
      applyFriendlySchedule(settings.schedule_cron);
      updateScheduleVisibility();
      showApp();
      setStatus('Loaded');
      await loadPosts();
    }

    function readSettings() {
      const scheduleCron = buildCron();
      form.schedule_cron.value = scheduleCron;
      return {
        persona_name: form.persona_name.value.trim(),
        persona_description: form.persona_description.value.trim(),
        style_rules: form.style_rules.value.trim(),
        topics: form.topics.value.split('\\n').map((topic) => topic.trim()).filter(Boolean),
        voice_examples: form.voice_examples.value.split('\\n').map((example) => example.trim()).filter(Boolean),
        daily_post_count: Number(form.daily_post_count.value),
        posting_interval_minutes: Number(form.posting_interval_minutes.value),
        schedule_cron: scheduleCron,
        timezone: form.timezone.value.trim(),
        risk_threshold: Number(form.risk_threshold.value)
      };
    }

    function buildCron() {
      const [hour, minute] = form.schedule_time.value.split(':');
      if (form.schedule_frequency.value === 'advanced') return form.schedule_cron.value.trim();
      if (form.schedule_frequency.value === 'weekdays') return minute + ' ' + hour + ' * * 1-5';
      if (form.schedule_frequency.value === 'weekly') return minute + ' ' + hour + ' * * ' + form.schedule_weekday.value;
      return minute + ' ' + hour + ' * * *';
    }

    function applyFriendlySchedule(cron) {
      const parts = cron.split(/\\s+/);
      form.schedule_cron.value = cron;
      if (parts.length !== 5) {
        form.schedule_frequency.value = 'advanced';
        form.schedule_time.value = '09:00';
        return;
      }

      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
      form.schedule_time.value = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
      if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
        form.schedule_frequency.value = 'daily';
      } else if (dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5') {
        form.schedule_frequency.value = 'weekdays';
      } else if (dayOfMonth === '*' && month === '*' && /^[0-6]$/.test(dayOfWeek)) {
        form.schedule_frequency.value = 'weekly';
        form.schedule_weekday.value = dayOfWeek;
      } else {
        form.schedule_frequency.value = 'advanced';
      }
    }

    function updateScheduleVisibility() {
      weekdayField.style.display = form.schedule_frequency.value === 'weekly' ? 'grid' : 'none';
      advancedSchedule.open = form.schedule_frequency.value === 'advanced';
    }

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      loginStatus.textContent = 'Checking...';
      try {
        const response = await fetch('/admin/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password: loginForm.password.value })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || 'Login failed');
        token = payload.token;
        window.localStorage.setItem('signalos_admin_token', token);
        headers = { 'content-type': 'application/json', authorization: 'Bearer ' + token };
        await loadSettings();
      } catch (error) {
        loginStatus.textContent = error.message;
      }
    });

    frequencyField.addEventListener('change', updateScheduleVisibility);
    form.schedule_time.addEventListener('change', () => {
      if (form.schedule_frequency.value !== 'advanced') form.schedule_cron.value = buildCron();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setStatus('Saving...');
      try {
        const response = await fetch('/admin/settings', {
          method: 'PUT',
          headers,
          body: JSON.stringify(readSettings())
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not save settings');
        setStatus('Saved');
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    document.querySelector('#reload').addEventListener('click', () => {
      loadSettings().catch((error) => setStatus(error.message, true));
    });

    document.querySelector('#refresh-posts').addEventListener('click', () => {
      loadPosts().catch((error) => setStatus(error.message, true));
    });

    async function loadPosts() {
      const response = await fetch('/admin/posts', { headers });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not load posts');
      renderPosts(payload.posts);
    }

    function renderPosts(posts) {
      const list = document.querySelector('#post-list');
      if (!posts.length) {
        list.innerHTML = '<p class="hint">No posts yet.</p>';
        return;
      }

      list.innerHTML = posts.map((post) => {
        const xLink = post.x_post_id ? '<a href="https://x.com/i/web/status/' + post.x_post_id + '" target="_blank" rel="noreferrer">View on X</a>' : '';
        const scheduled = post.scheduled_at ? '<span class="pill">Scheduled ' + new Date(post.scheduled_at).toLocaleString() + '</span>' : '';
        const error = post.last_error ? '<div class="error-text">' + escapeHtml(post.last_error.slice(0, 240)) + '</div>' : '';
        return '<article class="post" data-id="' + post.id + '">' +
          '<div>' + escapeHtml(post.content) + '</div>' +
          '<div class="post-meta">' +
            '<span class="pill">' + post.status + '</span>' +
            '<span class="pill">Risk ' + Number(post.risk_score).toFixed(2) + '</span>' +
            scheduled +
            '<span>' + new Date(post.created_at).toLocaleString() + '</span>' +
            xLink +
          '</div>' +
          error +
          '<div class="post-actions">' +
            actionButton(post, 'approve', 'Approve') +
            actionButton(post, 'reject', 'Reject') +
            actionButton(post, 'rewrite', 'Rewrite sharper', 'sharper') +
            actionButton(post, 'rewrite', 'Make shorter', 'shorter') +
            actionButton(post, 'retry', 'Retry') +
          '</div>' +
        '</article>';
      }).join('');
    }

    function actionButton(post, action, label, mode = '') {
      const disabled =
        (action === 'approve' && !['draft', 'failed'].includes(post.status)) ||
        (action === 'reject' && post.status === 'posted') ||
        (action === 'retry' && !['failed', 'scheduled'].includes(post.status)) ||
        (action === 'rewrite' && post.status === 'posted');
      return '<button class="secondary" type="button" data-action="' + action + '" data-mode="' + mode + '" data-id="' + post.id + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button>';
    }

    document.querySelector('#post-list').addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const id = button.dataset.id;
      const action = button.dataset.action;
      const body = action === 'rewrite' ? { mode: button.dataset.mode } : {};
      setStatus('Working...');
      const response = await fetch('/admin/posts/' + id + '/' + action, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setStatus(payload.error || 'Action failed', true);
        return;
      }
      setStatus('Updated');
      await loadPosts();
    });

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    if (token) {
      loadSettings().catch((error) => setStatus(error.message, true));
    } else {
      showLogin();
    }
  </script>
</body>
</html>`;
}
