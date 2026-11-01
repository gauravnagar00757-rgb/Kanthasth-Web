'use strict';

// This app switches between full screens, so a reload should always start at the top
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

/* ------------------------------------------------------------------
   DATA (filled at runtime from the Google Sheet)
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
let REPLAY_XP = 0;           // XP per correct answer when a finished module is replayed (practice)
let XP_PER_LEVEL = 500;     // every XP_PER_LEVEL total XP is one level
let unlockedSubjects = []; // subjects opened by boss fights (saved)

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

const BOSS_ICON = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M3 18l-1-11 5 4 5-7 5 7 5-4-1 11zM4 20h16v2H4z" fill="currentColor"/></svg>';

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
    btn.className = 'node node--' + data.state + (data.type === 'boss' ? ' node--boss' : '');
    btn.dataset.id = data.id;
    btn.style.left = data.x + '%';
    btn.style.top = nodeCenterY(data) + 'px';
    btn.setAttribute('aria-label', data.title + (data.type === 'boss' ? ' boss fight' : '') + ', ' + STATE_LABEL[data.state] + (data.state === 'completed' ? ', tap to replay' : ''));
    if (data.state === 'locked') btn.setAttribute('aria-disabled', 'true');

    const shape = document.createElement('span');
    shape.className = 'node__shape';
    shape.innerHTML = (data.type === 'boss' && data.state === 'unlocked') ? BOSS_ICON : ICONS[data.state];
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

  const levelEl = document.getElementById('stat-level');
  levelEl.className = 'stat stat--level';
  levelEl.textContent = 'Lv ' + levelInfo(xp).level;
}

/* ---- levels: every XP_PER_LEVEL XP is one level ---- */
function levelInfo(totalXp) {
  const per = XP_PER_LEVEL > 0 ? XP_PER_LEVEL : 500;
  const into = totalXp % per;
  return { level: Math.floor(totalXp / per) + 1, into, need: per, pct: Math.round((into / per) * 100) };
}

const toastEl = document.getElementById('toast');
const toastTitle = document.getElementById('toast-title');
const toastText = document.getElementById('toast-text');
let toastTimer = null;

function showToast(title, text) {
  toastTitle.textContent = title;
  toastText.textContent = text;
  toastEl.hidden = false;
  toastEl.classList.remove('is-in');
  void toastEl.offsetWidth;
  toastEl.classList.add('is-in');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3000);
}

// Adds XP and returns the new level number if the player just levelled up, otherwise 0
function gainXp(amount) {
  const before = levelInfo(xp).level;
  xp += amount;
  const after = levelInfo(xp).level;
  if (after > before) {
    showToast('Level ' + after, 'You are growing beautifully. Keep going at your own pace.');
    return after;
  }
  return 0;
}

function currentTarget() {
  return SKILL_TREE_DATA.find(n => n.state === 'unlocked');
}

function mentorLines() {
  const target = currentTarget();
  const done = SKILL_TREE_DATA.filter(n => n.state === 'completed').length;
  if (hearts <= 0) return [`You are out of hearts for now. Rest, breathe, and look over your notes. A new heart arrives in ${refillMinutes()} min.`];
  if (!target) return ['Every module is cleared. Wonderful work. A gentle revision would be lovely next.'];
  return [
    `Today\u2019s gentle goal: \u2018${target.title}\u2019. One calm step at a time.`,
    streak > 0
      ? `${streak} in a row. Beautiful. Keep that lovely rhythm going.`
      : 'A fresh start is a good start. Your next answer begins a new streak.',
    `You have ${hearts} of ${MAX_HEARTS} hearts. Mistakes are simply part of learning.`,
    `${done} of ${SKILL_TREE_DATA.length} cleared. You are doing wonderfully, so be proud of every step.`
  ].concat(mission && !mission.rewarded ? [`Today\u2019s mission: ${mission.done} of ${mission.goal} cleared. One calm step at a time.`] : []);
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
  document.body.style.paddingBottom = mentorEl.offsetHeight ? (mentorEl.offsetHeight + 16) + 'px' : '0px';
  document.documentElement.style.setProperty('--mentor-h', mentorEl.offsetHeight + 'px');
}

