(function () {
  'use strict';
  const host = document.getElementById('ss-sick-calls');
  const base = window.__KOHA_API_BASE__;
  const token = window.__KOHA_CSRF_TOKEN__;
  if (!host || !base) return;

  const node = (tag, text, cls) => {
    const el = document.createElement(tag);
    if (text != null) el.textContent = String(text);
    if (cls) el.className = cls;
    return el;
  };
  async function request(params, data) {
    const query = new URLSearchParams({ endpoint: 'sick_calls', ...params });
    const options = { credentials: 'same-origin', cache: 'no-store' };
    if (data) {
      const bytes = new TextEncoder().encode(JSON.stringify(data));
      let binary = '';
      bytes.forEach(b => { binary += String.fromCharCode(b); });
      query.set('_method', 'POST');
      options.headers = {
        'X-CSRF-TOKEN': token || '',
        'X-Staffsched-Payload': btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      };
    }
    const response = await fetch(base + '&' + query.toString(), options);
    const result = await response.json().catch(() => {
      throw new Error(response.status === 403
        ? 'Koha blocked the request before it reached the plugin. Ask your Koha administrator to check plugin access.'
        : 'The server returned a non-JSON response.');
    });
    if (!response.ok) throw new Error(result.error || 'Request failed.');
    return result;
  }
  async function getMe() {
    const response = await fetch(base + '&endpoint=me', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('Sign in to Staff Scheduler to use sick-call reporting.');
    return response.json();
  }
  function dateTime(value) {
    return value ? value.replace('T', ' ').slice(0, 16) : '';
  }
  function dateRange(report) {
    return report.start_date === report.end_date ? report.start_date : report.start_date + ' through ' + report.end_date;
  }
  function status(report) {
    return report.acknowledged_at
      ? 'Acknowledged by ' + (report.acknowledged_name || 'supervisor') + ' on ' + dateTime(report.acknowledged_at)
      : 'Awaiting acknowledgement';
  }
  function showMessage(text, error) {
    message.textContent = text;
    message.classList.toggle('error', !!error);
    message.hidden = false;
  }
  function renderList(container, reports, supervisor) {
    container.replaceChildren();
    if (!reports.length) {
      container.append(node('p', supervisor ? 'No unacknowledged reports.' : 'No reports yet.'));
      return;
    }
    const list = node('ul', null, 'sc-list');
    reports.forEach(report => {
      const item = node('li');
      item.append(node('strong', (supervisor ? report.staff_name + ' — ' : '') + dateRange(report)));
      item.append(node('div', 'Submitted ' + dateTime(report.created_at) + ' · ' + status(report), 'sc-meta'));
      if (report.note) item.append(node('div', report.note, 'sc-note'));
      if (supervisor && !report.acknowledged_at) {
        const button = node('button', 'Acknowledge');
        button.type = 'button';
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            await request({ op: 'acknowledge' }, { id: report.id });
            showMessage('Report acknowledged.');
            await refresh();
          } catch (err) {
            showMessage(err.message, true);
            button.disabled = false;
          }
        });
        item.append(button);
      }
      list.append(item);
    });
    container.append(list);
  }

  let isAdmin = false;
  let open = false;
  host.innerHTML = `
    <div class="sc-bar">
      <button type="button" class="sc-toggle" aria-expanded="false" aria-controls="sc-panel">
        <span class="sc-toggle-label">Call out</span><span class="sc-arrow" aria-hidden="true">▾</span>
      </button>
      <span class="sc-count" hidden></span>
    </div>
    <div class="sc-panel" id="sc-panel" hidden>
      <p>Report your own absence. This does not remove or edit existing schedule assignments.</p>
      <form>
        <label>First day<input name="start_date" type="date" required></label>
        <label>Last day<input name="end_date" type="date" required></label>
        <label>Note (optional, up to 500 characters)<textarea name="note" maxlength="500"></textarea></label>
        <button type="submit">Submit sick-call report</button>
      </form>
      <div class="sc-message" role="status" hidden></div>
      <h3>My reports</h3><div class="sc-mine"></div>
      <div class="sc-supervisor" hidden>
        <h3>Awaiting supervisor acknowledgement</h3><div class="sc-pending"></div>
      </div>
    </div>`;
  const panel = host.querySelector('.sc-panel');
  const toggle = host.querySelector('.sc-toggle');
  const message = host.querySelector('.sc-message');
  const count = host.querySelector('.sc-count');
  const form = host.querySelector('form');
  const arrow = host.querySelector('.sc-arrow');
  function setOpen(next) {
    open = next;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    arrow.textContent = open ? '▴' : '▾';
  }
  toggle.addEventListener('click', () => {
    setOpen(!open);
    if (open) refresh();
  });
  async function refresh() {
    try {
      const [mine, pending] = await Promise.all([
        request({ scope: 'mine' }),
        isAdmin ? request({ scope: 'pending' }) : Promise.resolve(null)
      ]);
      renderList(host.querySelector('.sc-mine'), mine.reports, false);
      if (isAdmin) {
        count.hidden = pending.reports.length === 0;
        count.textContent = pending.reports.length + ' pending';
        renderList(host.querySelector('.sc-pending'), pending.reports, true);
      }
    } catch (err) {
      showMessage('Could not refresh sick-call reports: ' + err.message, true);
      if (!open) setOpen(true);
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    const values = Object.fromEntries(new FormData(form));
    if (values.end_date < values.start_date) {
      showMessage('Last day must be on or after first day.', true);
      return;
    }
    button.disabled = true;
    try {
      const result = await request({ op: 'report' }, values);
      showMessage(result.message);
      form.reset();
      await refresh();
    } catch (err) {
      showMessage(err.message, true);
    } finally {
      button.disabled = false;
    }
  });
  getMe().then(me => {
    isAdmin = !!me.is_admin;
    host.querySelector('.sc-supervisor').hidden = !isAdmin;
    return refresh();
  }).catch(err => showMessage(err.message, true));
  setInterval(() => { if (!document.hidden) refresh(); }, 45000);
})();