const MONATE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const WOCHENTAGE = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];

function fmtDate(d) {
  return `${WOCHENTAGE[d.getDay()]}, ${d.getDate()}. ${MONATE[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtShort(s) {
  const [y,m,dd] = s.split('-');
  return `${dd}.${m}.`;
}
function fmtTime(d) {
  return d.toTimeString().slice(0,5);
}

async function fetchJSON(url) {
  const r = await fetch(url);
  return r.json();
}

// ---------- Column 1: Today + Briefing ----------

async function loadToday() {
  const data = await fetchJSON('/api/today');
  const notesBody = document.getElementById('notes-body');
  const healthCard = document.getElementById('health-card');
  const healthBody = document.getElementById('health-body');
  const weather = document.getElementById('weather-pill');
  const overview = document.getElementById('overview-callout');
  const apptCard = document.getElementById('appointments-card');
  const apptList = document.getElementById('appointments');

  // Weather + focus from Daily Agenda
  if (data.weather) {
    weather.textContent = data.weather;
    weather.classList.remove('hidden');
  } else {
    weather.classList.add('hidden');
  }
  if (data.focus) {
    overview.textContent = data.focus;
    overview.classList.remove('hidden');
  } else {
    overview.classList.add('hidden');
  }

  // Appointments from Daily Agenda
  if (data.appointments && data.appointments.length) {
    apptCard.hidden = false;
    apptList.innerHTML = '';
    const now = fmtTime(new Date());
    let upcomingFound = false;
    data.appointments.forEach(a => {
      const li = document.createElement('li');
      const isNext = !upcomingFound && a.time && a.time >= now;
      if (isNext) { li.classList.add('now'); upcomingFound = true; }
      const prio = a.priority || 'neutral';
      const loc = a.location ? ` <span class="loc">📍 ${escapeHtml(a.location)}</span>` : '';
      const tent = a.tentative ? ' <span class="badge-tent">tentativ</span>' : '';
      const prefix = a.isConflict ? '⚠️ ' : '';
      const titleHtml = a.url
        ? `<a class="appt-link" href="${a.url}">${prefix}${escapeHtml(a.title)}</a>`
        : `${prefix}${escapeHtml(a.title)}`;
      li.innerHTML = `
        <span class="time">${a.time || '--:--'}</span>
        <span class="pbar p-${prio}"></span>
        <div class="title">${titleHtml}${tent}${loc}</div>`;
      apptList.appendChild(li);
    });
  } else {
    apptCard.hidden = true;
  }

  // Briefing tasks card no longer used
  document.getElementById('briefing-tasks-card').hidden = true;

  if (data.empty) {
    notesBody.innerHTML = '<p style="color:var(--text-dim)">Noch kein Eintrag heute.</p>';
    healthCard.hidden = true;
    return;
  }

  if (data.fallback) {
    notesBody.innerHTML = `<p style="color:var(--text-dim);font-size:12px">Heute noch kein Eintrag — zeige letzte Note vom ${fmtShort(data.date)}</p>`;
  } else {
    notesBody.innerHTML = '';
  }

  const notesHeader = document.querySelector('#notes-card h3');
  if (data.url && notesHeader) {
    notesHeader.innerHTML = `📝 Notes <a class="obs-link" href="${data.url}" title="In Obsidian öffnen">↗</a>`;
  }
  const healthHeader = document.querySelector('#health-card h3');
  if (data.healthUrl && healthHeader) {
    healthHeader.innerHTML = `💪 Health &amp; Movement <a class="obs-link" href="${data.healthUrl}" title="In Obsidian öffnen">↗</a>`;
  }

  if (data.healthMovement && data.healthMovement.trim()) {
    healthCard.hidden = false;
    healthBody.innerHTML = data.healthMovement;
  } else {
    healthCard.hidden = true;
  }

  if (data.sections && data.sections.length) {
    for (const s of data.sections) {
      const div = document.createElement('div');
      div.className = 'note-section';
      const link = s.url ? ` <a class="obs-link" href="${s.url}" title="In Obsidian öffnen">↗</a>` : '';
      div.innerHTML = `<h4>${escapeHtml(s.title)}${link}</h4><div class="card-body">${s.html || '<p style="color:var(--text-dim)">—</p>'}</div>`;
      notesBody.appendChild(div);
    }
  } else if (!data.fallback) {
    notesBody.innerHTML += '<p style="color:var(--text-dim)">Keine Notes-Subsections.</p>';
  }
}

async function loadBriefing() {
  const today = new Date().toISOString().slice(0,10);
  const data = await fetchJSON(`/api/briefing?date=${today}`);
  const weather = document.getElementById('weather-pill');
  const overview = document.getElementById('overview-callout');
  const apptCard = document.getElementById('appointments-card');
  const apptList = document.getElementById('appointments');
  const tasksCard = document.getElementById('briefing-tasks-card');
  const tasksList = document.getElementById('briefing-tasks');

  if (!data.exists) {
    weather.classList.add('hidden');
    overview.classList.add('hidden');
    apptCard.hidden = true;
    tasksCard.hidden = true;
    return;
  }

  if (data.weather) {
    weather.textContent = data.weather;
    weather.classList.remove('hidden');
  } else weather.classList.add('hidden');

  if (data.overview) {
    overview.textContent = data.overview;
    overview.classList.remove('hidden');
  } else overview.classList.add('hidden');

  const now = fmtTime(new Date());
  if (data.appointments && data.appointments.length) {
    apptCard.hidden = false;
    apptList.innerHTML = '';
    let upcomingFound = false;
    data.appointments.forEach((a, idx) => {
      const li = document.createElement('li');
      const isNow = !upcomingFound && a.time && a.time >= now;
      if (isNow) { li.classList.add('now'); upcomingFound = true; }
      const prio = a.priority || 'neutral';
      const tasksHtml = a.tasks && a.tasks.length
        ? `<ul class="appt-tasks">${a.tasks.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
        : '';
      const ctx = a.context ? `<div class="ctx">${escapeHtml(truncate(a.context, 200))}</div>` : '';
      const loc = a.location ? `<div class="loc">📍 ${escapeHtml(a.location)}</div>` : '';
      const titleHtml = a.url
        ? `<a class="appt-link" href="${a.url}">${escapeHtml(a.title || '(kein Titel)')}</a>`
        : escapeHtml(a.title || '(kein Titel)');
      li.innerHTML = `
        <span class="time">${a.time || '--:--'}</span>
        <span class="pbar p-${prio}"></span>
        <div class="title">${titleHtml}</div>
        ${loc}
        ${ctx}
        ${tasksHtml}
      `;
      apptList.appendChild(li);
    });
  } else {
    apptCard.hidden = true;
  }

  if (data.briefingTasks && data.briefingTasks.length) {
    tasksCard.hidden = false;
    tasksList.innerHTML = data.briefingTasks.map(t => `<li>☐ ${escapeHtml(t)}</li>`).join('');
  } else {
    tasksCard.hidden = true;
  }
}