/* ------------------------------------------------------------------
   EVENTS
------------------------------------------------------------------- */
treeEl.addEventListener('click', e => {
  const btn = e.target.closest('.node');
  if (!btn) return;
  const node = NODE_BY_ID.get(btn.dataset.id);

  if (node.state === 'unlocked' || node.state === 'completed') {
    openArena(node, btn); // finished modules open too: that is a practice replay
  } else if (node.state === 'locked') {
    const missing = node.parents
      .map(id => NODE_BY_ID.get(id))
      .filter(p => p.state !== 'completed')
      .map(p => p.title);
    say(`\u2018${node.title}\u2019 is not open yet. Finish ${missing.join(' and ')} first and it will open for you. You can do it.`);
    btn.classList.remove('is-denied');
    void btn.offsetWidth;
    btn.classList.add('is-denied');
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
const explainEl = document.getElementById('arena-explain');
const explainVerdict = document.getElementById('explain-verdict');
const explainText = document.getElementById('explain-text');
const continueBtn = document.getElementById('arena-continue');
const arenaType = document.getElementById('arena-type');
const arenaTimer = document.getElementById('arena-timer');
const timerFill = document.getElementById('timer-fill');
const timerText = document.getElementById('timer-text');
const explainList = document.getElementById('explain-list');
const arenaPyq = document.getElementById('arena-pyq');

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

// Prefer a soft, female-sounding English voice (Indian English first) when the device has one
const SOFT_VOICE = /samantha|karen|moira|tessa|veena|fiona|serena|allison|\bava\b|susan|zira|hazel|heera|aria|jenny|neerja|swara|sonia|libby|catherine|female|woman/i;
const MALE_VOICE = /\bmale\b|david|\bmark\b|daniel|alex|fred|george|rishi|ravi|prabhat|james|\bguy\b|ryan|thomas|oliver|\bman\b/i;

function pickVoice() {
  const english = voices.filter(v => /^en/i.test(v.lang));
  const pool = english.length ? english : voices;
  let best = null;
  let bestScore = -Infinity;
  pool.forEach(v => {
    const score = (SOFT_VOICE.test(v.name) ? 4 : 0) - (MALE_VOICE.test(v.name) ? 5 : 0) + (/en[-_]IN/i.test(v.lang) ? 2 : 0);
    if (score > bestScore) { best = v; bestScore = score; }
  });
  return best;
}

// A slightly higher pitch and a slower rate give a calm, reassuring delivery
function speak(text) {
  if (!HAS_SPEECH || !voiceOn) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'en-IN'; }
  u.pitch = 1.2;
  u.rate = 0.85;
  u.volume = 0.95;
  speechSynthesis.speak(u);
  return u;
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

/* ---- question formats: mcq, match, fillBlank (and bossFight, see below) ---- */
const TYPE_LABEL = { mcq: 'Multiple choice', trueFalse: 'True or false', match: 'Match the pairs', fillBlank: 'Fill in the blank', slide: 'Lesson' };
const TF_ICONS = {
  true: '<svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true"><path d="M5 12.500l4.500 4.500L19 7.500" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  false: '<svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true"><path d="M6.500 6.500l11 11M17.500 6.500l-11 11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'
};
const PAIR_COLORS = ['var(--pair-1)', 'var(--pair-2)', 'var(--pair-3)', 'var(--pair-4)', 'var(--pair-5)'];
const questionType = q => q.questionType || 'mcq';

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Case, spacing and punctuation never decide a fill-in-the-blank answer
function normalizeAnswer(s) {
  return String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function answerOf(q) {
  const type = questionType(q);
  if (type === 'fillBlank') return String(q.answer);
  if (type === 'trueFalse') return q.correctAnswer ? 'True' : 'False';
  return q.correctAnswer;
}

const currentQuestion = () => arena.rapidQ || arena.questions[arena.index];

function lockInputs() {
  arenaOptions.querySelectorAll('button, input').forEach(el => { el.disabled = true; });
}

function focusFirst() {
  const el = arenaOptions.querySelector('button:not(:disabled), input:not(:disabled)');
  if (el) el.focus({ preventScroll: true });
}

function fillList(items) {
  explainList.replaceChildren();
  items.forEach(it => {
    const li = document.createElement('li');
    if (it.cls) li.className = it.cls;
    if (it.head) {
      const b = document.createElement('b');
      b.textContent = it.head;
      li.append(b, document.createTextNode(' '));
    }
    li.appendChild(document.createTextNode(it.text));
    explainList.appendChild(li);
  });
  explainList.hidden = items.length === 0;
}

function renderMcq(q) {
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

function renderMatch(q) {
  const lefts = q.pairs.map((p, i) => ({ i, text: p.left }));
  let rights = shuffle(q.pairs.map((p, i) => ({ i, text: p.right })));
  for (let tries = 0; tries < 5 && rights.every((r, k) => r.i === k); tries++) rights = shuffle(rights);

  arena.match = { sel: null, solved: 0, total: q.pairs.length };
  [['left', lefts], ['right', rights]].forEach(([side, items]) => {
    const col = document.createElement('div');
    col.className = 'match__col';
    items.forEach(it => {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'tile';
      t.dataset.side = side;
      t.dataset.idx = String(it.i);
      t.textContent = it.text;
      col.appendChild(t);
    });
    arenaOptions.appendChild(col);
  });
}

function renderFill(q) {
  const wrap = document.createElement('div');
  wrap.className = 'fill';

  const input = document.createElement('input');
  input.className = 'fill__input';
  input.type = 'text';
  input.placeholder = 'Type your answer';
  ['autocomplete:off', 'autocapitalize:none', 'autocorrect:off', 'spellcheck:false', 'enterkeyhint:done', 'aria-label:Your answer']
    .forEach(pair => { const k = pair.indexOf(':'); input.setAttribute(pair.slice(0, k), pair.slice(k + 1)); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submitFill(); }
  });

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'btn btn--primary fill__submit';
  submit.textContent = 'Lock in answer';
  submit.addEventListener('click', submitFill);

  wrap.append(input, submit);
  if (q.hint) {
    const hint = document.createElement('p');
    hint.className = 'fill__hint';
    hint.textContent = 'Hint: ' + q.hint;
    wrap.appendChild(hint);
  }
  arenaOptions.appendChild(wrap);
}

// Universal image support: any question or slide may carry an imageUrl (and an optional imageAlt)
function renderFigure(q) {
  const old = document.getElementById('arena-figure');
  if (old) old.remove();
  if (!q.imageUrl) return;

  const fig = document.createElement('figure');
  fig.className = 'arena__figure';
  fig.id = 'arena-figure';
  const img = document.createElement('img');
  img.className = 'arena__img';
  img.alt = q.imageAlt || '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => fig.remove()); // a missing or offline image never blocks the lesson
  img.src = q.imageUrl;
  fig.appendChild(img);
  arenaQuestion.before(fig);
}

function renderTrueFalse() {
  [['true', 'True'], ['false', 'False']].forEach(([val, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tf tf--' + val;
    b.dataset.value = val;
    const icon = document.createElement('span');
    icon.className = 'tf__icon';
    icon.innerHTML = TF_ICONS[val];
    const txt = document.createElement('span');
    txt.className = 'tf__label';
    txt.textContent = label;
    b.append(icon, txt);
    arenaOptions.appendChild(b);
  });
}

/* ---- Surprise Engine: every lesson slide plays one random mechanic ---- */
const BURN_SECONDS = 15;        // Burning Scroll: how long the text takes to burn away
const INSIGHT_XP = 10;          // Insight Hunter: bonus XP for each keyword caught
const INSIGHT_GLOW_MS = 2000;   // how long a keyword glows
const WAGER_STAKE = 50;         // The Wager: XP at stake (win pays 3x, a miss loses it)
const WAGER_READ_SECONDS = 20;  // The Wager: reading time before the quiz
const RAPID_COUNT = 2;          // The Wager: rapid-fire questions
const RAPID_SECONDS = 8;        // The Wager: seconds per rapid-fire question
let forcedMechanic = null;      // set to 'burn', 'insight' or 'wager' to force one (used by tests)

const MECHANICS = {
  burn:    { icon: '\uD83D\uDD25', name: 'Burning Scroll', hint: 'The words burn away from the top. Read fast.' },
  insight: { icon: '\u2728',       name: 'Insight Hunter', hint: 'Tap the keywords while they glow to earn bonus XP.' },
  wager:   { icon: '\uD83C\uDFB2', name: 'The Wager',      hint: 'Bet on your memory, read, then answer fast.' }
};
const COMMON_WORDS = new Set(['because', 'another', 'between', 'through', 'however', 'without', 'example', 'during', 'around', 'which', 'called', 'usually', 'several', 'something']);
const wagerEligible = q => questionType(q) === 'mcq' || questionType(q) === 'trueFalse';

function stopSurprise() {
  const sp = arena && arena.surprise;
  if (!sp) return;
  sp.timers.forEach(t => { clearTimeout(t); clearInterval(t); });
  if (sp.raf) cancelAnimationFrame(sp.raf);
  arena.surprise = null;
}

// Keywords come from the sheet's keywords column; without it the longest distinctive words are used
function pickKeywords(q) {
  const text = String(q.explanation);
  let list = Array.isArray(q.keywords) && q.keywords.length ? q.keywords.slice() : [];
  if (!list.length) {
    const seen = new Set();
    (text.match(/[A-Za-z][A-Za-z-]{6,}/g) || []).forEach(w => {
      const k = w.toLowerCase();
      if (!seen.has(k) && !COMMON_WORDS.has(k)) { seen.add(k); list.push(w); }
    });
    list = list.slice(0, 4);
  }
  return list.filter(k => text.toLowerCase().includes(k.toLowerCase()));
}

function wagerAvailable() {
  return !arena.practice && !arena.boss && !arena.rapid && xp >= WAGER_STAKE &&
         arena.questions.slice(arena.index + 1).some(wagerEligible);
}

// Math.random() picks one of the three mechanics; a mechanic that cannot work right now is left out of the draw
function chooseMechanic(keywords) {
  const pool = ['burn'];
  if (keywords.length >= 2) pool.push('insight');
  if (wagerAvailable()) pool.push('wager');
  if (forcedMechanic && pool.includes(forcedMechanic)) return forcedMechanic;
  return pool[Math.floor(Math.random() * pool.length)];
}

function slideBody(q, keywords) {
  const body = document.createElement('div');
  body.className = 'slide__text';
  const buttons = [];
  const used = new Set();
  const re = keywords.length
    ? new RegExp('\\b(' + keywords.slice().sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'i')
    : null;

  String(q.explanation).split(/\n+/).filter(Boolean).forEach(text => {
    const p = document.createElement('p');
    p.className = 'slide__body';
    let rest = text;
    while (rest) {
      const m = re ? re.exec(rest) : null;
      if (!m) { p.appendChild(document.createTextNode(rest)); break; }
      p.appendChild(document.createTextNode(rest.slice(0, m.index)));
      const key = m[0].toLowerCase();
      if (used.has(key)) p.appendChild(document.createTextNode(m[0]));
      else {
        used.add(key);
        const b = document.createElement('button'); // a keyword only reacts while it glows
        b.type = 'button';
        b.className = 'kw';
        b.disabled = true;
        b.textContent = m[0];
        p.appendChild(b);
        buttons.push(b);
      }
      rest = rest.slice(m.index + m[0].length);
    }
    body.appendChild(p);
  });
  return { body, buttons };
}

function renderSlide(q) {
  const wrap = document.createElement('div');
  wrap.className = 'slide';
  const keywords = pickKeywords(q);
  const mech = chooseMechanic(keywords);
  arena.surprise = { mech, timers: [], raf: 0, caught: 0, phase: 'read' };

  const banner = document.createElement('div');
  banner.className = 'surprise surprise--' + mech;
  const icon = document.createElement('span');
  icon.className = 'surprise__icon';
  icon.textContent = MECHANICS[mech].icon;
  const text = document.createElement('span');
  text.className = 'surprise__text';
  const name = document.createElement('b');
  name.textContent = MECHANICS[mech].name;
  text.append(name, document.createTextNode(' ' + MECHANICS[mech].hint));
  const meta = document.createElement('span');
  meta.className = 'surprise__meta';
  banner.append(icon, text, meta);
  wrap.appendChild(banner);

  const { body, buttons } = slideBody(q, mech === 'insight' ? keywords : []);
  wrap.appendChild(body);

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn btn--primary slide__next';
  next.textContent = 'I Understand / Next';
  next.addEventListener('click', onSlideNext);
  wrap.appendChild(next);
  arenaOptions.appendChild(wrap);

  if (mech === 'burn') startBurn(body, meta);
  else if (mech === 'insight') startInsight(body, meta, buttons);
  else startWagerGate(wrap, body, meta, next);
  arenaDataMechanic(mech);
}
function arenaDataMechanic(mech) { arenaEl.dataset.mechanic = mech; }

// Mechanic 1: the text burns away from the top to the bottom in BURN_SECONDS
function startBurn(body, meta) {
  const sp = arena.surprise;
  const t0 = performance.now();
  body.classList.add('slide__text--burn');
  const frame = now => {
    if (!arena || arena.surprise !== sp) return;
    const p = Math.min(1, (now - t0) / (BURN_SECONDS * 1000));
    body.style.setProperty('--burn', String(-14 + p * 114));
    meta.textContent = Math.ceil(BURN_SECONDS * (1 - p)) + 's';
    if (p < 1) sp.raf = requestAnimationFrame(frame);
    else { body.classList.add('is-burned'); meta.textContent = 'Burned'; }
  };
  sp.raf = requestAnimationFrame(frame);
}

// Mechanic 2: keywords glow at random for 2 seconds; tapping one while it glows pays bonus XP
function startInsight(body, meta, buttons) {
  const sp = arena.surprise;
  const bonus = arena.practice ? 0 : INSIGHT_XP; // replays are practice: nothing to farm
  const update = () => { meta.textContent = sp.caught + '/' + buttons.length; };
  update();

  const glowNext = () => {
    if (!arena || arena.surprise !== sp) return;
    const idle = buttons.filter(b => !b.classList.contains('kw--caught') && !b.classList.contains('kw--glow'));
    if (idle.length) {
      const b = idle[Math.floor(Math.random() * idle.length)];
      b.classList.add('kw--glow');
      b.disabled = false;
      sp.timers.push(setTimeout(() => { b.classList.remove('kw--glow'); b.disabled = true; }, INSIGHT_GLOW_MS));
    }
    // one word glows at a time: the next one comes after this glow has ended, plus a short random pause
    if (buttons.some(b => !b.classList.contains('kw--caught'))) sp.timers.push(setTimeout(glowNext, INSIGHT_GLOW_MS + 500 + Math.random() * 1000));
  };
  sp.timers.push(setTimeout(glowNext, 700));

  body.addEventListener('click', e => {
    const b = e.target.closest('.kw');
    if (!b || b.disabled || !b.classList.contains('kw--glow')) return;
    b.classList.remove('kw--glow');
    b.classList.add('kw--caught');
    b.disabled = true;
    sp.caught += 1;
    update();
    if (bonus) {
      gainXp(bonus);
      renderHUD();
      saveProgress();
      say(`Sharp eyes! +${bonus} XP for catching \u2018${b.textContent}\u2019.`);
    } else {
      say(`Sharp eyes! You caught \u2018${b.textContent}\u2019.`);
    }
  });
}

// Mechanic 3: bet first, then read for WAGER_READ_SECONDS, then a rapid-fire quiz decides
function startWagerGate(wrap, body, meta, next) {
  const sp = arena.surprise;
  sp.phase = 'gate';
  body.classList.add('is-hidden');
  next.hidden = true;
  meta.textContent = 'Stake ' + WAGER_STAKE;

  const gate = document.createElement('div');
  gate.className = 'wager';
  const q = document.createElement('p');
  q.className = 'wager__q';
  q.textContent = `Bet ${WAGER_STAKE} XP on your memory?`;
  const rules = document.createElement('p');
  rules.className = 'wager__rules';
  rules.textContent = `Read for ${WAGER_READ_SECONDS} seconds, then answer ${RAPID_COUNT} rapid-fire questions. Get them all right and you receive ${WAGER_STAKE * 3} XP (3x). Miss one and the ${WAGER_STAKE} XP stays gone.`;
  const row = document.createElement('div');
  row.className = 'wager__btns';
  const bet = document.createElement('button');
  bet.type = 'button';
  bet.className = 'btn btn--primary';
  bet.textContent = 'Place the bet';
  const pass = document.createElement('button');
  pass.type = 'button';
  pass.className = 'btn btn--ghost';
  pass.textContent = 'Just read';
  row.append(bet, pass);
  gate.append(q, rules, row);
  wrap.insertBefore(gate, body);

  const reveal = () => { gate.remove(); body.classList.remove('is-hidden'); next.hidden = false; };
  pass.addEventListener('click', () => { reveal(); sp.phase = 'read'; meta.textContent = 'No bet'; say('No bet this time. Read at your own pace.'); next.focus({ preventScroll: true }); });
  bet.addEventListener('click', () => {
    xp = Math.max(0, xp - WAGER_STAKE); // the stake leaves at once, so closing the app cannot dodge it
    renderHUD();
    saveProgress();
    reveal();
    sp.phase = 'wager-read';
    say(`Bet placed: ${WAGER_STAKE} XP. Read carefully. The quiz starts when the time is up.`);
    arenaTimer.hidden = false;
    sp.readEnds = Date.now() + WAGER_READ_SECONDS * 1000;
    const tick = () => {
      if (!arena || arena.surprise !== sp) return;
      const left = Math.max(0, sp.readEnds - Date.now());
      timerFill.style.width = ((left / (WAGER_READ_SECONDS * 1000)) * 100) + '%';
      timerText.textContent = Math.ceil(left / 1000) + 's';
      arenaTimer.classList.toggle('is-low', left <= 5000);
      if (left <= 0) startRapid();
    };
    tick();
    sp.timers.push(setInterval(tick, 100));
    next.focus({ preventScroll: true });
  });
  bet.focus({ preventScroll: true });
}

// The rapid-fire questions are the next quiz questions of this run: they are asked now, one by one, against the clock
function startRapid() {
  stopSurprise();
  arenaTimer.hidden = true;
  const picked = arena.questions.slice(arena.index + 1).filter(wagerEligible).slice(0, RAPID_COUNT);
  if (!picked.length) { // nothing left to ask: the stake comes back
    xp += WAGER_STAKE;
    renderHUD();
    saveProgress();
    showToast('Stake returned', 'There were no quiz questions left.');
    advanceFromSlide();
    return;
  }
  picked.forEach(p => arena.questions.splice(arena.questions.indexOf(p), 1));
  arena.consumed += picked.length;
  arena.rapid = { items: picked, pos: 0, correct: 0, over: false, answering: false, endsAt: 0, timerId: null, nextTimer: null, results: [] };
  nextRapid();
}

function nextRapid() {
  const r = arena.rapid;
  arena.rapidQ = r.items[r.pos];
  arena.busy = false;
  r.answering = false;
  r.endsAt = Date.now() + RAPID_SECONDS * 1000;
  renderQuestion();
  arenaTimer.hidden = false;
  rapidTick();
  clearInterval(r.timerId);
  r.timerId = setInterval(rapidTick, 100);
  say(`Rapid-fire ${r.pos + 1} of ${r.items.length}. ${RAPID_SECONDS} seconds. Trust your memory.`);
  focusFirst();
}

function rapidTick() {
  const r = arena && arena.rapid;
  if (!r || r.over || r.answering) return;
  const left = Math.max(0, r.endsAt - Date.now());
  timerFill.style.width = ((left / (RAPID_SECONDS * 1000)) * 100) + '%';
  timerText.textContent = Math.ceil(left / 1000) + 's';
  arenaTimer.classList.toggle('is-low', left <= 3000);
  if (left <= 0) { // out of time counts as a miss
    arena.busy = true;
    lockInputs();
    arena.run.mistakes += 1;
    commitRun(arena);
    rapidAnswer(currentQuestion(), false);
  }
}

function rapidAnswer(q, ok) {
  const r = arena.rapid;
  if (r.over) return;
  clearInterval(r.timerId);
  r.answering = true;
  r.results.push({ q, ok });
  if (ok) r.correct += 1;
  r.nextTimer = setTimeout(() => {
    if (!arena || arena.rapid !== r) return;
    r.pos += 1;
    if (r.pos < r.items.length) nextRapid(); else endRapid();
  }, 650);
}

function endRapid() {
  const r = arena.rapid;
  r.over = true;
  clearInterval(r.timerId);
  clearTimeout(r.nextTimer);
  arenaTimer.hidden = true;
  arenaTimer.classList.remove('is-low');

  const win = r.correct === r.items.length;
  let verdict, text;
  if (win) {
    gainXp(WAGER_STAKE * 3);
    renderHUD();
    verdict = `Wager won! +${WAGER_STAKE * 3} XP`;
    text = 'Your memory held beautifully. Here is a quick review of what you answered.';
    say(`You won the wager and received ${WAGER_STAKE * 3} XP. Wonderful memory.`);
    speak('You won the wager. Wonderful memory.');
  } else {
    verdict = `Wager lost. The ${WAGER_STAKE} XP stays gone.`;
    text = 'That is perfectly alright. The review below will help it stay with you next time.';
    say('The wager did not go your way, and that is okay. Have a calm look at the review.');
  }
  saveProgress();
  const items = r.results.map(x => ({
    cls: x.ok ? 'is-ok' : 'is-bad',
    head: x.ok ? '\u2713' : '\u2717',
    text: x.ok ? x.q.question : `${x.q.question} Answer: ${answerOf(x.q)}. ${x.q.explanation}`
  }));
  arena.rapid = null;
  arena.rapidQ = null;
  arena.result = 'wager';
  revealExplain(win, verdict, text, items);
}

function advanceFromSlide() {
  arena.index += 1;
  if (arena.index < arena.questions.length) {
    const nextIsTest = questionType(currentQuestion()) !== 'slide';
    renderQuestion();
    if (nextIsTest) say('Lovely. Now let us try a few questions together, gently.');
    focusFirst();
    return;
  }
  completeNode(arena.node); // a lessons-only module is finished once the last slide is read
}

function onSlideNext() {
  if (!arena || arena.busy) return;
  const sp = arena.surprise;
  if (sp && sp.phase === 'wager-read') { startRapid(); return; } // ready early: the quiz starts now
  stopSpeaking();
  stopSurprise();
  advanceFromSlide();
}


function onTrueFalseClick(btn) {
  const q = currentQuestion();
  const chose = btn.dataset.value === 'true';
  if (chose === q.correctAnswer) {
    btn.classList.add('is-correct');
    finishCorrect(q);
  } else {
    btn.classList.add('is-wrong');
    const right = arenaOptions.querySelector('.tf[data-value="' + String(q.correctAnswer) + '"]');
    if (right) right.classList.add('is-answer');
    finishWrong(q, { answerText: q.correctAnswer ? 'True' : 'False' });
  }
}

function countLabel(type) {
  if (arena.rapid) return 'Wager quiz ' + (arena.rapid.pos + 1) + ' of ' + arena.rapid.items.length;
  const isSlide = x => questionType(x) === 'slide';
  const upto = arena.questions.slice(0, arena.index + 1);
  if (type === 'slide') return 'Lesson ' + upto.filter(isSlide).length + ' of ' + arena.slideCount;
  return 'Question ' + (upto.filter(x => !isSlide(x)).length + arena.consumed) + ' of ' + (arena.questions.filter(x => !isSlide(x)).length + arena.consumed);
}

function renderQuestion() {
  stopSurprise();
  const q = currentQuestion();
  const type = questionType(q);
  if (!arena.boss && !arena.rapid) { arenaTimer.hidden = true; arenaTimer.classList.remove('is-low'); }
  explainEl.hidden = true;
  fillList([]);
  arena.match = null;
  arenaCard.scrollTop = 0;
  arenaCard.classList.remove('is-step'); // restart the ease-in so each step feels continuous
  void arenaCard.offsetWidth;
  arenaCard.classList.add('is-step');

  arenaEl.dataset.type = arena.boss ? 'bossFight' : (arena.rapid ? 'rapid' : type);
  arenaEl.dataset.mechanic = '';
  arenaCount.textContent = countLabel(type);
  arenaType.textContent = arena.boss ? 'Boss fight' : (arena.rapid ? 'Rapid-fire' : TYPE_LABEL[type]);
  const tag = [q.targetExam, q.pyqYear].filter(Boolean).join(' ');
  arenaPyq.hidden = !tag;
  arenaPyq.textContent = tag ? '\u2B50 ' + (q.targetExam ? tag : 'PYQ ' + q.pyqYear) : '';

  renderFigure(q);
  renderMedia(collectMedia(q));
  arenaQuestion.textContent = q.question;
  arenaQuestion.className = 'arena__q' + (type === 'slide' ? ' arena__q--slide' : '');
  arenaOptions.className = 'arena__options arena__options--' + type;
  arenaOptions.replaceChildren();

  if (type === 'match') renderMatch(q);
  else if (type === 'fillBlank') renderFill(q);
  else if (type === 'trueFalse') renderTrueFalse();
  else if (type === 'slide') {
    renderSlide(q);
    say('Take your time with this one. Tap Next when it feels clear.');
  } else renderMcq(q);
}

/* ---- module analytics: attempts, mistakes and time spent (saved in nodeStats) ---- */
function newRun() {
  return { mistakes: 0, correct: 0, activeMs: 0, resumedAt: performance.now(), committedMs: 0, committedMistakes: 0, committedCorrect: 0 };
}
function runElapsed(r) { return r.activeMs + (r.resumedAt === null ? 0 : performance.now() - r.resumedAt); }
function pauseRun(r) { if (r.resumedAt !== null) { r.activeMs += performance.now() - r.resumedAt; r.resumedAt = null; } }
function resumeRun(r) { if (r.resumedAt === null) r.resumedAt = performance.now(); }

// Moves what happened since the last commit into the all-time numbers of the module
function commitRun(a) {
  if (!a || !a.run) return;
  const r = a.run;
  const st = statsFor(a.node.id);
  const ms = Math.round(runElapsed(r));
  st.totalTime = Math.round((st.totalTime + (ms - r.committedMs) / 1000) * 1000) / 1000; // seconds
  r.committedMs = ms;
  st.mistakes += r.mistakes - r.committedMistakes; r.committedMistakes = r.mistakes;
  st.correct += r.correct - r.committedCorrect;    r.committedCorrect = r.correct;
  st.lastPlayed = Date.now();
}

// Time only counts while the player is really there: it pauses when the tab is hidden or the app is closed
document.addEventListener('visibilitychange', () => {
  if (!arena || !arena.run) return;
  if (document.hidden) { pauseRun(arena.run); commitRun(arena); saveProgress(); }
  else resumeRun(arena.run);
});
window.addEventListener('pagehide', () => {
  if (arena && arena.run) { pauseRun(arena.run); commitRun(arena); saveProgress(); }
});
window.addEventListener('pageshow', () => { if (arena && arena.run && !document.hidden) resumeRun(arena.run); });

function formatDuration(ms) {
  const total = Math.round(ms / 1000);
  if (total < 60) return total + 's';
  const m = Math.floor(total / 60);
  if (m < 60) return m + 'm ' + String(total % 60).padStart(2, '0') + 's';
  return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
}

/* ---- Performance Analysis modal ---- */
const analysisEl = document.getElementById('analysis');
const analysisDone = document.getElementById('analysis-done');
const analysisAgain = document.getElementById('analysis-again');
let analysisNode = null;

function statTile(value, label) {
  const tile = document.createElement('div');
  tile.className = 'tile-stat';
  const v = document.createElement('span');
  v.className = 'tile-stat__v';
  v.textContent = String(value);
  const k = document.createElement('span');
  k.className = 'tile-stat__k';
  k.textContent = label;
  tile.append(v, k);
  return tile;
}

function showAnalysis(a, report) {
  const st = statsFor(a.node.id);
  const done = report.outcome === 'completed';
  analysisNode = a.node;

  const badge = document.getElementById('analysis-badge');
  badge.textContent = done ? (a.practice ? 'Practice complete' : 'Module completed') : 'Run ended';
  badge.className = 'analysis__badge ' + (done ? 'is-done' : 'is-ended');
  document.getElementById('analysis-node').textContent = a.node.title;

  const runBox = document.getElementById('analysis-run');
  runBox.replaceChildren(statTile(formatDuration(runElapsed(a.run)), 'Time'), statTile(a.run.mistakes, 'Mistakes'), statTile(a.run.correct, 'Correct'));
  const allBox = document.getElementById('analysis-all');
  allBox.replaceChildren(statTile(st.attempts, 'Attempts'), statTile(st.mistakes, 'Mistakes'), statTile(formatDuration(st.totalTime * 1000), 'Total time'), statTile(st.completions, 'Completed'));

  let note;
  if (done && report.unlocked.length) note = 'Unlocked next: ' + report.unlocked.join(', ') + '.';
  else if (done) note = a.practice ? 'Replays never lock a module again. Come back whenever you like.' : 'Well done. Take a calm breath before the next one.';
  else note = 'Your progress is safe. This module stays open, so you can play it again whenever you like.';
  document.getElementById('analysis-note').textContent = note;

  analysisEl.classList.remove('hidden');
  analysisDone.focus();
}

function hideAnalysis() {
  analysisEl.classList.add('hidden');
  analysisNode = null;
  if (pendingChill) { pendingChill = false; showChill(); }
}

analysisDone.addEventListener('click', hideAnalysis);
analysisAgain.addEventListener('click', () => {
  const node = analysisNode;
  hideAnalysis();
  if (node) openArena(node, null);
});
analysisEl.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const order = [analysisAgain, analysisDone];
  const i = order.indexOf(document.activeElement);
  order[(i + (e.shiftKey ? -1 : 1) + order.length) % order.length].focus();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !analysisEl.classList.contains('hidden')) hideAnalysis();
});

/* ---- simulations and deep-dive videos (optional simulationUrl / videoUrl) ---- */
function isLocalHost(h) { return h === 'localhost' || h === '127.0.0.1'; }

// Turns a link into something that can be embedded. Returns null for links that are not safe to embed
function mediaEmbed(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl).trim()); } catch (_) { return null; }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLocalHost(u.hostname))) return null;

  const host = u.hostname.replace(/^www\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else { const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/); id = m ? m[1] : null; }
  }
  if (id && /^[\w-]{6,}$/.test(id)) return { type: 'iframe', src: 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0', url: u.href };
  if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) return { type: 'video', src: u.href, url: u.href };
  return { type: 'iframe', src: u.href, url: u.href };
}

