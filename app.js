'use strict';

/* ------------------------------------------------------------------
   DATA (filled at runtime from data/polity.json)
   node: { id, title, state, x (% of width), y (row), parents[], deck }
------------------------------------------------------------------- */
let SKILL_TREE_DATA = [];

/* ------------------------------------------------------------------
   GLOBAL GAME STATE
------------------------------------------------------------------- */
let MAX_HEARTS = 5;
let XP_PER_CORRECT = 50;
let QUESTIONS_PER_RUN = 1; // questions asked before a node completes; raise it when modules have more content
let hearts = 5;
let streak = 0;
let xp = 0;

/* ------------------------------------------------------------------
   MODULE DATA (filled at runtime, keyed by node id)
   { [nodeId]: { questions: [{ question, options[4], correctAnswer, mentorScolding }] } }
------------------------------------------------------------------- */
let MODULE_DATA = {};

/* ------------------------------------------------------------------
   LAYOUT CONSTANTS (px)
------------------------------------------------------------------- */
const ROW_H = 150;       // vertical distance between rows
const PAD_TOP = 60;      // space above the first row's centre
const PAD_BOTTOM = 110;  // space below the last row's centre (hex + label)
const LINE_OUT = 62;     // line starts this far below a parent's centre (clears the label)
const LINE_IN = 42;      // line ends this far above a child's centre

const STATE_LABEL = { completed: 'completed', unlocked: 'unlocked', locked: 'locked' };

const ICONS = {
  completed: '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.250 4.100 1 5.800L12 16.800 6.750 19.600l1-5.800L3.500 9.700l5.900-.9z" fill="currentColor"/></svg>',
  unlocked:  '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M13.500 2L5 13.500h6L10 22l9-12.500h-6z" fill="currentColor"/></svg>',
  locked:    '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M7 10V8a5 5 0 0110 0v2h1.500A1.500 1.500 0 0120 11.500v8a1.500 1.500 0 01-1.500 1.500h-13A1.500 1.500 0 014 19.500v-8A1.500 1.500 0 015.500 10zm2 0h6V8a3 3 0 00-6 0z" fill="currentColor"/></svg>'
};
const CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 12.500l4.500 4.500L19 7.500" fill="none" stroke="currentColor" stroke-width="3.500" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let NODE_BY_ID = new Map();
const treeEl = document.getElementById('tree');
const linksEl = document.getElementById('links');
const SVG_NS = 'http://www.w3.org/2000/svg';

const nodeCenterY = node => PAD_TOP + node.y * ROW_H;

/* ------------------------------------------------------------------
   RENDER: NODES
------------------------------------------------------------------- */
function renderTree() {
  treeEl.querySelectorAll('.node').forEach(el => el.remove());

  const maxRow = Math.max(...SKILL_TREE_DATA.map(n => n.y));
  treeEl.style.height = (PAD_TOP + maxRow * ROW_H + PAD_BOTTOM) + 'px';

  SKILL_TREE_DATA.forEach(data => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'node node--' + data.state;
    btn.dataset.id = data.id;
    btn.style.left = data.x + '%';
    btn.style.top = nodeCenterY(data) + 'px';
    btn.setAttribute('aria-label', data.title + ', ' + STATE_LABEL[data.state]);
    if (data.state === 'locked') btn.setAttribute('aria-disabled', 'true');

    const shape = document.createElement('span');
    shape.className = 'node__shape';
    shape.innerHTML = ICONS[data.state];
    btn.appendChild(shape);

    if (data.state === 'completed') {
      const badge = document.createElement('span');
      badge.className = 'node__badge';
      badge.innerHTML = CHECK;
      btn.appendChild(badge);
    }

    const label = document.createElement('span');
    label.className = 'node__label';
    label.textContent = data.title;
    btn.appendChild(label);

    treeEl.appendChild(btn);
  });

  drawLinks();
  renderProgress();
}