// ---------- Hero: Tech Briefing ----------

async function loadTechBriefing() {
  const today = new Date().toISOString().slice(0,10);
  const data = await fetchJSON(`/api/tech-briefing?date=${today}`);
  const hero = document.getElementById('tech-briefing');
  if (!data.exists) { hero.hidden = true; return; }
  hero.hidden = false;

  const dateLabel = data.fallback ? `${fmtShort(data.date)} (gestern)` : 'heute';
  document.getElementById('tb-date').textContent = `· ${dateLabel}`;
  document.getElementById('tb-link').href = data.url;

  const sum = document.getElementById('tb-summary');
  sum.innerHTML = '';
  if (data.headline) {
    const h = document.createElement('div');
    h.className = 'hero-headline';
    h.textContent = data.headline;
    sum.appendChild(h);
  }
  if (data.summary) {
    const p = document.createElement('p');
    p.className = 'hero-summary-text';
    p.textContent = data.summary;
    sum.appendChild(p);
  }

  const list = document.getElementById('tb-stories');
  list.innerHTML = '';
  (data.stories || []).forEach((s, i) => {
    const card = document.createElement('div');
    card.className = `tb-story tb-${(s.level||'').toLowerCase()}`;
    const articleLink = s.url ? `<a class="tb-article" href="${s.url}" target="_blank" rel="noopener">Artikel ↗</a>` : '';
    const obsLink = s.obsidianUrl ? `<a class="obs-link" href="${s.obsidianUrl}" title="In Obsidian öffnen">📓</a>` : '';
    card.innerHTML = `
      <div class="tb-rank">${i+1}</div>
      <div class="tb-content">
        <div class="tb-title">${escapeHtml(s.emoji||'')} ${escapeHtml(s.title)}</div>
        <div class="tb-meta">
          <span class="tb-score tb-${(s.level||'').toLowerCase()}">${s.score} · ${escapeHtml(s.level||'')}</span>
          <span class="tb-cat">${escapeHtml(s.category||'')}</span>
          <span class="tb-source">${escapeHtml(s.source||'')}</span>
        </div>
        <div class="tb-body">${escapeHtml(truncate(s.body || '', 320))}</div>
        <div class="tb-actions">${articleLink} ${obsLink}</div>
      </div>
    `;
    list.appendChild(card);
  });

  const mWrap = document.getElementById('tb-mentions-wrap');
  const mList = document.getElementById('tb-mentions');
  if (data.mentions && data.mentions.length) {
    mWrap.hidden = false;
    document.getElementById('tb-mention-count').textContent = data.mentions.length;
    mList.innerHTML = data.mentions.map(m =>
      `<li><span class="tb-emoji">${escapeHtml(m.emoji||'')}</span><strong>${escapeHtml(m.title)}</strong> <span class="tb-source">(${escapeHtml(m.source)})</span><br><span class="tb-body">${escapeHtml(m.body)}</span></li>`
    ).join('');
  } else {
    mWrap.hidden = true;
  }
}