function collectMedia(q) {
  const items = [];
  const add = (kind, url) => { if (url && !items.some(i => i.url === url)) items.push({ kind, url }); };
  if (arena && arena.index === 0 && arena.mod) { // the module's own resources open with its first step
    add('sim', arena.mod.simulationUrl);
    add('video', arena.mod.videoUrl);
  }
  add('sim', q.simulationUrl);
  add('video', q.videoUrl);
  return items;
}

function buildMediaPanel(item) {
  const info = mediaEmbed(item.url);
  const panel = document.createElement('div');
  panel.className = 'media__panel';
  const frame = document.createElement('div');
  frame.className = 'media__frame';

  if (!info) {
    frame.classList.add('media__frame--note');
    frame.textContent = 'This link cannot be shown inside the app.';
  } else if (!navigator.onLine) {
    frame.classList.add('media__frame--note');
    frame.textContent = 'You are offline. Simulations and videos need an internet connection.';
  } else if (info.type === 'video') {
    const v = document.createElement('video');
    v.src = info.src;
    v.controls = true;
    v.preload = 'none';
    v.playsInline = true;
    frame.appendChild(v);
  } else {
    const f = document.createElement('iframe');
    f.src = info.src;
    f.title = item.kind === 'sim' ? 'Interactive simulation' : 'Deep-dive video';
    f.loading = 'lazy';
    f.allowFullscreen = true;
    f.setAttribute('allow', 'fullscreen; encrypted-media; picture-in-picture');
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation');
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.appendChild(f);
  }
  panel.appendChild(frame);

  if (info) {
    const open = document.createElement('a');
    open.className = 'media__open';
    open.href = info.url;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.textContent = 'Open in a new tab';
    panel.appendChild(open);
  }
  return panel;
}

// Nothing loads until the player taps: no data used, no autoplay, and stepping on destroys the embed
function renderMedia(items) {
  const old = document.getElementById('arena-media');
  if (old) old.remove();
  if (!items.length) return;

  const wrap = document.createElement('div');
  wrap.className = 'media';
  wrap.id = 'arena-media';
  const row = document.createElement('div');
  row.className = 'media__row';
  const holder = document.createElement('div');
  let openKey = null;

  items.forEach(item => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'media__btn media__btn--' + item.kind;
    const same = items.filter(x => x.kind === item.kind);
    const label = item.kind === 'sim' ? 'Simulation' : 'Visual Concept';
    b.textContent = items.length === 1 ? 'Visual Concept / Simulation' : (same.length > 1 ? label + ' ' + (same.indexOf(item) + 1) : label);
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', () => {
      const key = item.kind + item.url;
      row.querySelectorAll('.media__btn').forEach(x => x.setAttribute('aria-expanded', 'false'));
      holder.replaceChildren(); // closing or switching destroys the old embed, which also stops its sound
      if (openKey === key) { openKey = null; return; }
      openKey = key;
      b.setAttribute('aria-expanded', 'true');
      holder.appendChild(buildMediaPanel(item));
    });
    row.appendChild(b);
  });
  wrap.append(row, holder);
  arenaQuestion.before(wrap);
}


function interleave(slides, tests) {
  if (!slides.length) return tests.slice();
  if (!tests.length) return slides.slice();
  const per = Math.ceil(tests.length / slides.length);
  const out = [];
  let t = 0;
  slides.forEach(sl => { out.push(sl); for (let i = 0; i < per && t < tests.length; i++) out.push(tests[t++]); });
  while (t < tests.length) out.push(tests[t++]);
  return out;
}

function openArena(node, opener) {
  const practice = node.state === 'completed'; // replaying a finished module is practice: hearts are safe
  checkHeartRefill();
  if (hearts <= 0 && !practice) {
    alertMentor(`No hearts left right now. A new one arrives in ${refillMinutes()} min. Rest, and review your notes until then. Finished modules are still open for practice.`);
    return;
  }
  const mod = MODULE_DATA[node.id];
  if (!mod) {
    alertMentor(`\u2018${node.title}\u2019 has no questions yet. Let us try another one together.`);
    return;
  }

  const isBoss = mod.questionType === 'bossFight';
  const per = Number.isInteger(mod.questionsPerRun) ? mod.questionsPerRun : QUESTIONS_PER_RUN;
  const slides = isBoss ? [] : mod.questions.filter(q => questionType(q) === 'slide');
  const tests = mod.questions.filter(q => questionType(q) !== 'slide');
  const picked = isBoss ? shuffle(tests) : shuffle(tests).slice(0, Math.max(1, Math.min(per, tests.length)));
  const questions = interleave(slides, picked);

  arena = {
    node, mod, questions, slideCount: slides.length, consumed: 0, rapid: null, rapidQ: null, surprise: null, index: 0, busy: false, awaitingContinue: false, result: null, match: null, opener, boss: null,
    practice, xpPer: practice ? REPLAY_XP : XP_PER_CORRECT, run: newRun()
  };

  const st = statsFor(node.id); // every opening of a module is one attempt
  st.attempts += 1;
  st.lastPlayed = Date.now();
  saveProgress();

  if (isBoss) {
    const limit = Number.isFinite(mod.timeLimit) ? mod.timeLimit : 60;
    const required = Number.isInteger(mod.requiredCorrect) ? Math.min(mod.requiredCorrect, questions.length) : questions.length;
    arena.boss = {
      limit, required, bonus: practice ? 0 : (Number.isFinite(mod.bonusXp) ? mod.bonusXp : 0),
      endsAt: Date.now() + limit * 1000, correct: 0, results: [], over: false, timerId: null, nextTimer: null
    };
  }

  arenaTitle.textContent = node.title;
  renderQuestion();
  arenaEl.hidden = false;
  document.body.classList.add('arena-open');

  if (isBoss) {
    arenaTimer.hidden = false;
    bossTick();
    arena.boss.timerId = setInterval(bossTick, 100);
    say(`Boss fight. You have ${arena.boss.limit} seconds and need ${arena.boss.required} of ${questions.length}. Breathe, and trust what you know.`);
  } else if (practice) {
    say('Practice run. Hearts are safe here, so explore freely and enjoy it.');
  } else if (questionType(currentQuestion()) !== 'slide') {
    say('Take your time and read carefully. Mistakes are how we learn.');
  }
  focusFirst();
}

// report: { outcome: 'completed' | 'ended', unlocked: [titles] } shows the Performance Analysis; leave it out to close silently
function closeArena(report) {
  stopSpeaking();
  const a = arena;
  if (a && a.boss) {
    clearInterval(a.boss.timerId);
    clearTimeout(a.boss.nextTimer);
  }
  if (a && a.rapid) { clearInterval(a.rapid.timerId); clearTimeout(a.rapid.nextTimer); }
  stopSurprise();
  if (a && a.run) { pauseRun(a.run); commitRun(a); saveProgress(); }
  renderMedia([]);
  arenaTimer.hidden = true;
  arenaEl.hidden = true;
  document.body.classList.remove('arena-open');
  arena = null;
  if (a && report) showAnalysis(a, report);
  else if (a && a.opener && document.contains(a.opener)) a.opener.focus();
}

function unlockChildren() {
  SKILL_TREE_DATA.forEach(n => {
    if (n.state === 'locked' && n.parents.every(id => NODE_BY_ID.get(id).state === 'completed')) {
      n.state = 'unlocked';
    }
  });
}

function unlockSubject(id) {
  if (id && !unlockedSubjects.includes(id)) unlockedSubjects.push(id);
}

function completeNode(node, line) {
  const before = new Map(SKILL_TREE_DATA.map(n => [n.id, n.state]));
  node.state = maxState(node.state, 'completed'); // replays keep a finished module finished
  unlockChildren();
  const unlocked = SKILL_TREE_DATA.filter(n => before.get(n.id) === 'locked' && n.state === 'unlocked').map(n => n.title);
  if (arena) statsFor(node.id).completions += 1;
  if (arena && !arena.practice && before.get(node.id) !== 'completed') missionProgress(); // replays never count
  closeArena({ outcome: 'completed', unlocked });
  renderTree();
  lineIndex = 0;
  say(line || mentorLines()[0]);
}