/* ------------------------------------------------------------------
   RENDER: SVG CONNECTORS (parent -> child, cubic Bezier)
------------------------------------------------------------------- */
function linkClass(parent, child) {
  if (parent.state === 'completed' && child.state === 'completed') return 'link link--done';
  if (parent.state === 'completed' && child.state === 'unlocked') return 'link link--live';
  return 'link link--locked';
}

function drawLinks() {
  const w = treeEl.clientWidth;
  const h = treeEl.clientHeight;
  linksEl.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  linksEl.replaceChildren();

  SKILL_TREE_DATA.forEach(child => {
    child.parents.forEach(pid => {
      const parent = NODE_BY_ID.get(pid);
      if (!parent) return;

      const x1 = (parent.x / 100) * w;
      const y1 = nodeCenterY(parent) + LINE_OUT;
      const x2 = (child.x / 100) * w;
      const y2 = nodeCenterY(child) - LINE_IN;
      const bend = (y2 - y1) / 2;

      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', `M${x1} ${y1} C${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`);
      path.setAttribute('class', linkClass(parent, child));
      linksEl.appendChild(path);
    });
  });
}

/* ------------------------------------------------------------------
   HEADER PROGRESS
------------------------------------------------------------------- */
function renderProgress() {
  const total = SKILL_TREE_DATA.length;
  const done = SKILL_TREE_DATA.filter(n => n.state === 'completed').length;
  const pct = Math.round((done / total) * 100);
  document.getElementById('progress-text').textContent = done + ' of ' + total + ' modules cleared';
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-bar').setAttribute('aria-valuenow', String(pct));
}

/* ------------------------------------------------------------------
   MENTOR: HUD + SPEECH BUBBLE
------------------------------------------------------------------- */
const mentorEl = document.getElementById('mentor');
const bubbleEl = document.getElementById('bubble');
let lineIndex = 0;

function renderHUD() {
  const lost = MAX_HEARTS - hearts;
  const heartsEl = document.getElementById('stat-hearts');
  heartsEl.className = 'stat stat--hearts';
  heartsEl.textContent = '\u2764\uFE0F'.repeat(hearts) + '\uD83D\uDDA4'.repeat(lost);

  const streakEl = document.getElementById('stat-streak');
  streakEl.className = 'stat stat--streak';
  streakEl.textContent = '\uD83D\uDD25 ' + streak;

  const xpEl = document.getElementById('stat-xp');
  xpEl.className = 'stat stat--xp';
  xpEl.textContent = '\u26A1 ' + xp;
}

function currentTarget() {
  return SKILL_TREE_DATA.find(n => n.state === 'unlocked');
}

function mentorLines() {
  const target = currentTarget();
  const done = SKILL_TREE_DATA.filter(n => n.state === 'completed').length;
  if (hearts <= 0) return [`No hearts left. Next heart in ${refillMinutes()} min. Revise your notes. Come back sharper.`];
  if (!target) return ['All modules cleared. Now revise. Mocks are the next battlefield.'];
  return [
    `Target: Clear the \u2018${target.title}\u2019 node today. Do not break the streak.`,
    streak > 0
      ? `${streak} correct in a row. Protect it. One module before anything else.`
      : 'Streak is zero. Build it from your next correct answer. No excuses.',
    `Hearts: ${hearts}/${MAX_HEARTS}. Each wrong answer costs one. Accuracy over speed.`,
    `${done} of ${SKILL_TREE_DATA.length} cleared. Motivation fades. Discipline does not.`
  ];
}

function say(text) {
  bubbleEl.textContent = text;
  bubbleEl.classList.remove('is-changing');
  void bubbleEl.offsetWidth; // restart the animation
  bubbleEl.classList.add('is-changing');
}

function sayNext() {
  const lines = mentorLines();
  lineIndex = (lineIndex + 1) % lines.length;
  say(lines[lineIndex]);
}

function setMentorOpen(open) {
  mentorEl.classList.toggle('is-open', open);
  const toggle = document.getElementById('mentor-toggle');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Collapse mentor' : 'Expand mentor');
  syncBottomPadding();
}

