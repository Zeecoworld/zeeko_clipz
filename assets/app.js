(() => {
  'use strict';

  const TOKEN_KEY = 'clipstudio.token';
  const TEMPLATE =
    'video_url,headline,title,caption,chapters,transcript_url,duration_seconds\n' +
    'https://example.com/video-one.mp4,Learn Python Fast,Python in 12 minutes,#python #coding,,,\n' +
    'https://example.com/video-two.mp4,Django Tips,Django in 8 minutes,#django,0:00;2:10;4:45,https://example.com/video-two.srt,\n';

  const ICONS = {
    logo: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9l5 3-5 3z" fill="#ffffff"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 3v11.2a3.8 3.8 0 1 1-3-3.7V7.4a7 7 0 1 0 6 6.9V9.2c1 .7 2.2 1.1 3.5 1.1V7.2c-1.9 0-3.5-1.6-3.5-4.2z"/></svg>'
  };

  const PLATFORMS = {
    youtube: {
      id: 'youtube',
      name: 'YouTube Shorts',
      short: 'YouTube',
      cls: 'yt',
      theme: 'theme-youtube',
      perDay: 5,
      tagline: 'Five vertical clips a day, straight to your channel.',
      access: [
        'Upload videos that you scheduled to your own channel.',
        'It cannot read your channel, your other videos, your subscribers or your analytics.'
      ],
      revoke: 'https://myaccount.google.com/permissions',
      revokeText: 'Revoke access in your Google Account'
    },
    tiktok: {
      id: 'tiktok',
      name: 'TikTok',
      short: 'TikTok',
      cls: 'tt',
      theme: 'theme-tiktok',
      perDay: 10,
      tagline: 'Ten vertical clips a day, delivered to your account.',
      access: [
        'Read your display name so you can see which account is connected.',
        'Upload videos that you scheduled to your account.',
        'It cannot read your followers, messages or other content.'
      ],
      revoke: null,
      revokeText: 'Remove access in the TikTok app under your account security and permissions settings'
    }
  };

  const root = document.getElementById('app');
  const state = { connections: null, timers: [], flash: null, durations: new Map() };

  /* ---------- helpers ---------- */
  const $ = (selector, scope = document) => scope.querySelector(selector);

  const el = (tag, props = {}, ...kids) => {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(props)) {
      if (name === 'class') node.className = value;
      else if (name === 'text') node.textContent = value;
      else if (name === 'html') node.innerHTML = value;
      else if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
      else node.setAttribute(name, value);
    }
    kids.filter(Boolean).forEach((kid) => node.append(kid));
    return node;
  };

  const setNote = (node, text, kind = '') => {
    node.textContent = text;
    node.className = `note ${kind}`.trim();
  };

  const fmt = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const getToken = () => localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  const clearToken = () => {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  };
  const setToken = (token, remember) => {
    clearToken();
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  };

  const go = (path) => {
    const target = `#/${path}`;
    if (location.hash === target) render();
    else location.hash = target;
  };

  const logout = () => {
    clearToken();
    state.connections = null;
    go('login');
  };

  const api = async (path, options = {}) => {
    const token = getToken();
    const res = await fetch(`/.netlify/functions/${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== 'login') {
      clearToken();
      go('login');
      throw new Error('Your session expired. Please log in again.');
    }
    if (!res.ok) {
      const error = new Error(data.error || `Request failed (${res.status})`);
      error.details = data.details;
      throw error;
    }
    return data;
  };

  const loadConnections = async (force) => {
    if (!state.connections || force) state.connections = await api('auth');
    return state.connections;
  };

  const stopTimers = () => {
    state.timers.forEach((timer) => clearInterval(timer));
    state.timers = [];
  };

  const chipFor = (id) => {
    const conn = (state.connections || {})[id];
    if (!conn) return el('span', { class: 'chip', text: 'Checking' });
    if (conn.connected && conn.needsReauth) return el('span', { class: 'chip bad', text: 'Reconnect needed' });
    if (conn.connected) return el('span', { class: 'chip ok', text: 'Connected' });
    return el('span', { class: 'chip warn', text: 'Not connected' });
  };
  const paintChip = (slot, p) => slot.replaceChildren(chipFor(p.id));
  const isConnected = (id) => {
    const conn = (state.connections || {})[id];
    return Boolean(conn && conn.connected && !conn.needsReauth);
  };

  /* ---------- layout ---------- */
  const footer = () =>
    el(
      'footer',
      { class: 'footer' },
      el(
        'div',
        { class: 'footer-inner' },
        el('div', { text: 'Clip Studio, operated by Zeecomedia Tech Enterprises.' }),
        el('div', {}, el('a', { href: '/', text: 'Home' }), el('a', { href: '/terms', text: 'Terms of Service' }), el('a', { href: '/privacy', text: 'Privacy Policy' }))
      )
    );

  const topbar = (current, signedIn = true) =>
    el(
      'header',
      { class: 'topbar' },
      el(
        'div',
        { class: 'topbar-inner' },
        el('a', { class: 'brand', href: signedIn ? '#/platforms' : '/' }, el('span', { class: 'logo', html: ICONS.logo }), el('span', { text: 'Clip Studio' })),
        el(
          'nav',
          { class: 'nav' },
          ...(signedIn
            ? Object.values(PLATFORMS).map((p) => el('a', { class: `link${current === p.id ? ' active' : ''}`, href: `#/${p.id}`, text: p.short }))
            : []),
          el('a', { class: 'link hide-sm', href: '/', text: 'Home' }),
          signedIn ? el('button', { class: 'btn ghost small', type: 'button', text: 'Sign out', onclick: logout }) : null
        )
      )
    );

  const mount = (theme, ...nodes) => {
    stopTimers();
    document.body.className = theme || '';
    root.replaceChildren(...nodes);
    window.scrollTo(0, 0);
  };

  const banner = (kind, text, action) => el('div', { class: `banner ${kind}` }, el('span', { text }), action || null);

  /* ---------- login ---------- */
  const renderLogin = () => {
    const password = el('input', { type: 'password', placeholder: 'Your password', autocomplete: 'current-password', required: '' });
    const remember = el('input', { type: 'checkbox' });
    const message = el('p', { class: 'note' });
    const submit = el('button', { class: 'btn block', type: 'submit', text: 'Log in' });

    const form = el(
      'form',
      { class: 'card login rise' },
      el('h1', { text: 'Welcome back' }),
      el('p', { class: 'muted', text: 'Log in to manage your YouTube and TikTok posting queues.' }),
      el('label', { text: 'Password' }),
      password,
      el('label', { class: 'check' }, remember, el('span', { text: 'Keep me logged in on this device for 14 days' })),
      el('div', { style: 'margin-top:18px' }, submit),
      message
    );

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      setNote(message, 'Checking...');
      try {
        const result = await api('login', { method: 'POST', body: JSON.stringify({ password: password.value, remember: remember.checked }) });
        setToken(result.token, remember.checked);
        go('platforms');
      } catch (err) {
        setNote(message, err.message, 'err');
        submit.disabled = false;
      }
    });

    mount(
      '',
      topbar(null, false),
      el(
        'main',
        { class: 'center-screen' },
        el(
          'div',
          { class: 'narrow' },
          form,
          el('p', { class: 'hint', style: 'text-align:center;margin-top:16px' }, 'By logging in you agree to the ', el('a', { href: '/terms', text: 'Terms' }), ' and ', el('a', { href: '/privacy', text: 'Privacy Policy' }), '.')
        )
      ),
      footer()
    );
    password.focus();
  };

  /* ---------- platform picker ---------- */
  const buildPickCard = (p) => {
    const chipSlot = el('span');
    const nums = { published: el('strong', { text: '-' }), scheduled: el('strong', { text: '-' }), failed: el('strong', { text: '-' }) };
    const box = (key, label) => el('div', {}, nums[key], el('span', { text: label }));
    const node = el(
      'a',
      { class: `pick-card ${p.cls} rise`, href: `#/${p.id}` },
      el('div', { class: 'pick-head' }, el('div', { class: 'dash-title' }, el('span', { class: 'dash-icon', html: ICONS[p.id], style: 'width:46px;height:46px' }), el('h2', { text: p.name })), chipSlot),
      el('p', { class: 'muted', text: p.tagline }),
      el('div', { class: 'mini-nums' }, box('published', 'Posted'), box('scheduled', 'Scheduled'), box('failed', 'Failed')),
      el('span', { class: 'btn block', text: `Open ${p.short} dashboard` })
    );
    const load = async () => {
      paintChip(chipSlot, p);
      try {
        const dash = await api(`queue?platform=${p.id}`);
        nums.published.textContent = dash.counts.published;
        nums.scheduled.textContent = dash.counts.scheduled;
        nums.failed.textContent = dash.counts.failed;
      } catch (err) {
        /* the dashboard itself shows the error */
      }
    };
    return { node, load };
  };

  const renderPicker = async () => {
    const cards = Object.values(PLATFORMS).map(buildPickCard);
    mount(
      '',
      topbar(null),
      el(
        'main',
        { class: 'page' },
        el('h1', { class: 'page-title', text: 'Choose a platform' }),
        el('p', { class: 'page-sub', text: 'Each platform has its own login, CSV queue, schedule and dashboard.' }),
        el('div', { class: 'pick' }, ...cards.map((card) => card.node)),
        el(
          'div',
          { class: 'card tool-card' },
          el('div', {}, el('h3', { text: 'Quick clip tool' }), el('p', { class: 'muted', text: 'Preview the clips from a single video and download them for CapCut. Nothing is scheduled.' })),
          el('a', { class: 'btn ghost', href: '#/tools', text: 'Open quick clip' })
        )
      ),
      footer()
    );
    try {
      await loadConnections(true);
    } catch (err) {
      return;
    }
    await Promise.all(cards.map((card) => card.load()));
  };

  /* ---------- dashboard shell ---------- */
  const renderDashboard = (p, tab) => {
    const content = el('div', { class: 'rise' });
    const chipSlot = el('span');
    const tabs = [['overview', 'Overview'], ['upload', 'Upload CSV'], ['settings', 'Settings']];

    mount(
      p.theme,
      topbar(p.id),
      el(
        'main',
        { class: 'page' },
        el(
          'div',
          { class: 'dash-head' },
          el('div', { class: 'dash-title' }, el('span', { class: 'dash-icon', html: ICONS[p.id] }), el('div', {}, el('h1', { class: 'page-title', text: p.name }), el('p', { class: 'page-sub', text: p.tagline }))),
          chipSlot
        ),
        el('nav', { class: 'tabs' }, ...tabs.map(([key, label]) => el('a', { href: `#/${p.id}/${key}`, class: key === tab ? 'active' : '', text: label }))),
        content
      ),
      footer()
    );
    paintChip(chipSlot, p);
    ({ overview: renderOverview, upload: renderUpload, settings: renderSettings })[tab](p, content, chipSlot);
  };

  /* ---------- overview tab ---------- */
  const STATUS = {
    scheduled: ['Scheduled', 'info'],
    processing: ['Publishing', 'warn'],
    published: ['Posted', 'ok'],
    failed: ['Failed', 'bad'],
    cancelled: ['Cancelled', '']
  };
  const EMPTY = {
    upcoming: 'Nothing is scheduled. Upload a CSV to fill the queue.',
    published: 'Nothing has been posted yet.',
    failed: 'No failed posts. Everything is running smoothly.',
    cancelled: 'No cancelled posts.'
  };

  const renderOverview = (p, box, chipSlot) => {
    const banners = el('div');
    const stats = el('section', { class: 'stats' });
    const minis = el('section', { class: 'mini-stats' });
    const chart = el('section', { class: 'card', style: 'margin-top:18px' });
    const list = el('section', { class: 'card', style: 'margin-top:18px' });
    box.append(banners, stats, minis, chart, list);

    const view = { status: 'upcoming', posts: [], total: 0 };
    let dash = null;

    const statCard = (cls, label, value, sub) =>
      el('div', { class: `stat ${cls}` }, el('span', { class: 'stat-label', text: label }), el('strong', { class: 'stat-value', text: String(value) }), el('span', { class: 'stat-sub', text: sub }));

    const drawStats = () => {
      const c = dash.counts;
      stats.replaceChildren(
        statCard('posted', 'Posted', c.published, `${dash.today.published} today`),
        statCard('scheduled', 'Scheduled', c.scheduled, dash.nextAt ? `Next: ${fmt(dash.nextAt)}` : 'Nothing queued'),
        statCard('failed', 'Failed', c.failed, c.failed ? 'Needs attention' : 'All clear'),
        statCard('active', 'Active', c.processing, c.processing ? 'Publishing right now' : 'Idle')
      );
      const mini = (label, value) => el('div', { class: 'mini' }, el('span', { text: label }), el('strong', { text: value }));
      minis.replaceChildren(
        mini('Daily target', `${dash.perDay} posts`),
        mini('Posted today', `${dash.today.published} of ${dash.perDay}`),
        mini('Content left', `${dash.daysLeft} days`)
      );
    };

    const drawBanners = () => {
      const conn = (state.connections || {})[p.id] || {};
      const items = [];
      const link = (href, text) => el('a', { class: 'btn small', href, text });
      if (!conn.connected) items.push(banner('warn', `${p.short} is not connected yet. Nothing can be posted until you connect it.`, link(`#/${p.id}/settings`, 'Connect now')));
      else if (conn.needsReauth) items.push(banner('bad', `${p.short} needs to be reconnected. Posts will fail until you do.`, link(`#/${p.id}/settings`, 'Reconnect')));
      if (dash.counts.failed) {
        items.push(
          banner('bad', `${plural(dash.counts.failed, 'post')} failed.`, el('button', { class: 'btn small', type: 'button', text: 'Review', onclick: () => { view.status = 'failed'; loadList(true); } }))
        );
      }
      if (dash.counts.scheduled === 0) items.push(banner('info', 'The queue is empty. Upload a CSV to keep posting every day.', link(`#/${p.id}/upload`, 'Upload CSV')));
      else if (dash.daysLeft < 2) items.push(banner('warn', `Only ${dash.daysLeft} days of content left in the queue.`, link(`#/${p.id}/upload`, 'Add videos')));
      banners.replaceChildren(...items);
    };

    const drawChart = () => {
      const H = 150;
      const max = Math.max(dash.perDay, ...dash.daily.map((d) => d.published + d.scheduled + d.failed), 1);
      const px = (n) => Math.max(3, Math.round((n / max) * H));
      const cols = dash.daily.map((d) => {
        const seg = (n, cls) => (n ? el('span', { class: `seg ${cls}`, style: `height:${px(n)}px` }) : null);
        return el(
          'div',
          { class: `col${d.date === dash.todayDate ? ' today' : ''}`, title: `${d.date}: ${d.published} posted, ${d.scheduled} scheduled, ${d.failed} failed` },
          el('div', { class: 'bars' }, seg(d.failed, 'failed'), seg(d.scheduled, 'scheduled'), seg(d.published, 'published')),
          el('span', { class: 'col-label', text: d.date.slice(8) })
        );
      });
      const target = el('div', { class: 'target', style: `bottom:${Math.round((dash.perDay / max) * H) + 20}px` }, el('span', { text: `target ${dash.perDay}/day` }));
      const legend = [['Posted', 'var(--ok)'], ['Scheduled', 'var(--info)'], ['Failed', 'var(--bad)']];
      chart.replaceChildren(
        el('div', { class: 'section-head' }, el('h3', { text: 'Posts per day' }), el('div', { class: 'legend' }, ...legend.map(([label, color]) => el('span', {}, el('i', { style: `background:${color}` }), label)))),
        el('div', { class: 'chart-wrap' }, el('div', { class: 'chart' }, ...cols), target),
        el('p', { class: 'hint', style: 'margin-top:8px', text: 'The last 6 days, today, and the next 13 days.' })
      );
    };

    const act = async (path, options) => {
      try {
        await api(path, options);
      } catch (err) {
        alert(err.message);
      }
      refresh();
    };

    const buildItem = (post) => {
      const [label, tone] = STATUS[post.status] || [post.status, ''];
      const sub = post.error ? el('small', { class: 'err', text: post.error }) : post.note ? el('small', { text: post.note }) : null;
      let action = null;
      if (post.status === 'scheduled') {
        action = el('button', { type: 'button', class: 'btn danger small', text: 'Cancel', onclick: () => act(`queue?id=${encodeURIComponent(post.id)}`, { method: 'DELETE' }) });
      } else if (post.status === 'failed') {
        action = el('button', { type: 'button', class: 'btn small', text: 'Retry', onclick: () => act('queue', { method: 'POST', body: JSON.stringify({ action: 'retry', id: post.id }) }) });
      } else if (post.status === 'published' && p.id === 'youtube' && post.external_id) {
        action = el('a', { class: 'btn ghost small', href: `https://www.youtube.com/watch?v=${encodeURIComponent(post.external_id)}`, target: '_blank', rel: 'noopener', text: 'View' });
      }
      return el(
        'div',
        { class: 'item' },
        el('div', { class: 'item-main' }, el('strong', { text: post.title }), sub),
        el('span', { class: 'item-time', text: fmt(post.scheduled_at) }),
        el('span', { class: `chip ${tone}`.trim(), text: label }),
        action || el('span')
      );
    };

    const drawList = () => {
      const c = dash ? dash.counts : {};
      const filters = [
        ['upcoming', 'Upcoming', (c.scheduled || 0) + (c.processing || 0)],
        ['published', 'Posted', c.published || 0],
        ['failed', 'Failed', c.failed || 0],
        ['cancelled', 'Cancelled', c.cancelled || 0]
      ];
      const chips = el(
        'div',
        { class: 'filters' },
        ...filters.map(([key, label, n]) =>
          el('button', { type: 'button', class: `filter${view.status === key ? ' active' : ''}`, onclick: () => { view.status = key; loadList(true); } }, label, el('em', { text: String(n) }))
        )
      );
      const retryAll =
        view.status === 'failed' && c.failed
          ? el('button', { class: 'btn small', type: 'button', text: `Retry all ${c.failed}`, onclick: () => act('queue', { method: 'POST', body: JSON.stringify({ action: 'retryAll', platform: p.id }) }) })
          : null;
      const rows = view.posts.map(buildItem);
      const more =
        view.posts.length < view.total
          ? el('div', { style: 'margin-top:14px;text-align:center' }, el('button', { class: 'btn ghost small', type: 'button', text: 'Load more', onclick: () => loadList(false) }))
          : null;
      list.replaceChildren(
        el('div', { class: 'section-head' }, el('h3', { text: 'Posts' }), retryAll),
        chips,
        el('div', { class: 'items' }, ...(rows.length ? rows : [el('div', { class: 'empty', text: EMPTY[view.status] })])),
        more
      );
    };

    const loadList = async (reset) => {
      if (reset) {
        view.posts = [];
        view.total = 0;
      }
      try {
        const data = await api(`queue?platform=${p.id}&status=${view.status}&limit=25&offset=${view.posts.length}`);
        view.posts = reset ? data.posts : view.posts.concat(data.posts);
        view.total = data.total;
      } catch (err) {
        list.replaceChildren(el('p', { class: 'note err', text: err.message }));
        return;
      }
      drawList();
    };

    const refresh = async () => {
      try {
        const [data] = await Promise.all([api(`queue?platform=${p.id}`), loadConnections(true)]);
        dash = data;
        paintChip(chipSlot, p);
        drawStats();
        drawChart();
        drawBanners();
        await loadList(true);
      } catch (err) {
        banners.replaceChildren(banner('bad', err.message));
      }
    };

    refresh();
    state.timers.push(setInterval(refresh, 20000));
  };

  /* ---------- upload tab ---------- */
  const parseCsv = (input) => {
    const text = input.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
        } else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i += 1;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim() !== ''));
  };

  const readRows = (text) => {
    const table = parseCsv(text);
    const problems = [];
    if (table.length < 2) return { rows: [], problems: ['The CSV needs a header row and at least one video row.'] };
    const header = table[0].map((h) => h.trim().toLowerCase());
    const col = (...names) => header.findIndex((h) => names.includes(h));
    const iUrl = col('video_url', 'url');
    const iDur = col('duration_seconds', 'duration');
    const iHead = col('headline');
    const iTitle = col('title');
    const iCap = col('caption');
    const iChap = col('chapters', 'chapter_starts');
    const iTr = col('transcript_url', 'transcript', 'captions_url');
    if (iUrl < 0) return { rows: [], problems: ['The header must include video_url.'] };
    if (table.length > 201) problems.push('A CSV can contain at most 200 videos.');

    const rows = [];
    table.slice(1).forEach((cells, i) => {
      const get = (idx) => (idx >= 0 && cells[idx] ? cells[idx].trim() : '');
      const videoUrl = get(iUrl);
      const rawDuration = get(iDur);
      const durationSeconds = rawDuration === '' ? null : Number(rawDuration);
      const line = i + 2;
      if (!/^https?:\/\//i.test(videoUrl)) {
        problems.push(`Row ${line}: video_url must start with http:// or https://`);
      } else if (durationSeconds !== null && (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 7200)) {
        problems.push(`Row ${line}: duration_seconds must be a whole number from 1 to 7200`);
      } else if (get(iTr) && !/^https:\/\//i.test(get(iTr))) {
        problems.push(`Row ${line}: transcript_url must start with https://`);
      } else {
        rows.push({ line, videoUrl, durationSeconds, headline: get(iHead), title: get(iTitle), caption: get(iCap), chapters: get(iChap), transcriptUrl: get(iTr) });
      }
    });
    return { rows, problems };
  };

  const detectDurations = async (rows, onProgress) => {
    [...state.durations.entries()].forEach(([url, found]) => {
      if (found.transient) state.durations.delete(url);
    });
    const unique = [...new Set(rows.filter((r) => r.durationSeconds === null).map((r) => r.videoUrl))].filter((url) => !state.durations.has(url));
    const groups = [];
    for (let i = 0; i < unique.length; i += 4) groups.push(unique.slice(i, i + 4));
    let done = 0;
    for (let i = 0; i < groups.length; i += 2) {
      await Promise.all(
        groups.slice(i, i + 2).map(async (urls) => {
          try {
            const { results } = await api('probe-videos', { method: 'POST', body: JSON.stringify({ urls }) });
            results.forEach((found) => state.durations.set(found.url, found));
          } catch (err) {
            urls.forEach((url) => state.durations.set(url, { url, seconds: null, error: err.message, transient: true }));
          }
          done += urls.length;
          onProgress(done, unique.length);
        })
      );
    }
  };

  const labelFor = (row) => {
    let name = row.title || row.headline || '';
    if (!name) {
      try {
        name = decodeURIComponent(row.videoUrl.split('?')[0].split('/').pop() || '');
      } catch (err) {
        name = '';
      }
    }
    return (name || row.videoUrl).slice(0, 30);
  };

  const dayPlan = (sequence, rows, perDay) => {
    const lines = [];
    for (let day = 0; day < 7 && day * perDay < sequence.length; day += 1) {
      const runs = [];
      sequence.slice(day * perDay, (day + 1) * perDay).forEach(([group, part]) => {
        const last = runs[runs.length - 1];
        if (last && last.group === group && part === last.to + 1) last.to = part;
        else runs.push({ group, from: part, to: part });
      });
      const text = runs.map((run) => `${labelFor(rows[run.group])} ${run.from === run.to ? `part ${run.from}` : `parts ${run.from}-${run.to}`}`).join(' + ');
      lines.push(`Day ${day + 1}: ${text}`);
    }
    return lines;
  };

  const renderUpload = (p, box, chipSlot) => {
    const entry = { parsed: [], rows: [], skipped: [] };
    const info = { queued: 0, perDay: p.perDay, mode: null };

    const file = el('input', { type: 'file', accept: '.csv,text/csv' });
    const summary = el('p', { class: 'note' });
    const planner = el('p', { class: 'note' });
    const planTitle = el('p', { class: 'hint' });
    const planList = el('ul', { class: 'dayplan' });
    const errors = el('ul', { class: 'errlist' });
    const warns = el('ul', { class: 'warnlist' });
    const gate = el('p', { class: 'note err' });
    const modeNote = el('p', { class: 'hint' });
    const note = el('p', { class: 'note' });
    const button = el('button', { type: 'button', class: 'btn block', text: 'Import and schedule', disabled: '' });

    const order = el('select', {}, el('option', { value: 'sequential', selected: '', text: "In list order: video 1's clips first, then video 2" }), el('option', { value: 'interleave', text: 'Mix videos: part 1 of each, then part 2' }));
    const minClips = el('select', {}, ...[1, 2, 3, 4, 5, 6].map((n) => el('option', n === 3 ? { value: '3', selected: '', text: '3' } : { value: String(n), text: String(n) })));
    const stagger = el('input', { type: 'checkbox' });
    const horizon = el('input', { type: 'number', min: '1', max: '365', value: '30' });

    const refreshButton = () => {
      const connected = isConnected(p.id);
      button.disabled = !(entry.rows.length && connected);
      gate.textContent = connected ? '' : `Connect ${p.short} in Settings before importing.`;
      modeNote.textContent = p.id === 'tiktok' && info.mode === 'draft' ? 'Inbox mode: clips arrive in your TikTok inbox and you tap publish. TikTok allows 5 waiting there at once, so extra clips retry later.' : '';
    };

    const showWarnings = (extra = []) => warns.replaceChildren(...[...entry.skipped, ...extra].map((message) => el('li', { text: message })));
    const clearPlan = () => {
      setNote(planner, '');
      planTitle.textContent = '';
      planList.replaceChildren();
    };

    const payload = () => ({ platform: p.id, rows: entry.rows, order: order.value, stagger: stagger.checked, minClips: Number(minClips.value) });

    const analyze = async () => {
      if (!entry.rows.length) return;
      errors.replaceChildren();
      showWarnings();
      clearPlan();
      setNote(summary, 'Checking how each video will be cut...');
      try {
        const preview = await api('import-queue', { method: 'POST', body: JSON.stringify({ ...payload(), dryRun: true }) });
        showWarnings(preview.warnings);
        const days = (preview.clips + info.queued) / info.perDay;
        setNote(summary, `${plural(entry.rows.length, 'video')} ${entry.rows.length === 1 ? 'becomes' : 'become'} ${preview.clips} clips (${(preview.clips / entry.rows.length).toFixed(1)} per video). With ${info.queued} already queued, that fills ${days.toFixed(1)} days at ${info.perDay} posts per day.`, 'ok');

        const lines = dayPlan(preview.sequence || [], entry.rows, info.perDay);
        planTitle.textContent = lines.length ? 'First days, assuming an empty queue:' : '';
        planList.replaceChildren(...lines.map((line) => el('li', { text: line })));

        const days30 = Math.max(1, Number(horizon.value) || 30);
        const need = info.perDay * days30;
        const missing = need - preview.clips - info.queued;
        if (missing > 0) {
          const perMinute = preview.clips / (preview.totalSeconds / 60);
          setNote(planner, `To keep ${p.short} posting ${info.perDay} per day for ${days30} days you need ${need} clips. Add about ${missing} more, roughly ${Math.ceil(missing / perMinute)} more minutes of source video.`, 'err');
        } else {
          setNote(planner, `This covers the full ${days30} days.`, 'ok');
        }
      } catch (err) {
        if (err.details) {
          entry.rows = [];
          err.details.forEach((message) => errors.append(el('li', { text: message })));
        }
        setNote(summary, err.message, 'err');
      }
      refreshButton();
    };

    const prepare = async () => {
      setNote(summary, 'Detecting video lengths...');
      await detectDurations(entry.parsed, (done, total) => setNote(summary, `Detecting video lengths ${done}/${total}...`));
      const usable = [];
      entry.skipped = [];
      entry.parsed.forEach((row) => {
        let seconds = row.durationSeconds;
        let problem = null;
        if (seconds === null) {
          const found = state.durations.get(row.videoUrl);
          if (found && found.seconds) seconds = found.seconds;
          else problem = `could not detect the video length (${(found && found.error) || 'unknown error'}). Add duration_seconds to include it`;
        }
        if (!problem && seconds > 7200) problem = 'the video is longer than 2 hours';
        if (problem) entry.skipped.push(`Row ${row.line}: skipped, ${problem}.`);
        else usable.push({ ...row, durationSeconds: seconds });
      });
      entry.rows = usable;
      if (!usable.length) {
        showWarnings();
        setNote(summary, 'None of the videos could be used.', 'err');
        refreshButton();
        return;
      }
      await analyze();
    };

    file.addEventListener('change', async () => {
      entry.parsed = [];
      entry.rows = [];
      entry.skipped = [];
      errors.replaceChildren();
      warns.replaceChildren();
      clearPlan();
      setNote(note, '');
      if (!file.files[0]) {
        setNote(summary, '');
        refreshButton();
        return;
      }
      const { rows, problems } = readRows(await file.files[0].text());
      problems.slice(0, 8).forEach((message) => errors.append(el('li', { text: message })));
      if (problems.length) {
        setNote(summary, `${plural(problems.length, 'problem')} found. Fix the CSV and choose it again.`, 'err');
        refreshButton();
        return;
      }
      entry.parsed = rows;
      refreshButton();
      await prepare();
    });

    button.addEventListener('click', async () => {
      button.disabled = true;
      setNote(note, 'Creating clips and scheduling...');
      try {
        const result = await api('import-queue', { method: 'POST', body: JSON.stringify(payload()) });
        const how = [];
        if (result.methods.chapters) how.push(`${result.methods.chapters} cut at chapters`);
        if (result.methods.transcript) how.push(`${result.methods.transcript} snapped to transcript sentences`);
        if (result.methods.even) how.push(`${result.methods.even} split into equal parts`);
        const trail = result.staggered ? ` ${result.staggered} clips trail the other platform by a day.` : '';
        setNote(note, `Scheduled ${result.imported} clips from ${fmt(result.firstPostAt)} to ${fmt(result.lastPostAt)} (${result.perDay} per day). Videos: ${how.join(', ')}.${trail}`, 'ok');
        showWarnings(result.warnings || []);
        file.value = '';
        entry.parsed = [];
        entry.rows = [];
        info.queued += result.imported;
        setNote(summary, '');
        clearPlan();
      } catch (err) {
        setNote(note, err.details ? `${err.message}: ${err.details.join(' | ')}` : err.message, 'err');
      } finally {
        refreshButton();
      }
    });

    minClips.addEventListener('change', analyze);
    horizon.addEventListener('change', analyze);

    const template = el('a', { class: 'btn ghost small', href: URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' })), download: `${p.id}-template.csv`, text: 'Download CSV template' });

    box.append(
      el(
        'div',
        { class: 'upload' },
        el(
          'div',
          { class: 'card zone' },
          el('h3', { text: `Upload your ${p.short} CSV` }),
          el('p', { class: 'note', text: 'One video per row, in the order you want them used. The app reads each video\'s length itself, cuts it into clips, and fills your daily slots.' }),
          file,
          summary,
          planner,
          planTitle,
          planList,
          errors,
          warns,
          gate,
          modeNote,
          button,
          note
        ),
        el(
          'div',
          { class: 'stack' },
          el(
            'div',
            { class: 'card' },
            el('h3', { text: 'Scheduling options' }),
            el('label', { text: 'Posting order' }),
            order,
            el('label', { text: 'Minimum clips per video' }),
            minClips,
            el('p', { class: 'hint', style: 'margin-top:6px', text: 'Every video is split into at least this many clips. A clip is never shorter than 20 seconds.' }),
            el('label', { text: 'Keep the queue fed for (days)' }),
            horizon,
            el('p', { class: 'hint', style: 'margin-top:6px', text: 'Used to tell you how much more video you need.' }),
            el('label', { class: 'check' }, stagger, el('span', { text: 'Keep the same clip 24 hours apart across platforms' })),
            el('p', { class: 'hint', style: 'margin-top:6px', text: 'Only applies if the other platform has the same video with the same cut points.' })
          ),
          el(
            'div',
            { class: 'card' },
            el('div', { class: 'section-head' }, el('h3', { text: 'CSV columns' }), template),
            el(
              'ul',
              { class: 'cols-list' },
              el('li', {}, el('b', { text: 'video_url' }), ' (required): a direct MP4 or MOV link.'),
              el('li', {}, el('b', { text: 'headline' }), ': text shown at the top of every clip.'),
              el('li', {}, el('b', { text: 'title' }), ' and ', el('b', { text: 'caption' }), ': used for the post.'),
              el('li', {}, el('b', { text: 'chapters' }), ': topic start times like 0:00;2:10;4:45.'),
              el('li', {}, el('b', { text: 'transcript_url' }), ': a public .srt or .vtt link, so cuts land at sentence ends.'),
              el('li', {}, el('b', { text: 'duration_seconds' }), ': only if length detection fails.')
            )
          )
        )
      )
    );

    (async () => {
      try {
        const [connections, dash] = await Promise.all([loadConnections(true), api(`queue?platform=${p.id}`)]);
        info.mode = (connections[p.id] || {}).mode;
        info.queued = dash.counts.scheduled;
        info.perDay = dash.perDay;
        paintChip(chipSlot, p);
      } catch (err) {
        setNote(note, err.message, 'err');
      }
      refreshButton();
    })();
  };

  /* ---------- settings tab ---------- */
  const renderSettings = async (p, box, chipSlot) => {
    box.append(el('div', { class: 'spinner' }));
    let dash;
    try {
      [state.connections, dash] = await Promise.all([api('auth'), api(`queue?platform=${p.id}`)]);
    } catch (err) {
      box.replaceChildren(banner('bad', err.message));
      return;
    }
    const conn = state.connections[p.id] || {};
    paintChip(chipSlot, p);

    const message = el('p', { class: 'note' });
    const offset = dash.utcOffsetMinutes;
    const hours = Math.floor(Math.abs(offset) / 60);
    const mins = Math.abs(offset) % 60;
    const zone = `UTC${offset < 0 ? '-' : '+'}${hours}${mins ? `:${String(mins).padStart(2, '0')}` : ''}`;
    const kv = (label, value) => el('div', { class: 'kv' }, el('span', { text: label }), el('span', { text: value }));

    const connect = el('button', {
      type: 'button',
      class: 'btn',
      text: conn.connected ? `Reconnect ${p.short}` : `Connect ${p.short}`,
      onclick: async () => {
        connect.disabled = true;
        try {
          const { url } = await api('auth', { method: 'POST', body: JSON.stringify({ platform: p.id }) });
          window.location.href = url;
        } catch (err) {
          setNote(message, err.message, 'err');
          connect.disabled = false;
        }
      }
    });
    const disconnect = conn.connected
      ? el('button', {
          type: 'button',
          class: 'btn danger',
          text: 'Disconnect',
          onclick: async () => {
            if (!confirm(`Disconnect ${p.short}? This deletes the saved login. Queued posts will fail until you reconnect.`)) return;
            try {
              await api(`auth?platform=${p.id}`, { method: 'DELETE' });
              await loadConnections(true);
              renderDashboard(p, 'settings');
            } catch (err) {
              setNote(message, err.message, 'err');
            }
          }
        })
      : null;

    const copy = el('button', {
      type: 'button',
      class: 'btn ghost small',
      text: 'Copy',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(conn.redirectUri);
          copy.textContent = 'Copied';
        } catch (err) {
          copy.textContent = 'Select and copy';
        }
      }
    });

    const flash = state.flash;
    state.flash = null;

    const connection = el(
      'div',
      { class: 'card stack' },
      el('div', { class: 'section-head' }, el('h3', { text: 'Account connection' }), chipFor(p.id)),
      el('p', { class: 'note', text: conn.connected ? `${conn.label ? `Signed in as ${conn.label}. ` : ''}Connected ${conn.connectedAt ? fmt(conn.connectedAt) : ''}.` : `Not connected yet. ${p.id === 'youtube' ? 'You will sign in with Google.' : 'You will sign in with TikTok.'}`.trim() }),
      conn.configured === false ? el('p', { class: 'note err', text: p.id === 'youtube' ? 'Add YT_CLIENT_ID and YT_CLIENT_SECRET in Netlify first.' : 'Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in Netlify first.' }) : null,
      el('div', { class: 'btnrow' }, connect, disconnect),
      message,
      el('div', { class: 'kv' }, el('span', { text: 'Redirect URI' }), el('span', {}, copy)),
      el('p', {}, el('code', { text: conn.redirectUri || '' })),
      el('p', { class: 'hint', text: 'Register this exact address as the redirect URI in your Google or TikTok developer console.' })
    );

    const schedule = el(
      'div',
      { class: 'card' },
      el('h3', { text: 'Posting schedule' }),
      kv('Daily target', `${dash.perDay} posts`),
      kv('Timezone', zone),
      kv(p.id === 'tiktok' ? 'Delivery mode' : 'Privacy on upload', p.id === 'tiktok' ? (conn.mode === 'draft' ? 'Inbox (you tap publish)' : 'Direct post') : conn.privacy || 'public'),
      p.id === 'tiktok' && conn.mode !== 'draft' ? kv('Privacy on post', conn.privacy || 'SELF_ONLY') : null,
      el('p', { class: 'hint', style: 'margin-top:12px', text: 'Daily posting times:' }),
      el('div', { class: 'slots' }, ...dash.slots.map((slot) => el('span', { class: 'slot', text: slot }))),
      el('p', { class: 'hint', style: 'margin-top:12px', text: 'Times, timezone and delivery mode are set in the Netlify environment variables.' })
    );

    const queueCard = el(
      'div',
      { class: 'card stack' },
      el('h3', { text: 'Queue controls' }),
      el('p', { class: 'note', text: `${plural(dash.counts.scheduled, 'post')} scheduled, ${dash.counts.failed} failed.` }),
      el(
        'div',
        { class: 'btnrow' },
        dash.counts.failed
          ? el('button', {
              class: 'btn',
              type: 'button',
              text: `Retry ${dash.counts.failed} failed`,
              onclick: async () => {
                try {
                  await api('queue', { method: 'POST', body: JSON.stringify({ action: 'retryAll', platform: p.id }) });
                  renderDashboard(p, 'settings');
                } catch (err) {
                  alert(err.message);
                }
              }
            })
          : null,
        dash.counts.scheduled
          ? el('button', {
              class: 'btn danger',
              type: 'button',
              text: 'Clear scheduled queue',
              onclick: async () => {
                if (!confirm(`Cancel all ${dash.counts.scheduled} scheduled ${p.short} posts?`)) return;
                try {
                  await api(`queue?platform=${p.id}&all=1`, { method: 'DELETE' });
                  renderDashboard(p, 'settings');
                } catch (err) {
                  alert(err.message);
                }
              }
            })
          : null
      )
    );

    const access = el(
      'div',
      { class: 'card stack' },
      el('h3', { text: 'What this connection allows' }),
      el('ul', { class: 'cols-list' }, ...p.access.map((line) => el('li', { text: line }))),
      el('p', { class: 'hint' }, `${p.revokeText}. `, p.revoke ? el('a', { href: p.revoke, target: '_blank', rel: 'noopener', text: 'Open' }) : null),
      el('p', { class: 'hint' }, 'Read the ', el('a', { href: '/privacy', text: 'Privacy Policy' }), ' and ', el('a', { href: '/terms', text: 'Terms of Service' }), '.')
    );

    box.replaceChildren(
      flash ? banner(flash.kind, flash.text) : null,
      el('div', { class: 'settings' }, el('div', { class: 'stack' }, connection, queueCard), el('div', { class: 'stack' }, schedule, access))
    );
  };

  /* ---------- quick clip tool ---------- */
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        entry.target.dispatchEvent(new CustomEvent('visible'));
      });
    },
    { rootMargin: '200px' }
  );

  const buildClipCard = (clip) => {
    const video = el('video', { controls: '', playsinline: '', preload: 'metadata' });
    const hint = el('p', { class: 'hint', text: 'Preview loads when this clip scrolls into view.' });
    let tries = 0;
    const loadPreview = () => {
      hint.textContent = 'Rendering preview on Cloudinary...';
      video.src = clip.url;
      video.load();
    };
    video.addEventListener('loadeddata', () => { hint.textContent = 'Preview ready.'; });
    video.addEventListener('error', () => {
      tries += 1;
      if (tries > 25) {
        hint.textContent = 'Preview failed. Check the source URL and your Cloudinary fetch settings.';
        return;
      }
      hint.textContent = 'Still rendering on Cloudinary, retrying...';
      setTimeout(loadPreview, 8000);
    });
    const card = el(
      'article',
      { class: 'clip-card' },
      el('h3', { text: `Clip ${clip.clipNumber} (${clip.timeframe})` }),
      el('div', { class: 'player' }, video),
      hint,
      el('a', { class: 'btn', href: clip.downloadUrl, target: '_blank', rel: 'noopener', download: `clip_${clip.clipNumber}.mp4`, text: 'Download Draft For CapCut' })
    );
    card.addEventListener('visible', loadPreview);
    observer.observe(card);
    return card;
  };

  const renderQuickClip = () => {
    const url = el('input', { type: 'url', placeholder: 'https://example.com/long-video.mp4', required: '' });
    const duration = el('input', { type: 'number', min: '1', max: '7200', step: '1', placeholder: 'e.g. 725', required: '' });
    const headline = el('input', { type: 'text', maxlength: '120', placeholder: 'e.g. Learn Python Fast' });
    const submit = el('button', { class: 'btn block', type: 'submit', text: 'Generate Clips' });
    const message = el('p', { class: 'note' });
    const loader = el('div', { class: 'loader', hidden: '' }, el('div', { class: 'spinner' }), el('div', { text: 'Processing workflow chunks... Generating layouts' }));
    const grid = el('section', { class: 'clip-grid' });

    const form = el(
      'form',
      { class: 'card stack' },
      el('div', {}, el('label', { text: 'Direct Video MP4 URL' }), url),
      el('div', { class: 'row' }, el('div', {}, el('label', { text: 'Total Video Duration (Seconds)' }), duration), el('div', {}, el('label', { text: 'Top Text Headline Overlay' }), headline)),
      submit,
      message
    );
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      loader.hidden = false;
      grid.replaceChildren();
      setNote(message, '');
      try {
        const data = await api('clip-video', { method: 'POST', body: JSON.stringify({ videoUrl: url.value.trim(), totalDuration: Number(duration.value), headline: headline.value.trim() }) });
        grid.replaceChildren(...data.clips.map(buildClipCard));
        setNote(message, `${plural(data.clips.length, 'clip')} ready.`, 'ok');
      } catch (err) {
        setNote(message, err.message, 'err');
      } finally {
        loader.hidden = true;
        submit.disabled = false;
      }
    });

    mount(
      '',
      topbar(null),
      el('main', { class: 'page' }, el('a', { class: 'hint', href: '#/platforms', text: '< Back to platforms' }), el('h1', { class: 'page-title', style: 'margin-top:8px', text: 'Quick clip tool' }), el('p', { class: 'page-sub', style: 'margin-bottom:22px', text: 'Preview the clips from one video and download them for CapCut. Nothing is scheduled.' }), form, loader, grid),
      footer()
    );
  };

  /* ---------- router ---------- */
  function render() {
    const [a, b] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (!getToken()) {
      if (a !== 'login') return go('login');
      return renderLogin();
    }
    if (!a || a === 'login') return go('platforms');
    if (a === 'platforms') return renderPicker();
    if (a === 'tools') return renderQuickClip();
    if (PLATFORMS[a]) return renderDashboard(PLATFORMS[a], ['overview', 'upload', 'settings'].includes(b) ? b : 'overview');
    return go('platforms');
  }

  const params = new URLSearchParams(location.search);
  if (params.has('connected') || params.has('auth_error')) {
    const connected = PLATFORMS[params.get('connected')];
    state.flash = connected ? { kind: 'info', text: `${connected.name} connected successfully.` } : { kind: 'bad', text: params.get('auth_error') || 'Login failed.' };
    history.replaceState(null, '', location.pathname + location.hash);
  }

  window.addEventListener('hashchange', render);
  render();
})();