/* ---- results of an answer ---- */
function revealExplain(ok, verdict, text, items) {
  arena.awaitingContinue = true;
  explainEl.classList.toggle('explain--ok', ok);
  explainEl.classList.toggle('explain--bad', !ok);
  explainVerdict.textContent = verdict;
  explainText.textContent = text;
  fillList(items);
  explainEl.hidden = false;
  continueBtn.focus({ preventScroll: true });
  explainEl.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
}

function showExplanation(q, result, opts) {
  arena.result = result;
  const ok = result === 'correct';
  const verdict = ok
    ? (arena.xpPer > 0 ? `Well done. +${arena.xpPer} XP` : 'Well done.')
    : (result === 'gameover' ? 'Not quite. That was your last heart for now.' : (arena.practice ? 'Not quite. Hearts are safe in practice runs.' : 'Not quite. You used one heart.'));
  const text = (opts.answerText ? `The answer is ${opts.answerText}. ` : '') + q.explanation;
  revealExplain(ok, verdict, text, (opts.list || []).map(t => ({ text: t })));
}

function loseHeart() {
  hearts = Math.max(0, hearts - 1);
  streak = 0;
  if (hearts === 0) heartsEmptyAt = Date.now();
  saveProgress(); // a penalty is saved at once, so closing the tab cannot dodge it
  renderHUD();
  shakeArena();
  return hearts === 0;
}

function finishCorrect(q) {
  arena.busy = true;
  lockInputs();
  arena.run.correct += 1;
  if (arena.rapid) { rapidAnswer(q, true); return; }
  if (arena.boss) { bossAnswer(q, true, {}, false); return; }

  stopSpeaking();
  const leveled = gainXp(arena.xpPer);
  streak += 1;
  renderHUD(); // HUD reacts instantly; the reward is saved when the player presses Continue
  const line = leveled
    ? `Level ${leveled}! I am so proud of you. Keep going at your own pace.`
    : (arena.xpPer > 0 ? `Lovely. +${arena.xpPer} XP. Streak: ${streak}. Well done.` : `Lovely. Streak: ${streak}. Practice makes it stay with you.`);
  say(line);
  if (leveled) speak(line);
  showExplanation(q, 'correct', {});
}

function finishWrong(q, opts) {
  arena.busy = true;
  lockInputs();
  arena.run.mistakes += 1; // counted in every mode, practice included
  commitRun(arena);
  if (arena.rapid) { say('Not this one, and that is okay. On to the next.'); rapidAnswer(q, false); return; }
  let out = false;
  if (arena.practice) { shakeArena(); saveProgress(); } // practice never costs a heart or a streak
  else out = loseHeart();
  const text = out ? q.mentorScolding + ' That was your last heart for now. Rest, review, and come back whenever you feel ready.' : q.mentorScolding;
  alertMentor(text);
  speak(text);
  if (arena.boss) { bossAnswer(q, false, opts, out); return; }
  showExplanation(q, out ? 'gameover' : 'wrong', opts);
}

/* ---- per-format answer handlers ---- */
function onOptionClick(btn) {
  const q = currentQuestion();
  if (btn.dataset.value === q.correctAnswer) {
    btn.classList.add('is-correct');
    finishCorrect(q);
  } else {
    btn.classList.add('is-wrong');
    arenaOptions.querySelectorAll('.option').forEach(b => {
      if (b.dataset.value === q.correctAnswer) b.classList.add('is-answer');
    });
    finishWrong(q, {});
  }
}

function clearSelection() {
  arenaOptions.querySelectorAll('.tile.is-selected').forEach(t => t.classList.remove('is-selected'));
  arena.match.sel = null;
}

function onTileClick(tile) {
  const m = arena.match;
  if (!m || tile.classList.contains('is-matched')) return;
  const side = tile.dataset.side;
  const idx = Number(tile.dataset.idx);

  if (!m.sel) { tile.classList.add('is-selected'); m.sel = { side, idx, el: tile }; return; }

  if (m.sel.side === side) { // same column: move the selection, or drop it when tapped twice
    const same = m.sel.el === tile;
    clearSelection();
    if (!same) { tile.classList.add('is-selected'); m.sel = { side, idx, el: tile }; }
    return;
  }

  const first = m.sel;
  clearSelection();
  const q = currentQuestion();
  if (first.idx === idx) {
    const color = PAIR_COLORS[m.solved % PAIR_COLORS.length];
    [first.el, tile].forEach(t => {
      t.classList.add('is-matched');
      t.style.setProperty('--pc', color);
      t.disabled = true;
    });
    m.solved += 1;
    if (m.solved === m.total) finishCorrect(q);
  } else { // one attempt, like every other format: a wrong pair costs the heart
    first.el.classList.add('is-wrong');
    tile.classList.add('is-wrong');
    finishWrong(q, { list: q.pairs.map(p => `${p.left} = ${p.right}`) });
  }
}

function submitFill() {
  if (!arena || arena.busy) return;
  const input = arenaOptions.querySelector('.fill__input');
  if (!input) return;
  if (!normalizeAnswer(input.value)) { // empty is not an attempt
    input.classList.remove('is-empty');
    void input.offsetWidth;
    input.classList.add('is-empty');
    input.focus();
    return;
  }
  const q = currentQuestion();
  const accepted = [q.answer].concat(q.acceptedAnswers || []).map(normalizeAnswer);
  if (accepted.includes(normalizeAnswer(input.value))) {
    input.classList.add('is-correct');
    finishCorrect(q);
  } else {
    input.classList.add('is-wrong');
    finishWrong(q, { answerText: String(q.answer) });
  }
}

/* ---- boss fight: one timer, a run of questions, explanations only at the end ---- */
function bossTick() {
  if (!arena || !arena.boss || arena.boss.over) return;
  const b = arena.boss;
  const left = Math.max(0, b.endsAt - Date.now());
  timerFill.style.width = ((left / (b.limit * 1000)) * 100) + '%';
  timerText.textContent = Math.ceil(left / 1000) + 's';
  arenaTimer.classList.toggle('is-low', left <= 10000);
  if (left <= 0) endBoss('timeout');
}

function bossAnswer(q, ok, opts, out) {
  const b = arena.boss;
  if (b.over) return;
  b.results.push({ q, ok });

  if (ok) {
    b.correct += 1;
    streak += 1;
    const leveled = gainXp(arena.xpPer);
    renderHUD();
    say(leveled ? `Level ${leveled}! Wonderful. Keep going.` : `Nice. ${b.correct} of ${b.required} so far. You are doing well.`);
    if (leveled) speak(`Level ${leveled}. Wonderful.`);
  } else if (out) {
    endBoss('gameover');
    return;
  }

  const left = arena.questions.length - b.results.length;
  if (b.correct >= b.required) { endBoss('cleared'); return; }
  if (b.correct + left < b.required) { endBoss('failed'); return; }

  b.nextTimer = setTimeout(() => {
    if (!arena || b.over) return;
    arena.index += 1;
    arena.busy = false;
    renderQuestion();
    focusFirst();
  }, 700);
}

function endBoss(reason) {
  const b = arena.boss;
  if (b.over) return;
  b.over = true;
  clearInterval(b.timerId);
  clearTimeout(b.nextTimer);
  arena.busy = true;
  lockInputs();
  arenaTimer.hidden = true;

  const cleared = reason === 'cleared';
  if (cleared) {
    const leveled = gainXp(b.bonus);
    renderHUD();
    say(leveled ? `Boss cleared, and Level ${leveled} reached. How wonderful.` : (b.bonus > 0 ? `Boss cleared. +${b.bonus} XP. I knew you could do it.` : 'Boss cleared. I knew you could do it.'));
    speak('Boss cleared. I am so proud of you.');
  } else {
    const line = {
      timeout: 'Time is up, and that is alright. Look over the review, then try again when you are ready.',
      gameover: 'You are out of hearts for now. Rest, and the boss will be here when you return.',
      failed: 'Not this time, and that is okay. The review will help you in the next round.',
      retreat: 'Stepping back is perfectly fine. Come back whenever you are ready.'
    }[reason];
    say(line);
    if (reason !== 'gameover') speak(line);
  }

  const subject = SUBJECTS.find(s => s.id === arena.mod.unlocksSubject);
  const verdict = {
    cleared: b.bonus > 0 ? `Boss cleared. +${b.bonus} XP bonus` : 'Boss cleared.',
    timeout: 'Time is up. Let us review together.',
    gameover: 'Out of hearts for now. Let us review together.',
    failed: 'Not this time. Let us review together.',
    retreat: 'You stepped back. Let us review together.'
  }[reason];
  const text = cleared
    ? (subject ? `${subject.title} is now unlocked on your dashboard. Well done.` : 'Beautifully done.')
    : `You got ${b.correct} of ${b.required} needed. Have a gentle look at the review, then try again when you feel ready.`;
  const items = b.results.map(r => ({
    cls: r.ok ? 'is-ok' : 'is-bad',
    head: r.ok ? '\u2713' : '\u2717',
    text: r.ok ? r.q.question : `${r.q.question} Answer: ${answerOf(r.q)}. ${r.q.explanation}`
  }));

  arena.result = cleared ? 'bosscleared' : 'bossfailed';
  revealExplain(cleared, verdict, text, items);
}

// Continue: commit the result, then move on or return to the Skill Tree
function onContinue() {
  if (!arena || !arena.awaitingContinue) return;
  const a = arena;
  a.awaitingContinue = false;

  if (a.result === 'bosscleared') {
    unlockSubject(a.mod.unlocksSubject);
    const subject = SUBJECTS.find(s => s.id === a.mod.unlocksSubject);
    completeNode(a.node, subject ? `Boss defeated. ${subject.title} is unlocked. Wonderful work.` : 'Boss defeated. Wonderful work.');
    return;
  }
  if (a.result === 'wager') {
    saveProgress();
    advanceFromSlide();
    return;
  }
  if (a.result === 'bossfailed') {
    saveProgress(); // XP and streak earned during the fight
    closeArena({ outcome: 'ended' });
    return;
  }
  if (a.result === 'correct') {
    saveProgress();
    a.index += 1;
    if (a.index < a.questions.length) {
      a.busy = false;
      renderQuestion();
      focusFirst();
      return;
    }
    completeNode(a.node); // marks the node completed, unlocks children, saves, returns to the tree
    return;
  }
  closeArena({ outcome: 'ended' }); // wrong answers end the run; the node stays open for another attempt
}

// Close / Esc must not skip the commit step once an answer has been given
function leaveArena() {
  if (!arena) return;
  if (arena.boss && !arena.boss.over) { endBoss('retreat'); return; }
  if (arena.awaitingContinue) onContinue();
  else closeArena({ outcome: 'ended' });
}

arenaOptions.addEventListener('click', e => {
  if (!arena || arena.busy) return;
  const opt = e.target.closest('.option');
  if (opt && !opt.disabled) { onOptionClick(opt); return; }
  const tf = e.target.closest('.tf');
  if (tf && !tf.disabled) { onTrueFalseClick(tf); return; }
  const tile = e.target.closest('.tile');
  if (tile && !tile.disabled) onTileClick(tile);
});

document.getElementById('arena-close').addEventListener('click', leaveArena);
continueBtn.addEventListener('click', onContinue);

const SETTINGS_KEY = 'kanthasth.settings';
let theme = 'dark';   // 'dark' or 'light', saved with the other settings
let sheetUrls = {};   // subject id -> published Google Sheet link, saved on this device

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: voiceOn, theme, sheetUrls })); } catch (_) { /* storage unavailable */ }
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (!s) return;
    if (typeof s.voice === 'boolean') setVoice(s.voice, false);
    if (s.theme === 'light' || s.theme === 'dark') applyTheme(s.theme, false);
    if (s.sheetUrls && typeof s.sheetUrls === 'object') {
      Object.keys(s.sheetUrls).forEach(id => { if (typeof s.sheetUrls[id] === 'string') sheetUrls[id] = s.sheetUrls[id]; });
    } else if (typeof s.sheetUrl === 'string' && s.sheetUrl) {
      sheetUrls = { polity: s.sheetUrl }; // settings saved before there was more than one subject
    }
  } catch (_) { /* no settings yet, or storage unavailable */ }
}

// Light theme = the .light-theme class on the body (and on <html>, so overscroll areas match too)
function applyTheme(next, persist = true) {
  theme = next === 'light' ? 'light' : 'dark';
  const light = theme === 'light';
  document.documentElement.classList.toggle('light-theme', light);
  document.body.classList.toggle('light-theme', light);
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.setAttribute('aria-pressed', String(light));
    btn.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', light ? '#FAF5EA' : '#0E1220');
  if (persist) saveSettings();
}

// One switch for the mentor voice, shared by the arena button and the Settings tab
function setVoice(on, persist = true) {
  voiceOn = on;
  voiceBtn.setAttribute('aria-pressed', String(on));
  voiceBtn.textContent = on ? '\uD83D\uDD0A Voice on' : '\uD83D\uDD07 Voice off';
  const sw = document.getElementById('set-voice');
  if (sw) sw.setAttribute('aria-checked', String(on));
  if (!on) stopSpeaking();
  if (persist) saveSettings();
}

voiceBtn.addEventListener('click', () => setVoice(!voiceOn));
document.getElementById('theme-toggle').addEventListener('click', () => applyTheme(theme === 'light' ? 'dark' : 'light'));

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && arena) leaveArena();
});

/* ------------------------------------------------------------------
   SAVE GAME (localStorage)
------------------------------------------------------------------- */
const SAVE_KEY = 'kanthasth.save';                 // one save for the whole app, every subject inside it
const LEGACY_SAVE_KEY = 'kanthasth.save.polity';   // saves from the time there was only one subject
const SAVE_VERSION = 2;
const HEART_REFILL_MS = 30 * 60 * 1000; // hearts come back this long after the last one is lost
const STATE_RANK = { locked: 0, unlocked: 1, completed: 2 };
let heartsEmptyAt = null;
let warnedStorage = false;
let currentSubject = 'polity'; // the subject whose skill tree is loaded (or loading)
let nodeStats = {};            // module analytics of currentSubject: { [nodeId]: { attempts, mistakes, correct, totalTime (seconds), completions, lastPlayed } }