// Keep the last tree row clear of the floating widget
function syncBottomPadding() {
  document.body.style.paddingBottom = (mentorEl.offsetHeight + 16) + 'px';
  document.documentElement.style.setProperty('--mentor-h', mentorEl.offsetHeight + 'px');
}

/* ------------------------------------------------------------------
   EVENTS
------------------------------------------------------------------- */
treeEl.addEventListener('click', e => {
  const btn = e.target.closest('.node');
  if (!btn) return;
  const node = NODE_BY_ID.get(btn.dataset.id);

  if (node.state === 'unlocked') {
    openArena(node, btn);
  } else if (node.state === 'locked') {
    const missing = node.parents
      .map(id => NODE_BY_ID.get(id))
      .filter(p => p.state !== 'completed')
      .map(p => p.title);
    say(`\u2018${node.title}\u2019 is locked. Clear ${missing.join(' and ')} first. No shortcuts.`);
    btn.classList.remove('is-denied');
    void btn.offsetWidth;
    btn.classList.add('is-denied');
  } else {
    say(`\u2018${node.title}\u2019 is done. Revise it once more before the weekend.`);
  }
});

bubbleEl.addEventListener('click', sayNext);

document.getElementById('mentor-toggle').addEventListener('click', () => {
  setMentorOpen(!mentorEl.classList.contains('is-open'));
});

// Redraw connectors whenever the tree width changes (rotation, resize)
new ResizeObserver(drawLinks).observe(treeEl);
new ResizeObserver(syncBottomPadding).observe(mentorEl);

/* ------------------------------------------------------------------
   ARENA (question modal) + STRICT VOICE
------------------------------------------------------------------- */
const arenaEl = document.getElementById('arena');
const arenaCard = document.getElementById('arena-card');
const arenaTitle = document.getElementById('arena-title');
const arenaCount = document.getElementById('arena-count');
const arenaQuestion = document.getElementById('arena-question');
const arenaOptions = document.getElementById('arena-options');
const voiceBtn = document.getElementById('arena-voice');

const HAS_SPEECH = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
let voices = [];
let voiceOn = true;
let arena = null; // { node, questions, index, busy, opener }
let alertTimer = null;

if (HAS_SPEECH) {
  const loadVoices = () => { voices = speechSynthesis.getVoices(); };
  loadVoices();
  speechSynthesis.addEventListener('voiceschanged', loadVoices); // voices load async in Chrome
} else {
  voiceBtn.hidden = true;
}

function pickVoice() {
  return voices.find(v => /en-IN/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang)) || null;
}

// Lower pitch + faster rate = clipped, authoritative delivery
function speak(text) {
  if (!HAS_SPEECH || !voiceOn) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'en-IN'; }
  u.pitch = 0.8;
  u.rate = 1.1;
  u.volume = 1;
  speechSynthesis.speak(u);
}

function stopSpeaking() {
  if (HAS_SPEECH) speechSynthesis.cancel();
}

function alertMentor(text) {
  setMentorOpen(true);
  say(text);
  mentorEl.classList.add('is-alert');
  clearTimeout(alertTimer);
  alertTimer = setTimeout(() => mentorEl.classList.remove('is-alert'), 2600);
}

function shakeArena() {
  arenaCard.classList.remove('is-shaking');
  void arenaCard.offsetWidth;
  arenaCard.classList.add('is-shaking');
  setTimeout(() => arenaCard.classList.remove('is-shaking'), 450);
}

function renderQuestion() {
  const q = arena.questions[arena.index];
  arenaCount.textContent = 'Question ' + (arena.index + 1) + ' of ' + arena.questions.length;
  arenaQuestion.textContent = q.question;
  arenaOptions.replaceChildren();

  q.options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'option';
    b.dataset.value = opt;

    const key = document.createElement('span');
    key.className = 'option__key';
    key.textContent = String.fromCharCode(65 + i);

    const txt = document.createElement('span');
    txt.textContent = opt;

    b.append(key, txt);
    arenaOptions.appendChild(b);
  });
}