// ---------- Column 1 Extra: Email Triage ----------

async function loadTriage() {
  const today = new Date().toISOString().slice(0,10);
  const data = await fetchJSON(`/api/triage?date=${today}`);
  const card = document.getElementById('triage-card');
  const list = document.getElementById('triage-list');
  const actionsWrap = document.getElementById('triage-actions-wrap');
  const actionsList = document.getElementById('triage-actions');
  const header = document.querySelector('#triage-card h3');

  if (!data.exists) {
    card.hidden = true;
    return;
  }
  card.hidden = false;

  if (data.url && header) {
    header.innerHTML = `📧 Email Triage <a class="obs-link" href="${data.url}" title="Index in Obsidian öffnen">↗</a>`;
  }

  if (data.items && data.items.length) {
    list.innerHTML = '';
    for (const item of data.items) {
      const li = document.createElement('li');
      li.className = `triage-item prio-${item.priority}`;
      const linkHtml = item.noteUrl
        ? `<a class="triage-note" href="${item.noteUrl}" title="Antwort-Entwurf in Obsidian öffnen">💬 ${escapeHtml(item.noteLabel || 'Entwurf')}</a>`
        : item.noteLabel ? `<span class="triage-note-plain">${escapeHtml(item.noteLabel)}</span>` : '';
      li.innerHTML = `
        <span class="triage-prio">${escapeHtml(item.priorityLabel || '')}</span>
        <div class="triage-body">
          <div class="triage-topic">${escapeHtml(item.topic)}</div>
          <div class="triage-action">${escapeHtml(item.action)}</div>
          ${linkHtml}
        </div>
      `;
      list.appendChild(li);
    }
  } else {
    list.innerHTML = '<li style="color:var(--text-dim)">Keine Priorisierung.</li>';
  }

  if (data.sofortActions && data.sofortActions.length) {
    actionsWrap.hidden = false;
    actionsList.innerHTML = data.sofortActions.map(a => `<li>☐ ${escapeHtml(a)}</li>`).join('');
  } else {
    actionsWrap.hidden = true;
  }
}