function intIn(v, min, max, fallback) {
  return Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}

// A module that was ever unlocked or completed never goes back to locked: the higher state always wins
function maxState(a, b) {
  return (STATE_RANK[a] === undefined ? -1 : STATE_RANK[a]) >= (STATE_RANK[b] === undefined ? -1 : STATE_RANK[b]) ? a : b;
}

function cleanStats(raw) {
  const num = v => (Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
  const out = {};
  Object.keys(raw).forEach(id => {
    const r = raw[id] && typeof raw[id] === 'object' ? raw[id] : {};
    // totalTime is in seconds; an older save kept milliseconds in totalMs, which is converted here
    const secs = Number.isFinite(r.totalTime) && r.totalTime >= 0 ? r.totalTime : (Number.isFinite(r.totalMs) && r.totalMs >= 0 ? r.totalMs / 1000 : 0);
    out[id] = { attempts: num(r.attempts), mistakes: num(r.mistakes), correct: num(r.correct), totalTime: Math.round(secs * 1000) / 1000, completions: num(r.completions), lastPlayed: num(r.lastPlayed) };
  });
  return out;
}

function statsFor(id) {
  if (!nodeStats[id]) nodeStats[id] = { attempts: 0, mistakes: 0, correct: 0, totalTime: 0, completions: 0, lastPlayed: 0 };
  return nodeStats[id];
}

// Version 1 saves only knew about Polity
function migrateLegacySave(v1) {
  return {
    v: SAVE_VERSION, hearts: v1.hearts, streak: v1.streak, xp: v1.xp, heartsEmptyAt: v1.heartsEmptyAt,
    unlockedSubjects: v1.unlockedSubjects, lastSubject: 'polity',
    subjects: { polity: { nodes: v1.nodes || {}, target: v1.target || null, nodeStats: {} } },
    savedAt: v1.savedAt
  };
}

// Returns the parsed save, or null for first-time users, unknown versions, or unreadable data
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return s && typeof s === 'object' && s.v === SAVE_VERSION ? s : null;
    }
    const old = localStorage.getItem(LEGACY_SAVE_KEY);
    if (old) {
      const v1 = JSON.parse(old);
      return v1 && typeof v1 === 'object' && v1.v === 1 ? migrateLegacySave(v1) : null;
    }
    return null;
  } catch (err) {
    console.warn('[Kanthasth] Save unreadable, starting fresh:', err);
    try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(LEGACY_SAVE_KEY); } catch (_) { /* storage unavailable */ }
    return null;
  }
}

function saveProgress() {
  if (SKILL_TREE_DATA.length === 0) return; // never overwrite a save before the tree has loaded
  const prev = readSave() || {};
  const before = (prev.subjects && prev.subjects[currentSubject] && prev.subjects[currentSubject].nodes) || {};
  const nodes = {};
  SKILL_TREE_DATA.forEach(n => { nodes[n.id] = maxState(n.state, before[n.id] || 'locked'); });
  const next = SKILL_TREE_DATA.find(n => nodes[n.id] === 'unlocked');
  const subjects = Object.assign({}, prev.subjects);
  subjects[currentSubject] = { nodes, target: next ? next.title : null, nodeStats };
  const payload = { v: SAVE_VERSION, hearts, streak, xp, heartsEmptyAt, unlockedSubjects, lastSubject: currentSubject, subjects, savedAt: Date.now() };
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
  unlockedSubjects = Array.isArray(s.unlockedSubjects) ? s.unlockedSubjects.filter(v => typeof v === 'string') : [];
}

// Call after the lessons are applied: overlays the saved stats, node states and analytics of currentSubject
function loadProgress() {
  nodeStats = {};
  const s = readSave();
  if (!s) return false; // first-time user: the sheet's defaults stay as they are
  applySavedStats(s);
  const slice = s.subjects && s.subjects[currentSubject];
  if (slice) {
    if (slice.nodes && typeof slice.nodes === 'object') {
      SKILL_TREE_DATA.forEach(n => {
        const saved = slice.nodes[n.id];
        if (STATES.includes(saved)) n.state = maxState(n.state, saved); // never lower than what the player reached
      });
    }
    if (slice.nodeStats && typeof slice.nodeStats === 'object') nodeStats = cleanStats(slice.nodeStats);
  }
  unlockChildren(); // picks up nodes added to the sheet since the save was written
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
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(LEGACY_SAVE_KEY); } catch (_) { /* storage unavailable */ }
  location.reload();
}


/* ------------------------------------------------------------------
   DATA LOADING (Google Sheets CSV)
------------------------------------------------------------------- */
const STATES = ['locked', 'unlocked', 'completed'];

const statusEl = document.createElement('div');
statusEl.className = 'tree__status';
statusEl.setAttribute('role', 'status');

function showStatus(message, withRetry, action) {
  treeEl.style.height = '';
  treeEl.querySelectorAll('.node').forEach(el => el.remove());
  linksEl.replaceChildren();

  statusEl.replaceChildren();
  statusEl.classList.toggle('is-error', Boolean(withRetry || action));
  const p = document.createElement('p');
  p.textContent = message;
  statusEl.appendChild(p);

  if (withRetry) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry';
    retry.addEventListener('click', loadSubject);
    statusEl.appendChild(retry);
  }
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tree__action';
    b.textContent = action.label;
    b.addEventListener('click', action.onClick);
    statusEl.appendChild(b);
  }
  if (!statusEl.isConnected) treeEl.appendChild(statusEl);
}

// Fail loudly on malformed JSON instead of breaking the game halfway through
const nonBlank = v => (typeof v === 'string' || typeof v === 'number') && String(v).trim() !== '';

function validateQuestion(q, where, allowedTypes) {
  if (!q || typeof q !== 'object') throw new Error(`${where} must be an object`);
  const type = questionType(q);
  if (!allowedTypes.includes(type)) throw new Error(`${where} has questionType "${type}", which is not allowed here`);
  if (!nonBlank(q.question) || !nonBlank(q.explanation)) throw new Error(`${where} needs question and explanation`);
  if (q.imageUrl !== undefined && !nonBlank(q.imageUrl)) throw new Error(`${where} imageUrl must be a non-empty string`);
  if (q.imageAlt !== undefined && typeof q.imageAlt !== 'string') throw new Error(`${where} imageAlt must be a string`);
  ['simulationUrl', 'videoUrl'].forEach(k => {
    if (q[k] !== undefined && !(typeof q[k] === 'string' && mediaEmbed(q[k]))) throw new Error(`${where} ${k} must be a link that starts with https://`);
  });
  if (q.targetExam !== undefined && typeof q.targetExam !== 'string') throw new Error(`${where} targetExam must be text`);
  if (q.pyqYear !== undefined && !Number.isInteger(q.pyqYear)) throw new Error(`${where} pyqYear must be a whole year`);
  if (q.keywords !== undefined && !(Array.isArray(q.keywords) && q.keywords.every(k => typeof k === 'string'))) throw new Error(`${where} keywords must be a list of words`);
  if (type === 'slide') return; // lessons need no answer and no wrong-answer message
  if (!nonBlank(q.mentorScolding)) throw new Error(`${where} needs a mentorScolding (the gentle message shown after a wrong answer)`);

  if (type === 'mcq') {
    if (!Array.isArray(q.options) || q.options.length !== 4 || !q.options.includes(q.correctAnswer)) {
      throw new Error(`${where} (mcq) needs 4 options and a correctAnswer taken from them`);
    }
  } else if (type === 'trueFalse') {
    if (typeof q.correctAnswer !== 'boolean') throw new Error(`${where} (trueFalse) needs correctAnswer to be true or false`);
  } else if (type === 'match') {
    const ok = Array.isArray(q.pairs) && q.pairs.length >= 3 && q.pairs.length <= 5 &&
               q.pairs.every(p => p && nonBlank(p.left) && nonBlank(p.right)) &&
               new Set(q.pairs.map(p => p.left)).size === q.pairs.length &&
               new Set(q.pairs.map(p => p.right)).size === q.pairs.length;
    if (!ok) throw new Error(`${where} (match) needs 3 to 5 pairs of unique { left, right } strings`);
  } else if (type === 'fillBlank') {
    if (!nonBlank(q.answer)) throw new Error(`${where} (fillBlank) needs an answer`);
    if (q.acceptedAnswers !== undefined && !(Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.every(nonBlank))) {
      throw new Error(`${where} (fillBlank) acceptedAnswers must be an array of strings`);
    }
  }
}

function validatePolityData(d) {
  if (!d || !Array.isArray(d.nodes) || d.nodes.length === 0) throw new Error('the lessons need a non-empty "nodes" list');
  if (!d.modules || typeof d.modules !== 'object') throw new Error('the lessons need a "modules" object');

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

    const boss = mod.questionType === 'bossFight';
    const allowed = boss ? ['mcq', 'trueFalse', 'fillBlank'] : ['mcq', 'trueFalse', 'match', 'fillBlank', 'slide'];
    mod.questions.forEach((q, i) => validateQuestion(q, `modules."${nodeId}".questions[${i}]`, allowed));
    ['simulationUrl', 'videoUrl'].forEach(k => {
      if (mod[k] !== undefined && !(typeof mod[k] === 'string' && mediaEmbed(mod[k]))) throw new Error(`modules."${nodeId}".${k} must be a link that starts with https://`);
    });

    if (boss) {
      if (mod.timeLimit !== undefined && !(Number.isFinite(mod.timeLimit) && mod.timeLimit >= 10 && mod.timeLimit <= 600)) {
        throw new Error(`modules."${nodeId}".timeLimit must be 10 to 600 seconds`);
      }
      if (mod.requiredCorrect !== undefined && !(Number.isInteger(mod.requiredCorrect) && mod.requiredCorrect >= 1 && mod.requiredCorrect <= mod.questions.length)) {
        throw new Error(`modules."${nodeId}".requiredCorrect must be between 1 and the number of questions`);
      }
      if (mod.bonusXp !== undefined && !(Number.isFinite(mod.bonusXp) && mod.bonusXp >= 0)) {
        throw new Error(`modules."${nodeId}".bonusXp must be 0 or more`);
      }
    }
  });
}

function applyPolityData(d) {
  const s = d.settings || {};
  MAX_HEARTS = Number.isInteger(s.maxHearts) ? s.maxHearts : 5;
  XP_PER_CORRECT = Number.isFinite(s.xpPerCorrect) ? s.xpPerCorrect : 50;
  QUESTIONS_PER_RUN = Number.isInteger(s.questionsPerRun) ? s.questionsPerRun : 1;
  XP_PER_LEVEL = Number.isFinite(s.xpPerLevel) && s.xpPerLevel > 0 ? s.xpPerLevel : 500;
  REPLAY_XP = Number.isFinite(s.replayXp) && s.replayXp >= 0 ? s.replayXp : 0;
  hearts = MAX_HEARTS;
  streak = 0;
  xp = 0;
  heartsEmptyAt = null;
  unlockedSubjects = [];

  SKILL_TREE_DATA = d.nodes.map(n => Object.assign({}, n, { parents: n.parents || [] }));
  NODE_BY_ID = new Map(SKILL_TREE_DATA.map(n => [n.id, n]));
  MODULE_DATA = d.modules;

  if (d.title) document.querySelector('.top__title').textContent = d.title;
}

/* ------------------------------------------------------------------
   GOOGLE SHEETS PIPELINE: published CSV in, game JSON out
------------------------------------------------------------------- */
// Optional built-in link for this app. Leave it empty to use the link pasted into Settings.
const SHEET_URLS = { polity: '', science: '', quotes: '' };
const cacheKey = subject => 'kanthasth.data.' + subject;
const FETCH_TIMEOUT_MS = 12000;

class SheetError extends Error {} // a problem that the person editing the sheet can fix

const getSheetUrl = subject => sheetUrls[subject] || SHEET_URLS[subject] || '';

// Accepts a published link, an export link, or a plain browser link to the sheet, and returns a CSV link
function normalizeSheetUrl(raw) {
  let url;
  try { url = new URL(String(raw).trim()); } catch (_) { throw new SheetError('That does not look like a web link. Paste the full link from Google Sheets.'); }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new SheetError('The link must start with https://');

  if (url.hostname === 'docs.google.com') {
    if (/\/pubhtml$/.test(url.pathname)) url.pathname = url.pathname.replace(/\/pubhtml$/, '/pub');
    if (/(output|format)=csv|tqx=out:csv/.test(url.search)) return url.href;
    if (/\/pub$/.test(url.pathname)) { url.searchParams.set('output', 'csv'); return url.href; }
    const m = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (m && m[1] !== 'e') { // a normal "edit" link: use the export endpoint of that tab
      const gid = (url.hash + url.search).match(/gid=(\d+)/);
      return 'https://docs.google.com/spreadsheets/d/' + m[1] + '/export?format=csv&gid=' + (gid ? gid[1] : '0');
    }
  }
  return url.href;
}

async function fetchSheetCsv(rawUrl) {
  const url = normalizeSheetUrl(rawUrl);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctl.signal });
    if (!res.ok) throw new SheetError('The sheet answered with HTTP ' + res.status + '. Check that it is published to the web.');
    const text = await res.text();
    if (/^\s*<(!doctype|html)/i.test(text)) {
      throw new SheetError('That link returned a web page, not CSV. In Google Sheets use File > Share > Publish to web, choose your sheet and CSV.');
    }
    if (!text.trim()) throw new SheetError('The sheet is empty.');
    return text;
  } catch (err) {
    if (err instanceof SheetError) throw err;
    if (err && err.name === 'AbortError') throw new SheetError('The sheet took too long to answer. Check your connection and try again.');
    throw new SheetError('Could not reach the sheet. Check your connection and the link.');
  } finally {
    clearTimeout(timer);
  }
}

// Keep the last good copy, so lessons still open offline or when the sheet has a typo
function writeCachedData(subject, url, data) {
  try { localStorage.setItem(cacheKey(subject), JSON.stringify({ url: normalizeSheetUrl(url), savedAt: Date.now(), data })); } catch (_) { /* storage full or blocked */ }
}
function readCachedData(subject, url) {
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey(subject)));
    if (c && c.data && c.url === normalizeSheetUrl(url)) return c.data;
  } catch (_) { /* no usable cache */ }
  return null;
}