function openArena(node, opener) {
  checkHeartRefill();
  if (hearts <= 0) {
    alertMentor(`No hearts left. Next heart in ${refillMinutes()} min. Revise your notes until then.`);
    return;
  }
  const mod = MODULE_DATA[node.id];
  if (!mod) {
    alertMentor(`\u2018${node.title}\u2019 has no questions loaded yet. Train on another node.`);
    return;
  }
  arena = { node, questions: mod.questions.slice(0, QUESTIONS_PER_RUN), index: 0, busy: false, opener };
  arenaTitle.textContent = node.title;
  renderQuestion();
  arenaEl.hidden = false;
  document.body.classList.add('arena-open');
  say('Read carefully. A wrong answer costs a heart and your streak.');
  arenaOptions.querySelector('.option').focus();
}

function closeArena() {
  stopSpeaking();
  arenaEl.hidden = true;
  document.body.classList.remove('arena-open');
  const opener = arena && arena.opener;
  arena = null;
  if (opener && document.contains(opener)) opener.focus();
}

function unlockChildren() {
  SKILL_TREE_DATA.forEach(n => {
    if (n.state === 'locked' && n.parents.every(id => NODE_BY_ID.get(id).state === 'completed')) {
      n.state = 'unlocked';
    }
  });
}

function completeNode(node) {
  node.state = 'completed';
  unlockChildren();
  saveProgress();
  closeArena();
  renderTree();
  lineIndex = 0;
  say(mentorLines()[0]);
  const next = document.querySelector('.node--unlocked');
  if (next) next.focus({ preventScroll: true });
}

function handleCorrect(btn) {
  arena.busy = true;
  stopSpeaking();
  btn.classList.add('is-correct');
  arenaOptions.querySelectorAll('.option').forEach(b => { b.disabled = true; });

  xp += XP_PER_CORRECT;
  streak += 1;
  saveProgress();
  renderHUD();
  say(`Correct. +${XP_PER_CORRECT} XP. Streak: ${streak}. Do not get comfortable.`);

  const node = arena.node;
  setTimeout(() => {
    arena.index += 1;
    if (arena.index < arena.questions.length) {
      renderQuestion();
      arena.busy = false;
    } else {
      completeNode(node);
    }
  }, 950);
}

function handleWrong(btn, q) {
  btn.classList.add('is-wrong');
  btn.disabled = true;

  hearts = Math.max(0, hearts - 1);
  streak = 0;
  if (hearts === 0) heartsEmptyAt = Date.now();
  saveProgress();
  renderHUD();
  shakeArena();

  if (hearts === 0) {
    arena.busy = true;
    arenaOptions.querySelectorAll('.option').forEach(b => { b.disabled = true; });
    const text = q.mentorScolding + ' You are out of hearts. Session over. Revise, then return.';
    alertMentor(text);
    speak(text);
    setTimeout(closeArena, 3200);
    return;
  }
  alertMentor(q.mentorScolding);
  speak(q.mentorScolding);
}

arenaOptions.addEventListener('click', e => {
  const btn = e.target.closest('.option');
  if (!btn || btn.disabled || !arena || arena.busy) return;
  const q = arena.questions[arena.index];
  if (btn.dataset.value === q.correctAnswer) handleCorrect(btn);
  else handleWrong(btn, q);
});

document.getElementById('arena-close').addEventListener('click', closeArena);

voiceBtn.addEventListener('click', () => {
  voiceOn = !voiceOn;
  voiceBtn.setAttribute('aria-pressed', String(voiceOn));
  voiceBtn.textContent = voiceOn ? '\uD83D\uDD0A Voice on' : '\uD83D\uDD07 Voice off';
  if (!voiceOn) stopSpeaking();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && arena) closeArena();
});

/* ------------------------------------------------------------------
   SAVE GAME (localStorage)
------------------------------------------------------------------- */
const SAVE_KEY = 'kanthasth.save.polity';
const SAVE_VERSION = 1;
const HEART_REFILL_MS = 30 * 60 * 1000; // hearts come back this long after the last one is lost
let heartsEmptyAt = null;
let warnedStorage = false;

