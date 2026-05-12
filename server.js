const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const VAULT = '/Users/kirschniakchristian/Local/CK2024ff';
const VAULT_NAME = 'ck2024ff';
const DAILY_DIR = path.join(VAULT, '05 Regulars', 'Daily Notes');
const DAILY_REL = '05 Regulars/Daily Notes';
const INBOX_REL = '05 Regulars/Inbox Reviews';
const INBOX_DIR = path.join(VAULT, '05 Regulars', 'Inbox Reviews');
const REVIEWS_REL = '05 Regulars/Weekly Reviews';
const REVIEWS_DIR = path.join(VAULT, '05 Regulars', 'Weekly Reviews');
const INBOX_ROOT_REL = '00 Inbox';
const INBOX_ROOT_DIR = path.join(VAULT, '00 Inbox');
const PORT = 3000;

function obsidianUrl(filename, heading) {
  const filePath = `${DAILY_REL}/${filename}`;
  const url = `obsidian://open?vault=${encodeURIComponent(VAULT_NAME)}&file=${encodeURIComponent(filePath)}`;
  return heading ? `${url}#${encodeURIComponent(heading)}` : url;
}
function obsidianUrlPath(relPath, heading) {
  const url = `obsidian://open?vault=${encodeURIComponent(VAULT_NAME)}&file=${encodeURIComponent(relPath)}`;
  return heading ? `${url}#${encodeURIComponent(heading)}` : url;
}
function obsidianWikilink(name) {
  return `obsidian://open?vault=${encodeURIComponent(VAULT_NAME)}&file=${encodeURIComponent(name)}`;
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Helpers ----------

function readNote(filename) {
  const p = path.join(DAILY_DIR, filename);
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function stripFrontmatter(text) {
  if (!text) return { body: '', frontmatter: {} };
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { body: text, frontmatter: {} };
  const fm = {};
  m[1].split('\n').forEach(line => {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2];
  });
  return { body: m[2], frontmatter: fm };
}

function renderWikilinks(text) {
  return text.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
    const parts = inner.split('|');
    const label = (parts[1] || parts[0]).trim();
    return `<span class="wikilink">${escapeHtml(label)}</span>`;
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderInline(text) {
  let t = escapeHtml(text);
  t = t.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
    const parts = inner.split('|');
    const target = parts[0].trim().split('#')[0];
    const label = (parts[1] || parts[0]).trim();
    return `<a class="wikilink" href="${obsidianWikilink(target)}">${escapeHtml(label)}</a>`;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  return t;
}

function renderMarkdown(md) {
  if (!md) return '';
  const lines = md.split('\n');
  const out = [];
  let inCode = false;
  let codeBuf = [];
  let listBuf = [];
  let para = [];

  function flushPara() {
    if (para.length) {
      out.push('<p>' + renderInline(para.join(' ')) + '</p>');
      para = [];
    }
  }
  function flushList() {
    if (listBuf.length) {
      out.push('<ul>' + listBuf.join('') + '</ul>');
      listBuf = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      if (inCode) {
        out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
        codeBuf = [];
        inCode = false;
      } else {
        flushPara(); flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    if (/^>\s?/.test(line)) {
      flushPara(); flushList();
      out.push('<blockquote>' + renderInline(line.replace(/^>\s?/, '')) + '</blockquote>');
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara(); flushList();
      out.push(`<h${h[1].length + 2}>${renderInline(h[2])}</h${h[1].length + 2}>`);
      continue;
    }

    const task = line.match(/^\s*[-*]\s+\[([ x])\]\s+(.*)$/);
    if (task) {
      flushPara();
      const done = task[1] === 'x';
      const text = task[2].replace(/➕\s*\d{4}-\d{2}-\d{2}/, '').trim();
      listBuf.push(`<li class="task ${done ? 'done' : ''}"><input type="checkbox" disabled ${done ? 'checked' : ''}> ${renderInline(text)}</li>`);
      continue;
    }

    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      flushPara();
      listBuf.push('<li>' + renderInline(li[1]) + '</li>');
      continue;
    }

    if (line.trim() === '') {
      flushPara(); flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara(); flushList();
  return out.join('\n');
}

function extractTasks(md) {
  if (!md) return { open: [], done: [] };
  const open = [], done = [];
  const lines = md.split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*[-*]\s+\[([ x])\]\s+(.+)$/);
    if (!m) continue;
    const text = m[2].replace(/➕\s*\d{4}-\d{2}-\d{2}/, '').trim();
    const clean = text.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => (inner.split('|')[1] || inner.split('|')[0]).trim());
    (m[1] === 'x' ? done : open).push(clean);
  }
  return { open, done };
}

function parseSections(md) {
  if (!md) return [];
  const lines = md.split('\n');
  const sections = [];
  let current = null;
  let inNotes = false;
  for (const line of lines) {
    if (/^#\s+Notes/i.test(line)) { inNotes = true; continue; }
    if (/^#\s+/.test(line) && !/^##/.test(line)) {
      if (!/Notes/i.test(line)) inNotes = false;
      continue;
    }
    if (inNotes && /^##\s+/.test(line)) {
      if (current) sections.push(current);
      current = { title: line.replace(/^##\s+/, '').trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push(current);
  return sections.map(s => ({
    title: s.title,
    html: renderMarkdown(s.body.join('\n').trim()),
  }));
}

function parseHealthMovement(md) {
  if (!md) return '';
  const m = md.match(/##\s+Health\s*&\s*Movement[^\n]*\n([\s\S]*?)(?=^#\s|^##\s|\n---|$)/im);
  if (!m) return '';
  return renderMarkdown(m[1].trim());
}

// ---------- Daily Agenda Parser ----------

function parseAgenda(md) {
  if (!md) return { weather: '', focus: '', appointments: [] };
  const { body } = stripFrontmatter(md);
  const m = body.match(/#\s+Daily Agenda[^\n]*\n([\s\S]*?)(?=\n##\s+Optionale|\n##\s+Freie|\n##\s+Offene|\n#\s+Review|\n#\s+Notes|$)/);
  if (!m) return { weather: '', focus: '', appointments: [] };

  const lines = m[1].split('\n');

  // First two blockquotes: weather + focus
  let weather = '', focus = '';
  const bqs = [];
  for (const line of lines) {
    const bq = line.match(/^>\s?(.*)$/);
    if (bq && bq[1].trim()) bqs.push(bq[1].replace(/\*\*/g, '').trim());
  }
  if (bqs[0]) weather = bqs[0];
  if (bqs[1]) focus = bqs[1].replace(/^Fokus:\s*/, '').trim();

  const appointments = [];
  let current = null;

  for (const line of lines) {
    const h = line.match(/^###\s+(.+)$/);
    if (h) {
      if (current) appointments.push(current);
      const header = h[1];
      const isConflict = /⚠️|KONFLIKT/u.test(header);
      const tentative = /\*\([^)]+\)\*/.test(header);
      const timeMatch = header.match(/(\d{1,2}:\d{2})/);
      const time = timeMatch ? timeMatch[1] : '';
      const prioMatch = header.match(/·\s*([ABC])(?:\s*\*\([^)]+\)\*\s*)?$/);
      let priority = 'neutral';
      if (prioMatch) {
        if (prioMatch[1] === 'A') priority = 'red';
        else if (prioMatch[1] === 'B') priority = 'yellow';
        else if (prioMatch[1] === 'C') priority = 'grey';
      }
      const title = header
        .replace(/⚠️\s*/u, '')
        .replace(/\d{1,2}:\d{2}--\d{1,2}:\d{2}\s*·\s*/, '')
        .replace(/\d{1,2}:\d{2}\s*·\s*/, '')
        .replace(/\s*·\s*[ABC](?:\s*\*\([^)]+\)\*\s*)?$/, '')
        .replace(/\*\([^)]+\)\*\s*$/, '')
        .replace(/^\s*·\s*/, '')
        .trim();
      current = { time, title, priority, tentative, isConflict, location: '', heading: header };
      continue;
    }
    if (!current) continue;
    const locM = line.match(/\*\*Ort:\*\*\s*([^|*\n]+)/);
    if (locM) current.location = locM[1].trim();
  }
  if (current) appointments.push(current);

  return { weather, focus, appointments };
}

// ---------- Daily Briefing Parser ----------

function parseBriefing(md) {
  if (!md) return null;
  const { body } = stripFrontmatter(md);
  const lines = body.split('\n');

  let weather = '';
  let overview = '';
  const blockquotes = [];
  for (const line of lines) {
    const m = line.match(/^>\s?(.*)$/);
    if (m) blockquotes.push(m[1]);
  }
  if (blockquotes[0]) weather = blockquotes[0].replace(/\*\*/g, '').trim();
  if (blockquotes[1]) overview = blockquotes[1].replace(/\*\*Tagesüberblick:\*\*\s*/, '').replace(/\*\*/g, '').trim();

  const appointments = [];
  const briefingTasks = [];

  const apptRegex = /^###\s+(.*)$/;
  let current = null;
  let captureContext = false;
  let contextBuf = [];
  let inTerminSection = false;

  function finalizeCurrent() {
    if (current) {
      current.context = contextBuf.join(' ').trim().slice(0, 600);
      appointments.push(current);
    }
    current = null;
    contextBuf = [];
    captureContext = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+Termine/i.test(line)) { inTerminSection = true; continue; }
    if (/^##\s+/.test(line) && inTerminSection && !/Termine/i.test(line)) {
      finalizeCurrent();
      inTerminSection = false;
    }

    if (!inTerminSection) {
      const t = line.match(/^\s*[-*]\s+\[\s\]\s+(.+)$/);
      if (t) briefingTasks.push(cleanTaskText(t[1]));
      continue;
    }

    const h = line.match(apptRegex);
    if (h) {
      finalizeCurrent();
      const header = h[1];
      const timeMatch = header.match(/(\d{1,2}:\d{2})/);
      let priority = 'neutral';
      if (/🔴/.test(header)) priority = 'red';
      else if (/🟡/.test(header)) priority = 'yellow';
      else if (/⚪/.test(header)) priority = 'grey';
      else if (/☀️/.test(header)) priority = 'yellow';
      const title = header
        .replace(/[🔴🟡⚪☀️🥂📅]/g, '')
        .replace(/\d{1,2}:\d{2}[–\-]\d{1,2}:\d{2}\s*CEST\s*·?\s*/i, '')
        .replace(/\d{1,2}:\d{2}\s*CEST\s*·?\s*/i, '')
        .replace(/^\s*·\s*/, '')
        .replace(/\*/g, '')
        .trim();
      current = {
        time: timeMatch ? timeMatch[1] : '',
        title,
        heading: header.replace(/\*/g, '').trim(),
        priority,
        location: '',
        status: '',
        context: '',
        tasks: [],
      };
      captureContext = false;
      contextBuf = [];
      continue;
    }

    if (!current) continue;

    const locMatch = line.match(/^\*\*Ort:\*\*\s*(.+)$/);
    if (locMatch) { current.location = locMatch[1].trim(); continue; }
    const statusMatch = line.match(/^\*\*Status:\*\*\s*(.+)$/);
    if (statusMatch) { current.status = statusMatch[1].trim(); continue; }
    if (/^\*\*LV-Zeit:\*\*/.test(line)) continue;
    if (/^\*\*Teilnehmer:\*\*/.test(line)) continue;

    const ctxMatch = line.match(/^\*\*Kontext:\*\*\s*(.*)$/);
    if (ctxMatch) {
      captureContext = true;
      if (ctxMatch[1]) contextBuf.push(ctxMatch[1]);
      continue;
    }

    const t = line.match(/^\s*[-*]\s+\[\s\]\s+(.+)$/);
    if (t) {
      current.tasks.push(cleanTaskText(t[1]));
      captureContext = false;
      continue;
    }

    if (/^\*\*Tasks/.test(line) || /^\*\*Relevante/.test(line) || /^---$/.test(line)) {
      captureContext = false;
      continue;
    }

    if (captureContext && line.trim() && !/^\*\*/.test(line)) {
      contextBuf.push(line.trim());
    }
  }
  finalizeCurrent();

  appointments.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

  return { weather, overview, appointments, briefingTasks };
}

function cleanTaskText(s) {
  return s.replace(/➕\s*\d{4}-\d{2}-\d{2}/, '')
    .replace(/\[\[([^\]]+)\]\]/g, (_, inner) => (inner.split('|')[1] || inner.split('|')[0]).trim())
    .replace(/\*\*/g, '')
    .trim();
}

// ---------- Tech Briefing (00 Inbox) ----------

function parseTechBriefing(md) {
  if (!md) return null;
  const { body, frontmatter } = stripFrontmatter(md);

  const sumLineMatch = body.match(/^\*\*(\d+)\s+Top Stories[^\n]*$/m);
  const headline = sumLineMatch ? sumLineMatch[0].replace(/\*\*/g, '') : '';

  const bqMatch = body.match(/\n>\s+(.+)/);
  const summary = bqMatch ? bqMatch[1].trim() : '';

  const stories = [];
  const topMatch = body.match(/##\s+Top Stories[^\n]*\n([\s\S]*?)(?=\n##\s|\n---\s*$|$)/i);
  if (topMatch) {
    const blocks = topMatch[1].split(/\n(?=###\s)/);
    for (const block of blocks) {
      if (!/^###\s/.test(block)) continue;
      const lines = block.split('\n');
      const headerLine = lines[0].replace(/^###\s+/, '');
      const emoji = (headerLine.match(/^([\p{Emoji}\u{1F300}-\u{1FAFF}🔐🤖🏢⚖️💾📡🛰️])/u) || [,''])[1];
      const title = headerLine.replace(/^[^\w]*\d+\.\s*/, '').replace(/^[^\w]+/, '').trim();

      let score = '', level = '', source = '', category = '';
      const metaLine = lines.find(l => /\*\*Score:/.test(l)) || '';
      const sm = metaLine.match(/Score:\s*([\d.]+)\*\*\s*\(([A-Z]+)\)\s*·\s*([^·]+)·\s*_([^_]+)_/);
      if (sm) { score = sm[1]; level = sm[2]; source = sm[3].trim(); category = sm[4].trim(); }

      const urlMatch = block.match(/\[Artikel lesen\]\(([^)]+)\)/);
      const articleUrl = urlMatch ? urlMatch[1] : '';

      const origMatch = block.match(/\*Original:\s*([^*]+)\*/);
      const original = origMatch ? origMatch[1].trim() : '';

      const bodyText = lines.slice(1)
        .filter(l => !/\*\*Score:/.test(l) && !/^\*Original:/.test(l) && !/^\[Artikel lesen\]/.test(l))
        .join(' ').replace(/\s+/g, ' ').trim();

      stories.push({
        emoji,
        title,
        score: parseFloat(score) || 0,
        level,
        source,
        category,
        body: bodyText,
        original,
        url: articleUrl,
        heading: headerLine.replace(/\*/g, '').trim(),
      });
    }
  }

  const mentions = [];
  const erMatch = body.match(/##\s+Erw[äa]hnenswert[^\n]*\n([\s\S]*?)(?=\n##\s|\n---\s*$|$)/i);
  if (erMatch) {
    const re = /^-\s+([^\n]+?)\*\*([^*]+)\*\*\s*\(([^)]+)\)\s*\n\s+(.+?)(?=\n-\s|\n##|\n---|$)/gms;
    let m;
    while ((m = re.exec(erMatch[1])) !== null) {
      mentions.push({
        emoji: m[1].trim(),
        title: m[2].trim(),
        source: m[3].trim(),
        body: m[4].replace(/\s+/g, ' ').trim(),
      });
    }
  }

  return {
    title: frontmatter.title || '',
    headline,
    summary,
    stories,
    mentions,
    topCount: stories.length,
    mentionCount: mentions.length,
  };
}

// ---------- Email Triage (Inbox Reviews) ----------

function parseTriage(md, dateDir) {
  if (!md) return { items: [], sofortActions: [], clusters: [] };
  const { body } = stripFrontmatter(md);

  const items = [];
  const matrixRegex = /##\s+Priorit[äa]tsmatrix[^\n]*\n([\s\S]*?)(?=\n##\s|\n---|$)/i;
  const matrix = body.match(matrixRegex);
  if (matrix) {
    const rows = matrix[1].split('\n').filter(l => l.trim().startsWith('|'));
    for (const row of rows) {
      if (/^\|\s*#/i.test(row) || /^\|[\s\-:|]+\|$/.test(row)) continue;
      const cells = row.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
      if (cells.length < 4) continue;

      const prioCell = cells[1] || '';
      let priority = 'neutral';
      if (/HOCH/i.test(prioCell)) priority = 'high';
      else if (/MITTEL/i.test(prioCell)) priority = 'medium';
      else if (/NIEDRIG/i.test(prioCell)) priority = 'low';

      const topic = cells[2] || '';
      const action = cells[3] || '';
      const noteCell = cells[4] || '';

      let noteUrl = null, noteLabel = null;
      const wikiMatch = noteCell.match(/\[\[([^\]]+)\]\]/);
      if (wikiMatch) {
        const target = wikiMatch[1].split('|')[0].trim();
        noteLabel = (wikiMatch[1].split('|')[1] || target).trim();
        noteUrl = obsidianUrlPath(`${INBOX_REL}/${dateDir}/${target}.md`, 'Response-Entwurf');
      } else if (noteCell) {
        noteLabel = noteCell.replace(/\*/g, '');
      }

      items.push({
        num: cells[0] || '',
        priority,
        priorityLabel: prioCell.replace(/[🔴🟠🟡⚪]/g, '').trim(),
        topic: topic.replace(/\*/g, ''),
        action: action.replace(/\*/g, ''),
        noteUrl,
        noteLabel,
      });
    }
  }

  const sofortActions = [];
  const sofortRegex = /##\s+Sofort-?Actions?[^\n]*\n([\s\S]*?)(?=\n##\s|\n---|$)/i;
  const sm = body.match(sofortRegex);
  if (sm) {
    for (const line of sm[1].split('\n')) {
      const t = line.match(/^\s*[-*]\s+\[\s\]\s+(.+)$/);
      if (t) sofortActions.push(cleanTaskText(t[1]));
    }
  }

  return { items, sofortActions };
}

// ---------- Weekly Review Tasks (letzte 3) ----------

function listWeeklyReviews(limit = 3) {
  let files;
  try { files = fs.readdirSync(REVIEWS_DIR); } catch { return []; }
  const reviews = files
    .map(f => {
      const m = f.match(/Weekly Review\s+(\d{4})-W(\d{1,2})\.md$/i);
      if (!m) return null;
      return { file: f, year: parseInt(m[1], 10), week: parseInt(m[2], 10) };
    })
    .filter(Boolean)
    .sort((a, b) => (b.year - a.year) || (b.week - a.week))
    .slice(0, limit);
  return reviews;
}

function parseWeeklyReviewTasks(md) {
  if (!md) return { groups: [], totalOpen: 0, totalDone: 0 };
  const { body } = stripFrontmatter(md);
  const lines = body.split('\n');
  const groupsMap = new Map();
  let h2 = null;
  let h3 = null;

  function pushTo(title, task, done) {
    const key = title || 'Allgemein';
    if (!groupsMap.has(key)) groupsMap.set(key, { title: key, tasks: [], donetasks: [] });
    const g = groupsMap.get(key);
    if (done) g.donetasks.push(task);
    else g.tasks.push(task);
  }

  let totalOpen = 0, totalDone = 0;
  for (const line of lines) {
    const h2m = line.match(/^##\s+(.+)$/);
    if (h2m) { h2 = h2m[1].trim(); h3 = null; continue; }
    const h3m = line.match(/^###\s+(.+)$/);
    if (h3m) { h3 = h3m[1].trim(); continue; }

    const t = line.match(/^\s*[-*]\s+\[([ x])\]\s+(.+)$/);
    if (!t) continue;
    const done = t[1] === 'x';
    const text = cleanTaskText(t[2]);
    const title = h3 || h2 || 'Allgemein';
    pushTo(title, text, done);
    if (done) totalDone++; else totalOpen++;
  }
  return { groups: Array.from(groupsMap.values()), totalOpen, totalDone };
}

function loadWeeklyReviews(limit = 3) {
  const metas = listWeeklyReviews(limit);
  const out = [];
  for (const r of metas) {
    const p = path.join(REVIEWS_DIR, r.file);
    let md = null;
    try { md = fs.readFileSync(p, 'utf8'); } catch { continue; }
    const parsed = parseWeeklyReviewTasks(md);
    const label = `${r.year}-W${String(r.week).padStart(2,'0')}`;
    out.push({
      label,
      file: r.file,
      url: obsidianUrlPath(`${REVIEWS_REL}/${r.file}`),
      groups: parsed.groups,
      totalOpen: parsed.totalOpen,
      totalDone: parsed.totalDone,
    });
  }
  return out;
}

// ---------- Weekly Briefing Tasks ----------

function extractWeeklyTasks(date) {
  const weekInfo = isoWeek(date);
  const pattern = `weekly-briefing-CW${String(weekInfo.week).padStart(2, '0')}-${weekInfo.year}.md`;
  const md = readNote(pattern);
  if (!md) return [];
  const m = md.match(/##\s+Offene\s+Tasks.*?\n([\s\S]*?)(?=\n##|\n---|$)/i);
  if (!m) return [];
  const tasks = [];
  for (const line of m[1].split('\n')) {
    const t = line.match(/^\s*[-*]\s+\[\s\]\s+(.+)$/);
    if (t) tasks.push(cleanTaskText(t[1]));
  }
  return tasks;
}

function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return { week, year: date.getUTCFullYear() };
}

// ---------- Date Utils ----------

function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shortDate(s) {
  const [, m, d] = s.split('-');
  return `${d}.${m}.`;
}

function daysBack(n) {
  const out = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(dateStr(d));
  }
  return out;
}

// ---------- API ----------

app.get('/api/today', (req, res) => {
  const today = dateStr(new Date());
  let date = today;
  let filename = `${today}.md`;
  let md = readNote(filename);
  let fallback = false;
  if (!md) {
    fallback = true;
    const recent = daysBack(14);
    for (const d of recent) {
      const f = readNote(`${d}.md`);
      if (f) { md = f; date = d; filename = `${d}.md`; break; }
    }
  }
  if (!md) return res.json({ date: today, fallback: true, sections: [], healthMovement: '', empty: true, url: obsidianUrl(`${today}.md`) });
  const { body } = stripFrontmatter(md);
  const agenda = parseAgenda(md);
  const sections = parseSections(body).map(s => ({ ...s, url: obsidianUrl(filename, s.title) }));
  res.json({
    date,
    fallback,
    filename,
    url: obsidianUrl(filename),
    healthUrl: obsidianUrl(filename, 'Health & Movement'),
    healthMovement: parseHealthMovement(body),
    sections,
    weather: agenda.weather,
    focus: agenda.focus,
    appointments: agenda.appointments.map(a => ({
      ...a,
      url: obsidianUrl(filename, a.heading),
    })),
  });
});

// Generic day endpoint — used for tomorrow view
app.get('/api/day', (req, res) => {
  const date = req.query.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });
  const filename = `${date}.md`;
  const md = readNote(filename);
  if (!md) return res.json({ exists: false, date, url: obsidianUrl(filename) });
  const { body } = stripFrontmatter(md);
  const agenda = parseAgenda(md);
  const tasks = extractTasks(md);
  const sections = parseSections(body).map(s => ({ ...s, url: obsidianUrl(filename, s.title) }));
  res.json({
    exists: true,
    date,
    filename,
    url: obsidianUrl(filename),
    weather: agenda.weather,
    focus: agenda.focus,
    appointments: agenda.appointments.map(a => ({
      ...a,
      url: obsidianUrl(filename, a.heading),
    })),
    openTasks: tasks.open,
    doneTasks: tasks.done,
    sections,
    healthMovement: parseHealthMovement(body),
  });
});

app.get('/api/briefing', (req, res) => {
  const date = req.query.date || dateStr(new Date());
  const filename = `daily-briefing-${date}.md`;
  const md = readNote(filename);
  if (!md) return res.json({ exists: false, date, url: obsidianUrl(filename) });
  const parsed = parseBriefing(md);
  parsed.appointments = parsed.appointments.map(a => ({
    ...a,
    url: obsidianUrl(filename, a.heading || a.title),
  }));
  res.json({
    exists: true, date, filename,
    url: obsidianUrl(filename),
    ...parsed,
  });
});

app.get('/api/tech-briefing', (req, res) => {
  const date = req.query.date || dateStr(new Date());
  const filename = `Tech Briefing ${date}.md`;
  const filePath = path.join(INBOX_ROOT_DIR, filename);
  const url = obsidianUrlPath(`${INBOX_ROOT_REL}/${filename}`);
  let md = null;
  try { md = fs.readFileSync(filePath, 'utf8'); } catch {}
  if (!md) {
    // Fallback: try yesterday
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    const yDate = dateStr(yest);
    const yFile = `Tech Briefing ${yDate}.md`;
    const yPath = path.join(INBOX_ROOT_DIR, yFile);
    try {
      md = fs.readFileSync(yPath, 'utf8');
      const parsed = parseTechBriefing(md);
      return res.json({
        exists: true, fallback: true, date: yDate,
        url: obsidianUrlPath(`${INBOX_ROOT_REL}/${yFile}`),
        ...parsed,
        stories: (parsed.stories || []).map(s => ({ ...s, obsidianUrl: obsidianUrlPath(`${INBOX_ROOT_REL}/${yFile}`, s.heading) })),
      });
    } catch {
      return res.json({ exists: false, date, url });
    }
  }
  const parsed = parseTechBriefing(md);
  parsed.stories = (parsed.stories || []).map(s => ({
    ...s,
    obsidianUrl: obsidianUrlPath(`${INBOX_ROOT_REL}/${filename}`, s.heading),
  }));
  res.json({ exists: true, fallback: false, date, url, ...parsed });
});

app.get('/api/triage', (req, res) => {
  const date = req.query.date || dateStr(new Date());
  const indexPath = path.join(INBOX_DIR, date, '_index.md');
  let md = null;
  try { md = fs.readFileSync(indexPath, 'utf8'); } catch {}
  const indexUrl = obsidianUrlPath(`${INBOX_REL}/${date}/_index.md`);
  if (!md) return res.json({ exists: false, date, url: indexUrl });
  const parsed = parseTriage(md, date);
  res.json({ exists: true, date, url: indexUrl, ...parsed });
});

app.get('/api/all-todos', (req, res) => {
  const days = parseInt(req.query.days || '14', 10);
  const today = dateStr(new Date());
  const items = [];

  // 1. Daily Notes
  for (const d of daysBack(days)) {
    const filename = `${d}.md`;
    const md = readNote(filename);
    if (!md) continue;
    const t = extractTasks(md);
    const url = obsidianUrl(filename);
    t.open.forEach(text => items.push({
      text, status: 'open', sortKey: d, dateLabel: shortDate(d),
      origin: 'Daily Note', originColor: 'blue', url,
    }));
    t.done.forEach(text => items.push({
      text, status: 'done', sortKey: d, dateLabel: shortDate(d),
      origin: 'Daily Note', originColor: 'blue', url,
    }));
  }

  // 2. Daily Briefing (today + 1 day back)
  for (const d of daysBack(2)) {
    const briefFile = `daily-briefing-${d}.md`;
    const md = readNote(briefFile);
    if (!md) continue;
    const briefUrl = obsidianUrl(briefFile);
    const parsed = parseBriefing(md);
    (parsed.briefingTasks || []).forEach(text => items.push({
      text, status: 'open', sortKey: d + 'b', dateLabel: shortDate(d),
      origin: 'Briefing', originColor: 'cyan', url: briefUrl,
    }));
    (parsed.appointments || []).forEach(a => {
      // Strip time prefixes from title for compact origin label
      const cleanTitle = (a.title || '')
        .replace(/^\d{1,2}:\d{2}[–\-\s]+\d{1,2}:\d{2}\s*[·•]?\s*/, '')
        .replace(/^\d{1,2}:\d{2}\s*[·•]?\s*/, '')
        .trim();
      const shortTitle = cleanTitle.slice(0, 22) + (cleanTitle.length > 22 ? '…' : '');
      (a.tasks || []).forEach(text => items.push({
        text, status: 'open', sortKey: d + 'b' + (a.time || ''),
        dateLabel: `${shortDate(d)} ${a.time || ''}`.trim(),
        origin: `Termin · ${shortTitle}`, originColor: 'cyan',
        url: obsidianUrl(briefFile, a.heading || a.title),
      }));
    });
  }

  // 3. Triage Sofort-Actions (today + 1 day back)
  for (const d of daysBack(2)) {
    const indexPath = path.join(INBOX_DIR, d, '_index.md');
    let md = null;
    try { md = fs.readFileSync(indexPath, 'utf8'); } catch { continue; }
    const triageUrl = obsidianUrlPath(`${INBOX_REL}/${d}/_index.md`, 'Sofort-Actions');
    const parsed = parseTriage(md, d);
    (parsed.sofortActions || []).forEach(text => items.push({
      text, status: 'open', sortKey: d + 't', dateLabel: shortDate(d),
      origin: 'Triage', originColor: 'orange', url: triageUrl,
    }));
  }

  // 4. Weekly Briefing
  const wk = isoWeek(new Date());
  const wkFile = `weekly-briefing-CW${String(wk.week).padStart(2,'0')}-${wk.year}.md`;
  const wkUrl = obsidianUrl(wkFile, 'Offene Tasks');
  const weeklyTasks = extractWeeklyTasks(new Date());
  // sortKey: monday of this week (so it sits with this week's daily notes)
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const mondayStr = dateStr(monday);
  weeklyTasks.forEach(text => items.push({
    text, status: 'open', sortKey: mondayStr + 'w', dateLabel: `CW${wk.week}`,
    origin: 'Weekly Plan', originColor: 'purple', url: wkUrl,
  }));

  // 5. Weekly Reviews
  for (const rev of loadWeeklyReviews(3)) {
    // Date for sorting: last day of that week (saturday) — approx ISO week
    const yr = parseInt(rev.label.slice(0,4), 10);
    const wn = parseInt(rev.label.slice(6), 10);
    const jan4 = new Date(Date.UTC(yr, 0, 4));
    const dayOfWeek = (jan4.getUTCDay() + 6) % 7;
    const monDay = new Date(jan4); monDay.setUTCDate(jan4.getUTCDate() - dayOfWeek);
    const targetMon = new Date(monDay); targetMon.setUTCDate(monDay.getUTCDate() + (wn - 1) * 7);
    const sun = new Date(targetMon); sun.setUTCDate(targetMon.getUTCDate() + 6);
    const sortKey = dateStr(sun);

    rev.groups.forEach(g => {
      (g.tasks || []).forEach(text => items.push({
        text, status: 'open', sortKey, dateLabel: `KW ${rev.label.slice(6)}`,
        origin: `Review · ${g.title.slice(0,30)}`, originColor: 'pink',
        url: obsidianUrlPath(`${REVIEWS_REL}/${rev.file}`, g.title),
      }));
      (g.donetasks || []).forEach(text => items.push({
        text, status: 'done', sortKey, dateLabel: `KW ${rev.label.slice(6)}`,
        origin: `Review · ${g.title.slice(0,30)}`, originColor: 'pink',
        url: obsidianUrlPath(`${REVIEWS_REL}/${rev.file}`, g.title),
      }));
    });
  }

  // Deduplicate (same text + url) — prefer open
  const seen = new Map();
  for (const it of items) {
    const k = it.text.toLowerCase() + '|' + it.url;
    const prev = seen.get(k);
    if (!prev) { seen.set(k, it); continue; }
    // keep newer sortKey, prefer open over done
    if (it.sortKey > prev.sortKey || (it.status === 'open' && prev.status === 'done')) {
      seen.set(k, it);
    }
  }
  const dedup = Array.from(seen.values());

  dedup.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return b.sortKey.localeCompare(a.sortKey);
  });

  const open = dedup.filter(t => t.status === 'open');
  const done = dedup.filter(t => t.status === 'done');
  res.json({ open, done, totalOpen: open.length, totalDone: done.length });
});

app.get('/api/tasks', (req, res) => {
  const days = parseInt(req.query.days || '7', 10);
  const dates = daysBack(days);
  const byDate = [];
  const allOpen = [];
  const allDone = [];
  for (const d of dates) {
    const filename = `${d}.md`;
    const md = readNote(filename);
    if (!md) continue;
    const tasks = extractTasks(md);
    if (tasks.open.length || tasks.done.length) {
      byDate.push({
        date: d,
        open: tasks.open,
        done: tasks.done,
        url: obsidianUrl(filename),
      });
      tasks.open.forEach(t => allOpen.push({ text: t, date: d, url: obsidianUrl(filename) }));
      tasks.done.forEach(t => allDone.push({ text: t, date: d, url: obsidianUrl(filename) }));
    }
  }
  const wk = isoWeek(new Date());
  const wkFile = `weekly-briefing-CW${String(wk.week).padStart(2,'0')}-${wk.year}.md`;
  const weekly = extractWeeklyTasks(new Date());
  const weeklyReviews = loadWeeklyReviews(3);
  res.json({
    byDate,
    allOpen,
    allDone,
    weekly,
    weeklyUrl: obsidianUrl(wkFile, 'Offene Tasks'),
    weeklyReviews,
  });
});

app.get('/api/stats', (req, res) => {
  const dates = daysBack(14);
  const heatmap = [];
  let streak = 0;
  let streakActive = true;
  let openTotal = 0;
  let doneTotal = 0;
  const projects = new Set();

  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    const md = readNote(`${d}.md`);
    let level = 'empty';
    if (md) {
      const { body } = stripFrontmatter(md);
      const notesMatch = body.match(/#\s+Notes\s*\n([\s\S]*)$/);
      const notesBody = notesMatch ? notesMatch[1].trim() : '';
      level = notesBody.length > 60 ? 'full' : 'light';
      if (streakActive) streak++;
      const sections = parseSections(body);
      sections.forEach(s => projects.add(s.title));
      if (i < 7) {
        const t = extractTasks(md);
        openTotal += t.open.length;
        doneTotal += t.done.length;
      }
    } else {
      streakActive = false;
    }
    heatmap.push({ date: d, level });
  }
  heatmap.reverse();
  const total = openTotal + doneTotal;
  const completion = total ? Math.round((doneTotal / total) * 100) : 0;
  res.json({
    heatmap,
    streak,
    openTasks: openTotal,
    doneTasks: doneTotal,
    completion,
    projects: projects.size,
    projectList: Array.from(projects),
  });
});

app.get('/api/note/:date', (req, res) => {
  const md = readNote(`${req.params.date}.md`);
  if (!md) return res.status(404).json({ error: 'not found' });
  const { body, frontmatter } = stripFrontmatter(md);
  res.json({ date: req.params.date, frontmatter, html: renderMarkdown(body) });
});

// ---------- Start ----------

app.listen(PORT, () => {
  console.log(`\n🚀 GorkelDash läuft auf http://localhost:${PORT}`);
  console.log(`📂 Vault: ${VAULT}`);
  const today = dateStr(new Date());
  const has = (f) => fs.existsSync(path.join(DAILY_DIR, f)) ? '✅' : '❌';
  console.log(`   ${has(`${today}.md`)} Daily Note ${today}.md`);
  console.log(`   ${has(`daily-briefing-${today}.md`)} Daily Briefing daily-briefing-${today}.md`);
  const wk = isoWeek(new Date());
  const wkFile = `weekly-briefing-CW${String(wk.week).padStart(2, '0')}-${wk.year}.md`;
  console.log(`   ${has(wkFile)} Weekly Briefing ${wkFile}\n`);
  if (process.platform === 'darwin') exec(`open http://localhost:${PORT}`);
  else if (process.platform === 'linux') exec(`xdg-open http://localhost:${PORT}`);
});