/* ---- CSV text to rows (handles quotes, commas and line breaks inside cells) ---- */
function parseCsv(input) {
  const text = input.charCodeAt(0) === 0xFEFF ? input.slice(1) : input;
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

/* ---- rows to the exact JSON schema the game already uses ---- */
const SHEET_TYPES = {
  setting: 'setting', settings: 'setting', node: 'node', boss: 'boss', bossfight: 'boss',
  slide: 'slide', lesson: 'slide', mcq: 'mcq', multiplechoice: 'mcq',
  truefalse: 'trueFalse', tf: 'trueFalse', fillblank: 'fillBlank', fillintheblank: 'fillBlank', fill: 'fillBlank',
  match: 'match', matching: 'match'
};
const HEADER_ALIASES = {
  question_text: 'question', correct_answer: 'answer', correct: 'answer', wrong_answer_message: 'wrong_message',
  mentor_message: 'wrong_message', image: 'image_url', imageurl: 'image_url', accepted: 'accepted_answers',
  sim_url: 'simulation_url', simulation: 'simulation_url', video: 'video_url', youtube_url: 'video_url',
  exam: 'target_exam', year: 'pyq_year', keyword: 'keywords',
  node: 'node_id', module: 'node_id', type_of_row: 'type', row_type: 'type'
};
const SETTING_KEYS = { max_hearts: 'maxHearts', xp_per_correct: 'xpPerCorrect', questions_per_run: 'questionsPerRun', xp_per_level: 'xpPerLevel', replay_xp: 'replayXp' };
const GENTLE = [
  'That is okay. The answer is {a}. Every mistake helps you remember it better.',
  'Not quite, and that is perfectly alright. It is {a}. You will get it next time.',
  'Gently now. The answer is {a}. Take a breath, you are doing just fine.',
  'No worries at all. {a} is the one. Learning takes patience, and you are showing it.'
];

function sheetCsvToGame(csvText) {
  const table = parseCsv(csvText);
  if (table.length < 2) throw new SheetError('The sheet needs a header row and at least one row of content.');

  const head = table[0].map(h => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')).map(h => HEADER_ALIASES[h] || h);
  const col = {};
  head.forEach((h, i) => { if (!(h in col)) col[h] = i; });
  ['type', 'node_id'].forEach(c => {
    if (!(c in col)) throw new SheetError('The first row must be a header row with a "' + c + '" column.');
  });

  const errors = [];
  const bad = (rowNo, what, msg) => errors.push('Row ' + rowNo + ' (' + what + '): ' + msg);
  const game = { schemaVersion: 1, module: 'polity', title: 'Polity', settings: {}, nodes: [], modules: {} };
  const nodeRow = {};
  const perRun = {};
  const nodeMedia = {};
  const bosses = {};
  let wrongCount = 0;

  table.slice(1).forEach((cells, i) => {
    const rowNo = i + 2;
    const g = k => (k in col && cells[col[k]] !== undefined ? cells[col[k]].trim() : '');
    const txt = k => g(k).replace(/\\n/g, '\n');
    const num = k => (g(k) === '' ? undefined : Number(g(k)));
    const rawType = g('type');
    if (rawType.startsWith('#')) return; // comment row
    if (!rawType) return bad(rowNo, 'no type', 'the type column is empty.');
    const type = SHEET_TYPES[rawType.toLowerCase().replace(/[^a-z]/g, '')];
    if (!type) return bad(rowNo, rawType, 'unknown type. Use setting, node, boss, slide, mcq, trueFalse, fillBlank or match.');

    if (type === 'setting') {
      const key = g('key').toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
      const value = g('value');
      if (key === 'title') { if (value) game.title = value; }
      else if (key === 'module') { if (value) game.module = value; }
      else if (SETTING_KEYS[key]) {
        const n = Number(value);
        if (value === '' || !Number.isFinite(n)) bad(rowNo, 'setting', '"' + g('key') + '" needs a number in the value column.');
        else game.settings[SETTING_KEYS[key]] = n;
      } else bad(rowNo, 'setting', 'unknown key "' + g('key') + '". Use title, module, max_hearts, xp_per_correct, questions_per_run, xp_per_level or replay_xp.');
      return;
    }

    const nodeId = g('node_id');
    if (!nodeId) return bad(rowNo, type, 'node_id is empty.');

    if (type === 'node') {
      const x = num('x');
      const y = num('y');
      if (!Number.isFinite(x) || !Number.isFinite(y)) return bad(rowNo, 'node', 'x and y must be numbers (x is 0 to 100 across, y is the row starting at 0).');
      if (nodeRow[nodeId]) return bad(rowNo, 'node', 'node_id "' + nodeId + '" is already used on row ' + nodeRow[nodeId] + '.');
      nodeRow[nodeId] = rowNo;
      const parents = g('parents').split(/[,;|]/).map(s => s.trim()).filter(Boolean);
      const state = g('state').toLowerCase() || (parents.length ? 'locked' : 'unlocked');
      if (!STATES.includes(state)) return bad(rowNo, 'node', 'state must be locked, unlocked or completed.');
      const node = { id: nodeId, title: g('title') || nodeId, state, x, y, parents };
      if (g('node_type').toLowerCase() === 'boss') node.type = 'boss';
      if (g('deck')) node.deck = g('deck');
      game.nodes.push(node);
      const media = {};
      [['simulation_url', 'simulationUrl'], ['video_url', 'videoUrl']].forEach(([from, to]) => {
        if (!g(from)) return;
        if (!mediaEmbed(g(from))) bad(rowNo, 'node', from + ' must be a link that starts with https://');
        else media[to] = g(from);
      });
      if (Object.keys(media).length) nodeMedia[nodeId] = Object.assign({ row: rowNo }, media);
      const per = num('questions_per_run');
      if (per !== undefined) {
        if (!Number.isInteger(per) || per < 1) bad(rowNo, 'node', 'questions_per_run must be a whole number, 1 or more.');
        else perRun[nodeId] = per;
      }
      return;
    }

    if (type === 'boss') {
      const props = { questionType: 'bossFight', row: rowNo };
      [['time_limit', 'timeLimit'], ['required_correct', 'requiredCorrect'], ['bonus_xp', 'bonusXp']].forEach(([from, to]) => {
        const n = num(from);
        if (n === undefined) return;
        if (!Number.isFinite(n)) bad(rowNo, 'boss', from + ' must be a number.');
        else props[to] = n;
      });
      if (g('unlocks_subject')) props.unlocksSubject = g('unlocks_subject');
      bosses[nodeId] = props;
      return;
    }

    // everything else is a slide or a question that belongs to a node
    const q = { questionType: type, question: txt('question') || (type === 'slide' ? txt('title') : '') };
    if (!q.question) return bad(rowNo, type, 'the question column is empty.' + (type === 'slide' ? ' For a slide it holds the title.' : ''));
    if (g('image_url')) q.imageUrl = g('image_url');
    if (g('image_alt')) q.imageAlt = g('image_alt');
    let mediaBad = false;
    [['simulation_url', 'simulationUrl'], ['video_url', 'videoUrl']].forEach(([from, to]) => {
      if (!g(from)) return;
      if (!mediaEmbed(g(from))) { bad(rowNo, type, from + ' must be a link that starts with https://'); mediaBad = true; }
      else q[to] = g(from);
    });
    if (mediaBad) return;
    if (g('target_exam')) q.targetExam = g('target_exam').slice(0, 30);
    if (g('pyq_year')) {
      const year = Number(g('pyq_year'));
      if (!Number.isInteger(year) || year < 1950 || year > 2100) return bad(rowNo, type, 'pyq_year must be a year such as 2023.');
      q.pyqYear = year;
    }
    if (type === 'slide' && g('keywords')) q.keywords = g('keywords').split('|').map(k => k.trim()).filter(Boolean);
    q.explanation = txt('explanation');
    if (!q.explanation) return bad(rowNo, type, 'the explanation column is empty. For a slide it is the body text.');

    let answerText = '';
    if (type === 'mcq') {
      const options = ['option_a', 'option_b', 'option_c', 'option_d'].map(g);
      if (options.some(o => !o)) return bad(rowNo, 'mcq', 'option_a to option_d must all be filled in.');
      if (new Set(options).size !== 4) return bad(rowNo, 'mcq', 'the four options must all be different.');
      const a = g('answer');
      const letter = /^[a-d]$/i.test(a) ? options['abcd'.indexOf(a.toLowerCase())] : options.find(o => o.toLowerCase() === a.toLowerCase());
      if (!letter) return bad(rowNo, 'mcq', 'answer must be A, B, C or D (or the exact text of one option).');
      q.options = options;
      q.correctAnswer = letter;
      answerText = letter;
    } else if (type === 'trueFalse') {
      const a = g('answer').toLowerCase();
      if (['true', 't', 'yes', 'y', '1'].includes(a)) q.correctAnswer = true;
      else if (['false', 'f', 'no', 'n', '0'].includes(a)) q.correctAnswer = false;
      else return bad(rowNo, 'trueFalse', 'answer must be TRUE or FALSE.');
      answerText = q.correctAnswer ? 'True' : 'False';
    } else if (type === 'fillBlank') {
      if (!g('answer')) return bad(rowNo, 'fillBlank', 'answer is empty.');
      q.answer = g('answer');
      const accepted = g('accepted_answers').split('|').map(s => s.trim()).filter(Boolean);
      if (accepted.length) q.acceptedAnswers = accepted;
      if (g('hint')) q.hint = g('hint');
      answerText = q.answer;
    } else if (type === 'match') {
      const pairs = g('pairs').split('|').map(s => s.trim()).filter(Boolean).map(s => {
        const parts = s.split(/\s*(?:::|=>)\s*/);
        return parts.length === 2 && parts[0] && parts[1] ? { left: parts[0], right: parts[1] } : null;
      });
      if (pairs.length < 3 || pairs.length > 5 || pairs.some(p => !p)) {
        return bad(rowNo, 'match', 'pairs needs 3 to 5 items written as  left :: right | left :: right | left :: right');
      }
      q.pairs = pairs;
    }

    if (type !== 'slide') {
      q.mentorScolding = txt('wrong_message') ||
        (type === 'match' ? 'That is alright. The correct pairs are shown below. Take your time with them.' : GENTLE[wrongCount++ % GENTLE.length].replace('{a}', answerText));
    }
    (game.modules[nodeId] = game.modules[nodeId] || { questions: [] }).questions.push(q);
  });

  Object.keys(bosses).forEach(id => {
    const { row, ...props } = bosses[id];
    if (!game.modules[id]) bad(row, 'boss', 'node_id "' + id + '" has a boss row but no question rows.');
    else Object.assign(game.modules[id], props);
  });
  Object.keys(perRun).forEach(id => { if (game.modules[id]) game.modules[id].questionsPerRun = perRun[id]; });
  Object.keys(nodeMedia).forEach(id => {
    const { row, ...media } = nodeMedia[id];
    if (!game.modules[id]) bad(row, 'node', 'simulation_url or video_url needs at least one slide or question row with the same node_id.');
    else Object.assign(game.modules[id], media);
  });
  Object.keys(game.modules).forEach(id => {
    if (!nodeRow[id]) errors.push('Questions use node_id "' + id + '", but no row of type node defines it.');
  });
  if (!game.nodes.length) errors.push('No row has type "node", so the skill tree would be empty.');

  if (errors.length) {
    const shown = errors.slice(0, 4).join(' ');
    throw new SheetError('Your sheet has ' + errors.length + ' problem' + (errors.length > 1 ? 's' : '') + '. ' + shown + (errors.length > 4 ? ' (and ' + (errors.length - 4) + ' more)' : ''));
  }
  return game;
}

function describeGame(game) {
  const all = Object.values(game.modules).flatMap(m => m.questions);
  const slides = all.filter(q => questionType(q) === 'slide').length;
  return game.nodes.length + ' nodes, ' + slides + ' slides and ' + (all.length - slides) + ' questions';
}

// Tries the sheet first; falls back to the last good copy. Returns { data, source }
async function loadGameData(subject) {
  const url = getSheetUrl(subject);
  if (!url) {
    const e = new SheetError('No lesson sheet is connected for this subject yet. Open Settings, pick the subject, paste its published Google Sheet link, and come back.');
    e.code = 'NO_SHEET';
    throw e;
  }
  try {
    const game = sheetCsvToGame(await fetchSheetCsv(url));
    validatePolityData(game);
    writeCachedData(subject, url, game);
    return { data: game, source: 'live' };
  } catch (err) {
    const cached = readCachedData(subject, url);
    if (!cached) throw err;
    console.warn('[Kanthasth] Using the saved copy of the lessons:', err.message);
    return { data: cached, source: 'saved', reason: err.message };
  }
}

async function loadSubject() {
  const subject = currentSubject;
  const meta = SUBJECTS.find(s => s.id === subject) || { title: subject };
  console.log('[Kanthasth] Loading ' + meta.title + ' from its Google Sheet...');
  document.querySelector('.top__title').textContent = meta.title;
  showStatus('Loading ' + meta.title + '\u2026', false);
  say('Getting your lessons ready. One moment.');

  try {
    const { data, source } = await loadGameData(subject);
    if (subject !== currentSubject) return; // the player switched subject while this one was loading
    validatePolityData(data);
    applyPolityData(data);
    const restored = loadProgress();
    unlockChildren(); // the sheet may mark a parent completed and leave its child blank
    console.log('[Kanthasth] ' + (restored ? 'Save game restored.' : 'No save found, starting fresh.'));

    statusEl.remove();
    renderHUD();
    renderTree();
    lineIndex = 0;
    say(mentorLines()[0]);
    if (source === 'saved') showToast('Using saved lessons', 'The sheet could not be read just now.');
    console.log('[Kanthasth] Loaded ' + describeGame(data) + ' (' + source + ').');
  } catch (err) {
    if (subject !== currentSubject) return;
    console.error('[Kanthasth] Data load failed:', err);
    if (err.code === 'NO_SHEET') {
      showStatus(err.message, false, { label: 'Open Settings', onClick: () => { showView('settings'); showDashboard(); } });
      say('Let us connect your lesson sheet first. It only takes a minute.');
    } else {
      showStatus('Could not load the lessons. ' + err.message, true);
      say('Something did not load. No worries, tap Retry and we will try again.');
    }
  }
}

/* ------------------------------------------------------------------
   INIT
------------------------------------------------------------------- */
function startGameplay() {
  const saved = readSave();
  if (saved) applySavedStats(saved);
  renderHUD();
  syncBottomPadding();
  loadSubject();
}

/* ------------------------------------------------------------------
   DASHBOARD (home screen) + SCREEN TRANSITIONS
------------------------------------------------------------------- */
const PLAYER_NAME = 'Gaurav';
const FADE_MS = 450;

const SUBJECTS = [
  { id: 'polity',    title: 'Indian Polity',   blurb: 'Constitution, rights, Parliament', unlocked: true,  ready: true },
  { id: 'science',   title: 'General Science', blurb: 'Physics, chemistry, biology',      unlocked: true,  ready: true },
  { id: 'history',   title: 'History',         blurb: 'Ancient to modern India',          unlocked: false, ready: false },
  { id: 'geography', title: 'Geography',       blurb: 'India and the world',              unlocked: false, ready: false },
  { id: 'economy',   title: 'Economy',         blurb: 'Growth, banking, budgets',         unlocked: false, ready: false },
  { id: 'maths',     title: 'Mathematics',     blurb: 'Arithmetic and algebra',           unlocked: false, ready: false }
];
const SCIENCE_ICON = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M9 3h6M10 3v6.200L4.600 18.400A2 2 0 0 0 6.300 21.500h11.400a2 2 0 0 0 1.700-3.100L14 9.200V3M7.500 15h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const BOOK_ICON = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M4 5.500A2.500 2.500 0 0 1 6.500 3H20v15H6.500A2.500 2.500 0 0 0 4 20.500zM4 20.500A2.500 2.500 0 0 0 6.500 23H20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const POLITY_ICON = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M12 3L3 8v2h18V8zM5 11h2v7H5zM9 11h2v7H9zM13 11h2v7h-2zM17 11h2v7h-2zM3 19h18v2H3z" fill="currentColor"/></svg>';

const dashboardScreen = document.getElementById('dashboard-screen');
const gameScreen = document.getElementById('gameplay-screen');
const confirmEl = document.getElementById('confirm');
const confirmText = document.getElementById('confirm-text');
const confirmOk = document.getElementById('confirm-ok');
const confirmCancel = document.getElementById('confirm-cancel');
const eraseBtn = document.getElementById('btn-erase');
const voiceSwitch = document.getElementById('set-voice');
const SUBJECT_ICONS = { polity: POLITY_ICON, science: SCIENCE_ICON };

let loadedSubject = null;  // the subject whose tree is on screen (null = nothing loaded yet)
let heroSubjectId = 'polity';
let transitioning = false;

function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// Fade `from` out, swap display, fade `to` in
function swapScreens(from, to, onShown) {
  const wait = prefersReducedMotion() ? 0 : FADE_MS;
  from.classList.add('is-fading');
  setTimeout(() => {
    from.classList.add('hidden');
    from.classList.remove('is-fading');
    to.classList.add('is-fading');   // start transparent, so the fade-in has something to animate from
    to.classList.remove('hidden');
    window.scrollTo(0, 0);
    if (onShown) onShown();          // the screen has layout now, so it is safe to measure and draw
    requestAnimationFrame(() => requestAnimationFrame(() => to.classList.remove('is-fading')));
  }, wait);
}

function resetState() {
  stopSpeaking();
  hearts = MAX_HEARTS;
  streak = 0;
  xp = 0;
  heartsEmptyAt = null;
  unlockedSubjects = [];
  nodeStats = {};
  lineIndex = 0;
}

function saveSummary(s) {
  let h = intIn(s.hearts, 0, 99, 0);
  // hearts that have already refilled while the player was away
  if (h === 0 && Number.isFinite(s.heartsEmptyAt) && Date.now() - s.heartsEmptyAt >= HEART_REFILL_MS) h = MAX_HEARTS;
  const progress = {};
  Object.keys(s.subjects || {}).forEach(id => {
    const slice = s.subjects[id] || {};
    const states = slice.nodes && typeof slice.nodes === 'object' ? Object.values(slice.nodes) : [];
    progress[id] = { done: states.filter(v => v === 'completed').length, total: states.length, target: typeof slice.target === 'string' ? slice.target : null };
  });
  return {
    hearts: h,
    streak: intIn(s.streak, 0, 1000000, 0),
    xp: intIn(s.xp, 0, 1000000000, 0),
    unlockedSubjects: Array.isArray(s.unlockedSubjects) ? s.unlockedSubjects.filter(v => typeof v === 'string') : [],
    lastSubject: typeof s.lastSubject === 'string' ? s.lastSubject : 'polity',
    progress,
    hasSave: true
  };
}

// The dashboard reads the save game; if storage is blocked it falls back to the live game state
function currentSummary() {
  const s = readSave();
  if (s) return saveSummary(s);
  if (loadedSubject && SKILL_TREE_DATA.length) {
    const next = SKILL_TREE_DATA.find(n => n.state === 'unlocked');
    return {
      hearts, streak, xp, unlockedSubjects: unlockedSubjects.slice(), lastSubject: loadedSubject, hasSave: true,
      progress: { [loadedSubject]: { done: SKILL_TREE_DATA.filter(n => n.state === 'completed').length, total: SKILL_TREE_DATA.length, target: next ? next.title : null } }
    };
  }
  return { hearts: MAX_HEARTS, streak: 0, xp: 0, unlockedSubjects: [], lastSubject: 'polity', progress: {}, hasSave: false };
}

function renderHero(t) {
  const subject = SUBJECTS.find(s => s.id === t.lastSubject && s.ready) || SUBJECTS[0];
  const p = t.progress[subject.id] || { done: 0, total: 0, target: null };
  const total = p.total || 0;
  const pct = total ? Math.min(100, Math.round((p.done / total) * 100)) : 0;
  const cleared = total > 0 && p.done >= total;
  let title, line, cta;

  if (!total) {
    title = 'Clear your first module';
    line = 'A gentle start is all it takes. Begin whenever you feel ready.';
    cta = 'Start Journey';
  } else if (cleared) {
    title = 'All modules cleared';
    line = 'A little gentle revision will keep everything fresh.';
    cta = 'Revise ' + subject.title;
  } else {
    title = p.target ? `Continue with \u2018${p.target}\u2019` : 'Continue your journey';
    line = t.streak > 0 ? `Streak: ${t.streak}. Keep that lovely rhythm going.` : 'Start a new streak today, one answer at a time.';
    cta = 'Resume Journey';
  }

  heroSubjectId = subject.id;
  document.querySelector('.hero__subject').textContent = subject.title;
  document.getElementById('hero-title').textContent = title;
  document.getElementById('hero-line').textContent = line;
  document.getElementById('hero-count').textContent = total ? `${p.done} of ${total} modules cleared` : 'Your journey starts here';
  document.getElementById('hero-fill').style.width = pct + '%';
  document.getElementById('hero-bar').setAttribute('aria-valuenow', String(pct));
  document.getElementById('hero-cta').textContent = cta;
}

function renderSubjects(t) {
  const wrap = document.getElementById('subjects');
  wrap.replaceChildren();

  SUBJECTS.forEach(sub => {
    const open = sub.unlocked || t.unlockedSubjects.includes(sub.id);
    const p = t.progress[sub.id];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'subject ' + (open ? 'subject--open' : 'subject--locked');
    card.dataset.id = sub.id;
    card.dataset.ready = String(Boolean(sub.ready));
    if (!open) card.setAttribute('aria-disabled', 'true');

    const icon = document.createElement('span');
    icon.className = 'subject__icon';
    icon.innerHTML = open ? (SUBJECT_ICONS[sub.id] || BOOK_ICON) : ICONS.locked;

    const name = document.createElement('span');
    name.className = 'subject__name';
    name.textContent = sub.title;

    const blurb = document.createElement('span');
    blurb.className = 'subject__blurb';
    blurb.textContent = sub.blurb;

    const status = document.createElement('span');
    status.className = 'subject__status';
    if (!open) status.textContent = 'Locked';
    else if (!sub.ready) status.textContent = 'Unlocked. Content soon';
    else status.textContent = p && p.total ? `${p.done} of ${p.total} cleared` : 'Available now';

    card.append(icon, name, blurb);
    if (open && sub.ready) {
      const bar = document.createElement('span');
      bar.className = 'subject__bar';
      const fill = document.createElement('span');
      fill.style.width = (p && p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0) + '%';
      bar.appendChild(fill);
      card.appendChild(bar);
    }
    card.appendChild(status);
    wrap.appendChild(card);
  });
}

function refreshDashboard() {
  const t = currentSummary();
  const lv = levelInfo(t.xp);
  document.getElementById('dash-streak').textContent = '\uD83D\uDD25 ' + t.streak;
  document.getElementById('dash-xp').textContent = '\u26A1 ' + t.xp;
  document.getElementById('dash-hearts').textContent = '\u2764\uFE0F ' + t.hearts;
  document.getElementById('dash-level').textContent = 'Lv ' + lv.level;
  document.getElementById('dash-level-fill').style.width = lv.pct + '%';
  document.getElementById('dash-level-text').textContent = `${lv.into} / ${lv.need} XP`;
  document.getElementById('dash-level-bar').setAttribute('aria-valuenow', String(lv.pct));
  renderHero(t);
  renderMission();
  renderSubjects(t);
  document.getElementById('lb-meta').textContent = `Lv ${lv.level}   \u26A1 ${t.xp} XP   \uD83D\uDD25 ${t.streak}`;
  eraseBtn.disabled = !t.hasSave;
  document.getElementById('erase-desc').textContent = t.hasSave
    ? 'Wipes XP, streak, hearts and cleared modules.'
    : 'Nothing to erase yet.';
}

function showView(name) {
  ['home', 'leaderboard', 'settings'].forEach(v => {
    document.getElementById('view-' + v).classList.toggle('hidden', v !== name);
  });
  document.querySelectorAll('.dock__btn').forEach(b => {
    const on = b.dataset.view === name;
    b.classList.toggle('is-active', on);
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}

function enterGameplay(subjectId) {
  if (transitioning) return;
  const id = SUBJECTS.some(s => s.id === subjectId && s.ready) ? subjectId : 'polity';
  transitioning = true;
  swapScreens(dashboardScreen, gameScreen, () => {
    if (loadedSubject !== id) { // first visit, or another subject than last time
      currentSubject = id;
      loadedSubject = id;
      startGameplay(); // restore the save, load this subject's sheet, render its tree
    }
    gameScreen.focus({ preventScroll: true });
    transitioning = false;
  });
}

function showDashboard() {
  if (transitioning) return;
  transitioning = true;
  if (arena) closeArena();
  stopSpeaking();
  swapScreens(gameScreen, dashboardScreen, () => {
    refreshDashboard();
    transitioning = false;
  });
}

/* Erase warning */
function openConfirm() {
  const t = currentSummary();
  const done = Object.values(t.progress).reduce((sum, p) => sum + p.done, 0);
  confirmText.textContent = `This erases ${t.xp} XP, a streak of ${t.streak} and ${done} cleared modules, with every module\u2019s statistics. It cannot be undone.`;
  confirmEl.classList.remove('hidden');
  confirmCancel.focus();
}
function closeConfirm() {
  confirmEl.classList.add('hidden');
  eraseBtn.focus();
}

/* Events */
document.getElementById('hero-cta').addEventListener('click', () => enterGameplay(heroSubjectId));
document.getElementById('btn-back').addEventListener('click', showDashboard);

document.getElementById('subjects').addEventListener('click', e => {
  const card = e.target.closest('.subject');
  if (!card) return;
  // locked, or unlocked by a boss fight but without content yet: shake, do not navigate
  if (card.classList.contains('subject--locked') || card.dataset.ready !== 'true') {
    card.classList.remove('is-denied');
    void card.offsetWidth;
    card.classList.add('is-denied');
    return;
  }
  enterGameplay(card.dataset.id);
});

document.querySelector('.dock').addEventListener('click', e => {
  const btn = e.target.closest('.dock__btn');
  if (btn) showView(btn.dataset.view);
});

voiceSwitch.addEventListener('click', () => setVoice(!voiceOn));
eraseBtn.addEventListener('click', openConfirm);
confirmCancel.addEventListener('click', closeConfirm);
confirmOk.addEventListener('click', () => {
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(LEGACY_SAVE_KEY); } catch (_) { /* storage unavailable */ }
  try { localStorage.removeItem(SANKALP_KEY); } catch (_) { /* storage unavailable */ }
  mission = null;
  confirmEl.classList.add('hidden');
  resetState();
  loadedSubject = null; // the next entry reloads the data and starts from the defaults
  currentSubject = 'polity';
  refreshDashboard();
  eraseBtn.focus();
});
confirmEl.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const order = [confirmCancel, confirmOk];
  const i = order.indexOf(document.activeElement);
  order[(i + (e.shiftKey ? -1 : 1) + order.length) % order.length].focus();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !confirmEl.classList.contains('hidden')) closeConfirm();
});