function intIn(v, min, max, fallback) {
  return Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}

// Returns the parsed save, or null for first-time users, old versions, or unreadable data
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object' || s.v !== SAVE_VERSION) return null;
    return s;
  } catch (err) {
    console.warn('[Kanthasth] Save unreadable, starting fresh:', err);
    try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* storage unavailable */ }
    return null;
  }
}

function saveProgress() {
  if (SKILL_TREE_DATA.length === 0) return; // never overwrite a save before the tree has loaded
  const nodes = {};
  SKILL_TREE_DATA.forEach(n => { nodes[n.id] = n.state; });
  const payload = { v: SAVE_VERSION, hearts, streak, xp, heartsEmptyAt, nodes, savedAt: Date.now() };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch (err) { // private mode, storage disabled, or quota full: the game keeps running
    if (!warnedStorage) {
      warnedStorage = true;
      console.warn('[Kanthasth] Progress could not be saved:', err);
    }
  }
}

function applySavedStats(s) {
  hearts = intIn(s.hearts, 0, MAX_HEARTS, MAX_HEARTS);
  streak = intIn(s.streak, 0, 1000000, 0);
  xp = intIn(s.xp, 0, 1000000000, 0);
  heartsEmptyAt = Number.isFinite(s.heartsEmptyAt) ? s.heartsEmptyAt : null;
}

// Call after the JSON data is applied: overlays the saved stats and node states on the defaults
function loadProgress() {
  const s = readSave();
  if (!s) return false; // first-time user: JSON defaults stay as they are
  applySavedStats(s);
  if (s.nodes && typeof s.nodes === 'object') {
    SKILL_TREE_DATA.forEach(n => {
      const saved = s.nodes[n.id];
      if (STATES.includes(saved)) n.state = saved;
    });
  }
  unlockChildren(); // picks up nodes added to the JSON since the save was written
  checkHeartRefill();
  return true;
}

function refillMinutes() {
  if (heartsEmptyAt === null) return Math.ceil(HEART_REFILL_MS / 60000);
  return Math.max(1, Math.ceil((heartsEmptyAt + HEART_REFILL_MS - Date.now()) / 60000));
}

// Out of hearts is no longer permanent now that progress survives a refresh
function checkHeartRefill() {
  if (hearts > 0) return false;
  const now = Date.now();
  if (heartsEmptyAt === null || heartsEmptyAt > now) {
    heartsEmptyAt = now; // timer missing or clock went backwards: restart it
    saveProgress();
    return false;
  }
  if (now - heartsEmptyAt < HEART_REFILL_MS) return false;
  hearts = MAX_HEARTS;
  heartsEmptyAt = null;
  saveProgress();
  renderHUD();
  return true;
}

// Console helper: resetProgress() wipes the save and reloads
function resetProgress() {
  try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* storage unavailable */ }
  location.reload();
}

/* ------------------------------------------------------------------
   DATA LOADING (data/polity.json)
------------------------------------------------------------------- */
const DATA_URL = 'data/polity.json';
const STATES = ['locked', 'unlocked', 'completed'];

const statusEl = document.createElement('div');
statusEl.className = 'tree__status';
statusEl.setAttribute('role', 'status');

function showStatus(message, withRetry) {
  treeEl.style.height = '';
  treeEl.querySelectorAll('.node').forEach(el => el.remove());
  linksEl.replaceChildren();

  statusEl.replaceChildren();
  statusEl.classList.toggle('is-error', Boolean(withRetry));
  const p = document.createElement('p');
  p.textContent = message;
  statusEl.appendChild(p);

  if (withRetry) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry';
    retry.addEventListener('click', loadPolity);
    statusEl.appendChild(retry);
  }
  if (!statusEl.isConnected) treeEl.appendChild(statusEl);
}