// ---------- Column 2: Konsolidierte Todos ----------

let _todosCache = { open: [], done: [] };
let _todoFilter = 'open';

function renderTodos() {
  const list = document.getElementById('all-todos-list');
  let items = [];
  if (_todoFilter === 'open') items = _todosCache.open;
  else if (_todoFilter === 'done') items = _todosCache.done;
  else items = [..._todosCache.open, ..._todosCache.done];

  if (!items.length) {
    list.innerHTML = '<li class="todo-empty">Keine Tasks.</li>';
    return;
  }
  list.innerHTML = items.map(t => `
    <li class="todo-row ${t.status === 'done' ? 'done' : ''}">
      <span class="todo-check">${t.status === 'done' ? '☑' : '☐'}</span>
      <div class="todo-main">
        <div class="todo-text">${escapeHtml(t.text)}</div>
        <div class="todo-meta">
          <span class="todo-origin origin-${t.originColor || 'grey'}" title="${escapeHtml(t.origin)}">${escapeHtml(t.origin)}</span>
          <span class="todo-date">${escapeHtml(t.dateLabel)}</span>
          <a class="todo-link" href="${t.url}" title="In Obsidian öffnen">↗</a>
        </div>
      </div>
    </li>
  `).join('');
}

async function loadTasks() {
  const data = await fetchJSON('/api/all-todos?days=14');
  _todosCache.open = data.open || [];
  _todosCache.done = data.done || [];

  document.getElementById('all-todo-count').textContent = data.totalOpen + data.totalDone;
  document.getElementById('filter-open-count').textContent = data.totalOpen;
  document.getElementById('filter-done-count').textContent = data.totalDone;
  renderTodos();
}

document.querySelectorAll('.todo-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.todo-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _todoFilter = btn.dataset.filter;
    renderTodos();
  });
});

// ---------- Column 3: Stats ----------

async function loadStats() {
  const data = await fetchJSON('/api/stats');
  document.getElementById('streak-count').textContent = data.streak;
  document.getElementById('stat-done').textContent = data.doneTasks;
  document.getElementById('stat-open').textContent = data.openTasks;
  document.getElementById('donut-label').textContent = `${data.completion}%`;
  const circumference = 2 * Math.PI * 48;
  const dashLen = (data.completion / 100) * circumference;
  document.getElementById('donut-arc').setAttribute('stroke-dasharray', `${dashLen} ${circumference}`);

  const hm = document.getElementById('heatmap');
  hm.innerHTML = '';
  for (const cell of data.heatmap) {
    const d = document.createElement('div');
    d.className = `hm-cell hm-${cell.level}`;
    const day = cell.date.slice(-2);
    d.setAttribute('data-day', day);
    d.title = `${cell.date} — ${cell.level}`;
    hm.appendChild(d);
  }

  document.getElementById('project-count').textContent = data.projects;
  const list = document.getElementById('project-list');
  list.innerHTML = (data.projectList || []).slice(0,10).map(p => `<li>${escapeHtml(p)}</li>`).join('');
}

// ---------- Utils ----------

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ---------- Orchestration ----------

async function refreshAll() {
  document.getElementById('today-date').textContent = fmtDate(new Date());
  await Promise.all([loadTechBriefing(), loadToday(), loadTriage(), loadTasks(), loadStats()]);
  document.getElementById('last-updated').textContent = fmtTime(new Date());
}

document.getElementById('refresh-btn').addEventListener('click', refreshAll);
refreshAll();
setInterval(refreshAll, 60000);