/* ------------------------------------------------------------------
   DAILY SANKALP: quote, mission, hold-to-enter, Chill Mode
------------------------------------------------------------------- */
const SANKALP_KEY = 'kanthasth.sankalp';
const QUOTES_KEY = 'kanthasth.data.quotes';
const HOLD_MS = 2000;
let mission = null;      // today's accepted mission: { day, accepted, goal, note, done, rewarded }
let pendingChill = false;
let todaysQuote = null;
let suggestedGoal = 2;
let sankalpSpoken = false;

// Works like Math.floor(Date.now() / 86400000), shifted by the time zone so that the quote and the mission
// change at local midnight instead of 5:30 AM in India
function dayNumber() {
  return Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
}

const DEFAULT_QUOTES = [
  { quote: 'karmaṇy-evādhikāras te mā phaleṣu kadācana', meaning: 'You have the right to do your work, but never to its fruits. Give your full effort and let go of the worry about the result.', source: 'Bhagavad Gita 2.47' },
  { quote: 'yoga-sthaḥ kuru karmāṇi saṅgaṁ tyaktvā dhanañjaya', meaning: 'Stand firm in yoga and do your duty, letting go of attachment. Stay steady in success and in failure, for that evenness of mind is yoga.', source: 'Bhagavad Gita 2.48' },
  { quote: 'uddhared ātmanātmānaṁ nātmānam avasādayet', meaning: 'Lift yourself up by your own effort, and never let yourself sink. You are your own friend, and you can also be your own enemy.', source: 'Bhagavad Gita 6.5' },
  { quote: 'mātrā-sparśās tu kaunteya śītoṣṇa-sukha-duḥkha-dāḥ', meaning: 'Heat and cold, pleasure and pain come and go. They do not last, so endure them with patience.', source: 'Bhagavad Gita 2.14' },
  { quote: 'abhyāsena tu kaunteya vairāgyeṇa ca gṛhyate', meaning: 'The restless mind can be trained through steady practice and detachment. Small daily effort is how it is won.', source: 'Bhagavad Gita 6.35' },
  { quote: 'tasmād asaktaḥ satataṁ kāryaṁ karma samācara', meaning: 'Therefore, keep doing your duty without attachment. Work done with a calm mind leads to the highest good.', source: 'Bhagavad Gita 3.19' },
  { quote: 'na hi jñānena sadṛśaṁ pavitram iha vidyate', meaning: 'In this world, nothing purifies like knowledge. Every page you study makes you clearer and stronger.', source: 'Bhagavad Gita 4.38' }
];