// Fail loudly on malformed JSON instead of breaking the game halfway through
function validatePolityData(d) {
  if (!d || !Array.isArray(d.nodes) || d.nodes.length === 0) throw new Error('polity.json: "nodes" must be a non-empty array');
  if (!d.modules || typeof d.modules !== 'object') throw new Error('polity.json: "modules" must be an object');

  const ids = new Set();
  d.nodes.forEach((n, i) => {
    if (!n.id || !n.title) throw new Error(`nodes[${i}] needs an id and a title`);
    if (!STATES.includes(n.state)) throw new Error(`nodes[${i}] (${n.id}) has invalid state "${n.state}"`);
    if (typeof n.x !== 'number' || typeof n.y !== 'number') throw new Error(`nodes[${i}] (${n.id}) needs numeric x and y`);
    if (ids.has(n.id)) throw new Error(`duplicate node id "${n.id}"`);
    ids.add(n.id);
  });
  d.nodes.forEach(n => (n.parents || []).forEach(pid => {
    if (!ids.has(pid)) throw new Error(`node "${n.id}" references unknown parent "${pid}"`);
  }));

  Object.entries(d.modules).forEach(([nodeId, mod]) => {
    if (!ids.has(nodeId)) throw new Error(`modules."${nodeId}" does not match any node id`);
    if (!mod || !Array.isArray(mod.questions) || mod.questions.length === 0) throw new Error(`modules."${nodeId}" needs a questions array`);
    mod.questions.forEach((q, i) => {
      const ok = q.question && Array.isArray(q.options) && q.options.length === 4 &&
                 q.options.includes(q.correctAnswer) && q.mentorScolding;
      if (!ok) throw new Error(`modules."${nodeId}".questions[${i}] is malformed (needs question, 4 options, a correctAnswer from the options, mentorScolding)`);
    });
  });
}

function applyPolityData(d) {
  const s = d.settings || {};
  MAX_HEARTS = Number.isInteger(s.maxHearts) ? s.maxHearts : 5;
  XP_PER_CORRECT = Number.isFinite(s.xpPerCorrect) ? s.xpPerCorrect : 50;
  QUESTIONS_PER_RUN = Number.isInteger(s.questionsPerRun) ? s.questionsPerRun : 1;
  hearts = MAX_HEARTS;
  streak = 0;
  xp = 0;
  heartsEmptyAt = null;

  SKILL_TREE_DATA = d.nodes.map(n => Object.assign({}, n, { parents: n.parents || [] }));
  NODE_BY_ID = new Map(SKILL_TREE_DATA.map(n => [n.id, n]));
  MODULE_DATA = d.modules;

  if (d.title) document.querySelector('.top__title').textContent = d.title;
}

async function loadPolity() {
  console.log('[Kanthasth] Loading ' + DATA_URL + '...');
  showStatus('Loading Polity\u2026', false);
  say('Loading your targets. Stand by.');

  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' while fetching ' + DATA_URL);
    const data = await res.json();
    validatePolityData(data);
    applyPolityData(data);
    const restored = loadProgress();
    console.log('[Kanthasth] ' + (restored ? 'Save game restored.' : 'No save found, starting fresh.'));

    statusEl.remove();
    renderHUD();
    renderTree();
    lineIndex = 0;
    say(mentorLines()[0]);
    console.log('[Kanthasth] Loaded ' + SKILL_TREE_DATA.length + ' nodes.');
  } catch (err) {
    console.error('[Kanthasth] Data load failed:', err);
    const hint = location.protocol === 'file:'
      ? ' Browsers block fetch() on file:// pages. Run a local server (python3 -m http.server) and open http://localhost:8000.'
      : ' ' + err.message;
    showStatus('Could not load the Polity data.' + hint, true);
    say('Data failed to load. Fix it and retry. Do not waste the session.');
  }
}

/* ------------------------------------------------------------------
   INIT
------------------------------------------------------------------- */
function init() {
  const saved = readSave();
  if (saved) applySavedStats(saved);
  renderHUD();
  syncBottomPadding();
  loadPolity();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