/* ---- quotes: an optional "Quotes" tab of the sheet, with the built-in verses as a fallback ---- */
function parseQuotesCsv(text) {
  const table = parseCsv(text);
  if (table.length < 2) throw new SheetError('The quotes sheet needs a header row and at least one quote.');
  const head = table[0].map(h => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  const find = names => head.findIndex(h => names.includes(h));
  const qi = find(['quote', 'verse', 'shloka', 'text']);
  const mi = find(['meaning', 'translation', 'explanation']);
  const si = find(['source', 'reference', 'chapter']);
  if (qi < 0) throw new SheetError('The quotes sheet needs a "quote" column.');
  const cell = (r, i) => (i >= 0 && r[i] !== undefined ? r[i].trim().replace(/\\n/g, '\n') : '');
  const list = table.slice(1).map(r => ({ quote: cell(r, qi), meaning: cell(r, mi), source: cell(r, si) })).filter(x => x.quote);
  if (!list.length) throw new SheetError('No quotes were found in the quotes sheet.');
  return list;
}

function writeCachedQuotes(url, list) {
  try { localStorage.setItem(QUOTES_KEY, JSON.stringify({ url: normalizeSheetUrl(url), savedAt: Date.now(), data: list })); } catch (_) { /* storage full or blocked */ }
}
function readCachedQuotes(url) {
  try {
    const c = JSON.parse(localStorage.getItem(QUOTES_KEY));
    if (c && Array.isArray(c.data) && c.data.length && c.url === normalizeSheetUrl(url)) return c.data;
  } catch (_) { /* no usable cache */ }
  return null;
}
function savedQuotes() {
  const url = getSheetUrl('quotes');
  return (url && readCachedQuotes(url)) || DEFAULT_QUOTES;
}
async function loadQuotes() {
  const url = getSheetUrl('quotes');
  if (!url) return DEFAULT_QUOTES;
  try {
    const list = parseQuotesCsv(await fetchSheetCsv(url));
    writeCachedQuotes(url, list);
    return list;
  } catch (err) {
    console.warn('[Kanthasth] Quotes sheet not used:', err.message);
    return readCachedQuotes(url) || DEFAULT_QUOTES;
  }
}
const pickQuote = list => list[dayNumber() % list.length]; // the same quote all day, a new one tomorrow, no server needed

/* ---- mission ---- */
function readMission() {
  try {
    const m = JSON.parse(localStorage.getItem(SANKALP_KEY));
    return m && m.accepted && m.day === dayNumber() ? m : null;
  } catch (_) { return null; }
}
function writeMission() {
  try { localStorage.setItem(SANKALP_KEY, JSON.stringify(mission)); } catch (_) { /* storage unavailable */ }
}

// Scans the skill tree (live if it is loaded, otherwise the saved copy of every subject) for unlocked, unfinished nodes
function countOpenNodes() {
  let total = 0;
  const s = readSave();
  Object.keys((s && s.subjects) || {}).forEach(id => {
    if (SKILL_TREE_DATA.length && id === currentSubject) return;
    total += Object.values(s.subjects[id].nodes || {}).filter(v => v === 'unlocked').length;
  });
  if (SKILL_TREE_DATA.length) total += SKILL_TREE_DATA.filter(n => n.state === 'unlocked').length;
  return total;
}
function suggestGoal() {
  const open = countOpenNodes();
  return open === 1 ? 1 : 2;
}
const goalText = n => `Clear the next ${n} unlocked node${n > 1 ? 's' : ''}`;

// "3" or "3 nodes" sets how many nodes to clear; anything else is kept as your own note
function parseCustomTarget(raw) {
  const t = String(raw || '').trim().slice(0, 80);
  if (!t) return { goal: null, note: '' };
  const m = t.match(/^(\d{1,2})(?:\s*nodes?)?$/i);
  if (m) return { goal: Math.min(12, Math.max(1, Number(m[1]))), note: '' };
  return { goal: null, note: t };
}

function missionProgress() {
  if (!mission || mission.day !== dayNumber()) return;
  mission.done += 1;
  if (!mission.rewarded && mission.done >= mission.goal) {
    mission.rewarded = true;
    pendingChill = true; // shown once the Performance Analysis is closed
  }
  writeMission();
}

function renderMission() {
  const card = document.getElementById('mission-card');
  if (!mission || mission.day !== dayNumber()) { card.hidden = true; return; }
  card.hidden = false;
  const pct = Math.min(100, Math.round((mission.done / mission.goal) * 100));
  card.classList.toggle('is-chill', mission.rewarded);
  document.getElementById('mission-title').textContent = mission.rewarded ? 'Chill Mode earned' : 'Today\u2019s Mission';
  document.getElementById('mission-count').textContent = Math.min(mission.done, mission.goal) + ' of ' + mission.goal;
  document.getElementById('mission-text').textContent = mission.rewarded ? 'Mission accomplished. Rest well, anything extra today is a bonus.' : goalText(mission.goal);
  document.getElementById('mission-fill').style.width = pct + '%';
  const note = document.getElementById('mission-note');
  note.hidden = !mission.note;
  note.textContent = mission.note ? 'Your own target: ' + mission.note : '';
}

/* ---- Chill Mode reward ---- */
const chillEl = document.getElementById('chill');
function showChill() {
  const note = document.getElementById('chill-note');
  note.hidden = !(mission && mission.note);
  note.textContent = mission && mission.note ? 'Your own target: ' + mission.note : '';
  chillEl.classList.remove('hidden');
  document.getElementById('chill-done').focus();
  speak('Mission accomplished. You have earned your rest.');
}
function hideChill() { chillEl.classList.add('hidden'); stopSpeaking(); }
document.getElementById('chill-done').addEventListener('click', hideChill);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !chillEl.classList.contains('hidden')) hideChill(); });

/* ---- the Sankalp screen ---- */
const sankalpScreen = document.getElementById('sankalp-screen');
const holdBtn = document.getElementById('sankalp-hold');
const holdFill = holdBtn.querySelector('.hold__fill');

function renderQuote() {
  document.getElementById('sankalp-quote').textContent = todaysQuote.quote;
  document.getElementById('sankalp-meaning').textContent = todaysQuote.meaning;
  document.getElementById('sankalp-source').textContent = todaysQuote.source;
}

// Speaks the meaning softly (pitch 1.2, rate 0.85 come from speak()); browsers may block speech until the first tap
function speakQuote() {
  if (!todaysQuote) return;
  const u = speak((todaysQuote.source ? todaysQuote.source + '. ' : '') + (todaysQuote.meaning || todaysQuote.quote));
  if (u) u.onstart = () => { sankalpSpoken = true; };
}
document.getElementById('sankalp-listen').addEventListener('click', speakQuote);
sankalpScreen.addEventListener('pointerdown', () => { if (!sankalpSpoken) speakQuote(); }, { once: true });

function showSankalp() {
  document.getElementById('sankalp-date').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  suggestedGoal = suggestGoal();
  document.getElementById('sankalp-target').textContent = goalText(suggestedGoal);
  todaysQuote = pickQuote(savedQuotes());
  renderQuote();
  loadQuotes().then(list => { // a connected Quotes tab replaces the built-in verses while the screen is still open
    if (mission) return;
    const q = pickQuote(list);
    if (q.quote !== todaysQuote.quote) { todaysQuote = q; renderQuote(); }
  });
  setTimeout(speakQuote, 500);
}

function revealDashboard() {
  const wait = prefersReducedMotion() ? 0 : FADE_MS;
  sankalpScreen.classList.add('is-fading');
  setTimeout(() => {
    sankalpScreen.classList.add('hidden');
    sankalpScreen.classList.remove('is-fading');
    dashboardScreen.classList.add('is-fading');
    document.documentElement.classList.add('sankalp-done'); // the dashboard may be shown now
    refreshDashboard();
    window.scrollTo(0, 0);
    requestAnimationFrame(() => requestAnimationFrame(() => dashboardScreen.classList.remove('is-fading')));
  }, wait);
}

function acceptMission() {
  const custom = parseCustomTarget(document.getElementById('sankalp-custom').value);
  mission = { day: dayNumber(), accepted: true, goal: custom.goal || suggestedGoal, note: custom.note, done: 0, rewarded: false };
  writeMission();
  stopSpeaking();
  if (navigator.vibrate) navigator.vibrate(40);
  revealDashboard();
}

// Hold to enter: the ring fills over HOLD_MS; letting go early starts it over
function initHold(btn, onDone) {
  let raf = 0;
  let t0 = 0;
  let holding = false;
  const setRing = p => { holdFill.style.strokeDashoffset = String(1 - p); };
  const frame = now => {
    if (!holding) return;
    const p = Math.min(1, (now - t0) / HOLD_MS);
    setRing(p);
    if (p >= 1) { holding = false; btn.classList.remove('is-holding'); btn.classList.add('is-done'); onDone(); }
    else raf = requestAnimationFrame(frame);
  };
  const start = () => {
    if (holding || btn.classList.contains('is-done')) return;
    holding = true;
    t0 = performance.now();
    btn.classList.add('is-holding');
    raf = requestAnimationFrame(frame);
  };
  const cancel = () => {
    if (!holding) return;
    holding = false;
    cancelAnimationFrame(raf);
    btn.classList.remove('is-holding');
    setRing(0);
  };
  btn.addEventListener('pointerdown', e => { e.preventDefault(); start(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => btn.addEventListener(t, cancel));
  btn.addEventListener('contextmenu', e => e.preventDefault());
  btn.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } });
  btn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') cancel(); });
  setRing(0);
}
initHold(holdBtn, acceptMission);

function initSankalp() {
  mission = readMission();
  const root = document.documentElement;
  if (root.classList.contains('sankalp-done') && mission) { // accepted earlier today: straight to the dashboard
    sankalpScreen.classList.add('hidden');
    renderMission();
    return;
  }
  root.classList.remove('sankalp-done');
  sankalpScreen.classList.remove('hidden');
  showSankalp();
}

/* Settings: connect and check the lesson sheet of each subject */
const sheetSelect = document.getElementById('sheet-subject');
const sheetInput = document.getElementById('sheet-url');
const sheetSave = document.getElementById('sheet-save');
const sheetStatus = document.getElementById('sheet-status');

function setSheetStatus(message, kind) {
  sheetStatus.textContent = message;
  sheetStatus.className = 'sheet-status' + (kind ? ' is-' + kind : '');
}

function showSheetOf(subject) {
  sheetInput.value = sheetUrls[subject] || '';
  setSheetStatus(getSheetUrl(subject) ? 'A lesson sheet link is saved on this device.' : 'Not connected yet.', '');
}

sheetSelect.addEventListener('change', () => showSheetOf(sheetSelect.value));

sheetSave.addEventListener('click', async () => {
  const subject = sheetSelect.value;
  const raw = sheetInput.value.trim();
  if (!raw) {
    delete sheetUrls[subject];
    saveSettings();
    loadedSubject = null;
    setSheetStatus('Lesson sheet disconnected.', '');
    return;
  }
  sheetSave.disabled = true;
  setSheetStatus('Checking your sheet\u2026', '');
  try {
    if (subject === 'quotes') {
      const list = parseQuotesCsv(await fetchSheetCsv(raw));
      writeCachedQuotes(raw, list);
      sheetUrls[subject] = raw;
      saveSettings();
      setSheetStatus('Connected. Found ' + list.length + ' quotes. One is chosen for each day.', 'ok');
    } else {
      const game = sheetCsvToGame(await fetchSheetCsv(raw));
      validatePolityData(game);
      writeCachedData(subject, raw, game);
      sheetUrls[subject] = raw;
      saveSettings();
      loadedSubject = null; // the next visit to the skill tree loads the new lessons
      setSheetStatus('Connected. Found ' + describeGame(game) + '.', 'ok');
    }
  } catch (err) {
    setSheetStatus(err.message, 'bad');
  } finally {
    sheetSave.disabled = false;
  }
});

function initDashboard() {
  document.getElementById('dash-welcome').textContent = 'Welcome, ' + PLAYER_NAME;
  document.getElementById('lb-avatar').textContent = PLAYER_NAME.charAt(0).toUpperCase();
  document.getElementById('lb-name').textContent = PLAYER_NAME;
  loadSettings();
  SUBJECTS.filter(sub => sub.ready).forEach(sub => {
    const o = document.createElement('option');
    o.value = sub.id;
    o.textContent = sub.title;
    sheetSelect.appendChild(o);
  });
  const qo = document.createElement('option');
  qo.value = 'quotes';
  qo.textContent = 'Daily Sankalp quotes';
  sheetSelect.appendChild(qo);
  showSheetOf(sheetSelect.value);
  if (!HAS_SPEECH) {
    voiceSwitch.disabled = true;
    voiceSwitch.setAttribute('aria-checked', 'false');
    document.getElementById('voice-desc').textContent = 'This browser does not support speech.';
  }
  refreshDashboard();
  initSankalp();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDashboard);
else initDashboard();
