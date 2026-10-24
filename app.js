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
    btn.setAttribute('aria-label', data.title + (data.type === 'boss' ? ' boss fight' : '') + ', ' + STATE_LABEL[data.state]);
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

  if (node.state === 'unlocked') {
    openArena(node, btn);
  } else if (node.state === 'locked') {
    const missing = node.parents
      .map(id => NODE_BY_ID.get(id))
      .filter(p => p.state !== 'completed')
      .map(p => p.title);
    say(`\u2018${node.title}\u2019 is not open yet. Finish ${missing.join(' and ')} first and it will open for you. You can do it.`);
    btn.classList.remove('is-denied');
    void btn.offsetWidth;
    btn.classList.add('is-denied');
  } else {
    say(`\u2018${node.title}\u2019 is complete. A little revision later will help it stay with you.`);
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
const PAIR_COLORS = ['#39FF88', '#22E4FF', '#F6C453', '#FF7AD9', '#B79CFF'];
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

const currentQuestion = () => arena.questions[arena.index];

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

// Slide mode: a lesson, not a test. No options, no hearts, no XP
function renderSlide(q) {
  const wrap = document.createElement('div');
  wrap.className = 'slide';
  String(q.explanation).split(/\n+/).filter(Boolean).forEach(text => {
    const p = document.createElement('p');
    p.className = 'slide__body';
    p.textContent = text;
    wrap.appendChild(p);
  });
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn btn--primary slide__next';
  next.textContent = 'I Understand / Next';
  next.addEventListener('click', onSlideNext);
  wrap.appendChild(next);
  arenaOptions.appendChild(wrap);
}

function onSlideNext() {
  if (!arena || arena.busy) return;
  stopSpeaking();
  arena.index += 1;
  if (arena.index < arena.questions.length) {
    renderQuestion();
    focusFirst();
    return;
  }
  completeNode(arena.node); // a lessons-only module is finished once the last slide is read
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

function renderQuestion() {
  const q = currentQuestion();
  const type = questionType(q);
  explainEl.hidden = true;
  fillList([]);
  arena.match = null;
  arenaCard.scrollTop = 0;

  arenaEl.dataset.type = arena.boss ? 'bossFight' : type;
  arenaCount.textContent = type === 'slide'
    ? 'Lesson ' + (arena.index + 1) + ' of ' + arena.slideCount
    : 'Question ' + (arena.index - arena.slideCount + 1) + ' of ' + (arena.questions.length - arena.slideCount);
  arenaType.textContent = arena.boss ? 'Boss fight' : TYPE_LABEL[type];

  renderFigure(q);
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

function openArena(node, opener) {
  checkHeartRefill();
  if (hearts <= 0) {
    alertMentor(`No hearts left right now. A new one arrives in ${refillMinutes()} min. Rest, and review your notes until then.`);
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
  const questions = slides.concat(picked);

  arena = { node, mod, questions, slideCount: slides.length, index: 0, busy: false, awaitingContinue: false, result: null, match: null, opener, boss: null };

  if (isBoss) {
    const limit = Number.isFinite(mod.timeLimit) ? mod.timeLimit : 60;
    const required = Number.isInteger(mod.requiredCorrect) ? Math.min(mod.requiredCorrect, questions.length) : questions.length;
    arena.boss = {
      limit, required, bonus: Number.isFinite(mod.bonusXp) ? mod.bonusXp : 0,
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
  } else {
    if (questionType(currentQuestion()) !== 'slide') say('Take your time and read carefully. Mistakes are how we learn.');
  }
  focusFirst();
}

function closeArena() {
  stopSpeaking();
  if (arena && arena.boss) {
    clearInterval(arena.boss.timerId);
    clearTimeout(arena.boss.nextTimer);
  }
  arenaTimer.hidden = true;
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

function unlockSubject(id) {
  if (id && !unlockedSubjects.includes(id)) unlockedSubjects.push(id);
}

function completeNode(node, line) {
  node.state = 'completed';
  unlockChildren();
  saveProgress();
  closeArena();
  renderTree();
  lineIndex = 0;
  say(line || mentorLines()[0]);
  const next = document.querySelector('.node--unlocked');
  if (next) next.focus({ preventScroll: true });
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
    ? `Well done. +${XP_PER_CORRECT} XP`
    : (result === 'gameover' ? 'Not quite. That was your last heart for now.' : 'Not quite. You used one heart.');
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
  if (arena.boss) { bossAnswer(q, true, {}, false); return; }

  stopSpeaking();
  const leveled = gainXp(XP_PER_CORRECT);
  streak += 1;
  renderHUD(); // HUD reacts instantly; the reward is saved when the player presses Continue
  const line = leveled
    ? `Level ${leveled}! I am so proud of you. Keep going at your own pace.`
    : `Lovely. +${XP_PER_CORRECT} XP. Streak: ${streak}. Well done.`;
  say(line);
  if (leveled) speak(line);
  showExplanation(q, 'correct', {});
}

function finishWrong(q, opts) {
  arena.busy = true;
  lockInputs();
  const out = loseHeart();
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
    const leveled = gainXp(XP_PER_CORRECT);
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
    say(leveled ? `Boss cleared, and Level ${leveled} reached. How wonderful.` : `Boss cleared. +${b.bonus} XP. I knew you could do it.`);
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
    cleared: `Boss cleared. +${b.bonus} XP bonus`,
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
  if (a.result === 'bossfailed') {
    saveProgress(); // XP and streak earned during the fight
    closeArena();
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
  closeArena(); // wrong answers end the run; the node stays unlocked for another attempt
}

// Close / Esc must not skip the commit step once an answer has been given
function leaveArena() {
  if (!arena) return;
  if (arena.boss && !arena.boss.over) { endBoss('retreat'); return; }
  if (arena.awaitingContinue) onContinue();
  else closeArena();
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

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: voiceOn })); } catch (_) { /* storage unavailable */ }
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (s && typeof s.voice === 'boolean') setVoice(s.voice, false);
  } catch (_) { /* no settings yet, or storage unavailable */ }
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

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && arena) leaveArena();
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
  const next = SKILL_TREE_DATA.find(n => n.state === 'unlocked');
  const payload = { v: SAVE_VERSION, hearts, streak, xp, heartsEmptyAt, nodes, target: next ? next.title : null, unlockedSubjects, savedAt: Date.now() };
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
const nonBlank = v => (typeof v === 'string' || typeof v === 'number') && String(v).trim() !== '';

function validateQuestion(q, where, allowedTypes) {
  if (!q || typeof q !== 'object') throw new Error(`${where} must be an object`);
  const type = questionType(q);
  if (!allowedTypes.includes(type)) throw new Error(`${where} has questionType "${type}", which is not allowed here`);
  if (!nonBlank(q.question) || !nonBlank(q.explanation)) throw new Error(`${where} needs question and explanation`);
  if (q.imageUrl !== undefined && !nonBlank(q.imageUrl)) throw new Error(`${where} imageUrl must be a non-empty string`);
  if (q.imageAlt !== undefined && typeof q.imageAlt !== 'string') throw new Error(`${where} imageAlt must be a string`);
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

    const boss = mod.questionType === 'bossFight';
    const allowed = boss ? ['mcq', 'trueFalse', 'fillBlank'] : ['mcq', 'trueFalse', 'match', 'fillBlank', 'slide'];
    mod.questions.forEach((q, i) => validateQuestion(q, `modules."${nodeId}".questions[${i}]`, allowed));

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

async function loadPolity() {
  console.log('[Kanthasth] Loading ' + DATA_URL + '...');
  showStatus('Loading Polity\u2026', false);
  say('Getting your lessons ready. One moment.');

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
    say('Something did not load. No worries, tap Retry and we will try again.');
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
  loadPolity();
}

/* ------------------------------------------------------------------
   DASHBOARD (home screen) + SCREEN TRANSITIONS
------------------------------------------------------------------- */
const PLAYER_NAME = 'Gaurav';
const POLITY_MODULES = 9;
const FADE_MS = 450;

const SUBJECTS = [
  { id: 'polity',    title: 'Indian Polity',   blurb: 'Constitution, rights, Parliament', unlocked: true,  ready: true },
  { id: 'history',   title: 'History',         blurb: 'Ancient to modern India',          unlocked: false, ready: false },
  { id: 'geography', title: 'Geography',       blurb: 'India and the world',              unlocked: false, ready: false },
  { id: 'economy',   title: 'Economy',         blurb: 'Growth, banking, budgets',         unlocked: false, ready: false },
  { id: 'science',   title: 'General Science', blurb: 'Physics, chemistry, biology',      unlocked: false, ready: false },
  { id: 'maths',     title: 'Mathematics',     blurb: 'Arithmetic and algebra',           unlocked: false, ready: false }
];
const POLITY_ICON = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M12 3L3 8v2h18V8zM5 11h2v7H5zM9 11h2v7H9zM13 11h2v7h-2zM17 11h2v7h-2zM3 19h18v2H3z" fill="currentColor"/></svg>';

const dashboardScreen = document.getElementById('dashboard-screen');
const gameScreen = document.getElementById('gameplay-screen');
const confirmEl = document.getElementById('confirm');
const confirmText = document.getElementById('confirm-text');
const confirmOk = document.getElementById('confirm-ok');
const confirmCancel = document.getElementById('confirm-cancel');
const eraseBtn = document.getElementById('btn-erase');
const voiceSwitch = document.getElementById('set-voice');

let gameStarted = false;   // fetch, HUD and save restore run on the first entry only
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
  lineIndex = 0;
}

function saveSummary(s) {
  const states = s.nodes && typeof s.nodes === 'object' ? Object.values(s.nodes) : [];
  let h = intIn(s.hearts, 0, 99, 0);
  // hearts that have already refilled while the player was away
  if (h === 0 && Number.isFinite(s.heartsEmptyAt) && Date.now() - s.heartsEmptyAt >= HEART_REFILL_MS) h = MAX_HEARTS;
  return {
    hearts: h,
    streak: intIn(s.streak, 0, 1000000, 0),
    xp: intIn(s.xp, 0, 1000000000, 0),
    done: states.filter(v => v === 'completed').length,
    total: states.length,
    target: typeof s.target === 'string' ? s.target : null,
    unlockedSubjects: Array.isArray(s.unlockedSubjects) ? s.unlockedSubjects.filter(v => typeof v === 'string') : [],
    hasSave: true
  };
}

// The dashboard reads the save game; if storage is blocked it falls back to the live game state
function currentSummary() {
  const s = readSave();
  if (s) return saveSummary(s);
  if (gameStarted && SKILL_TREE_DATA.length) {
    const next = SKILL_TREE_DATA.find(n => n.state === 'unlocked');
    return {
      hearts, streak, xp,
      done: SKILL_TREE_DATA.filter(n => n.state === 'completed').length,
      total: SKILL_TREE_DATA.length,
      target: next ? next.title : null,
      unlockedSubjects: unlockedSubjects.slice(),
      hasSave: true
    };
  }
  return { hearts: MAX_HEARTS, streak: 0, xp: 0, done: 0, total: 0, target: null, unlockedSubjects: [], hasSave: false };
}

function renderHero(t) {
  const total = t.total || POLITY_MODULES;
  const pct = Math.min(100, Math.round((t.done / total) * 100));
  const cleared = t.hasSave && t.done >= total;
  let title, line, cta;

  if (!t.hasSave) {
    title = 'Clear your first module';
    line = 'A gentle start is all it takes. Begin whenever you feel ready.';
    cta = 'Start Journey';
  } else if (cleared) {
    title = 'All modules cleared';
    line = 'A little gentle revision will keep everything fresh.';
    cta = 'Revise Polity';
  } else {
    title = t.target ? `Continue with \u2018${t.target}\u2019` : 'Continue your journey';
    line = t.streak > 0 ? `Streak: ${t.streak}. Keep that lovely rhythm going.` : 'Start a new streak today, one answer at a time.';
    cta = 'Resume Journey';
  }

  document.getElementById('hero-title').textContent = title;
  document.getElementById('hero-line').textContent = line;
  document.getElementById('hero-count').textContent = `${t.done} of ${total} modules cleared`;
  document.getElementById('hero-fill').style.width = pct + '%';
  document.getElementById('hero-bar').setAttribute('aria-valuenow', String(pct));
  document.getElementById('hero-cta').textContent = cta;
}

function renderSubjects(t) {
  const total = t.total || POLITY_MODULES;
  const wrap = document.getElementById('subjects');
  wrap.replaceChildren();

  SUBJECTS.forEach(sub => {
    const open = sub.unlocked || t.unlockedSubjects.includes(sub.id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'subject ' + (open ? 'subject--open' : 'subject--locked');
    card.dataset.id = sub.id;
    card.dataset.ready = String(Boolean(sub.ready));
    if (!open) card.setAttribute('aria-disabled', 'true');

    const icon = document.createElement('span');
    icon.className = 'subject__icon';
    icon.innerHTML = open ? POLITY_ICON : ICONS.locked;

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
    else status.textContent = t.hasSave ? `${t.done} of ${total} cleared` : 'Available now';

    card.append(icon, name, blurb);
    if (open && sub.ready) {
      const bar = document.createElement('span');
      bar.className = 'subject__bar';
      const fill = document.createElement('span');
      fill.style.width = Math.min(100, Math.round((t.done / total) * 100)) + '%';
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

function enterGameplay() {
  if (transitioning) return;
  transitioning = true;
  swapScreens(dashboardScreen, gameScreen, () => {
    if (!gameStarted) {
      gameStarted = true;
      startGameplay(); // existing logic: restore save, fetch polity.json, render the tree
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
  confirmText.textContent = `This erases ${t.xp} XP, a streak of ${t.streak} and ${t.done} cleared modules. It cannot be undone.`;
  confirmEl.classList.remove('hidden');
  confirmCancel.focus();
}
function closeConfirm() {
  confirmEl.classList.add('hidden');
  eraseBtn.focus();
}

/* Events */
document.getElementById('hero-cta').addEventListener('click', enterGameplay);
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
  enterGameplay();
});

document.querySelector('.dock').addEventListener('click', e => {
  const btn = e.target.closest('.dock__btn');
  if (btn) showView(btn.dataset.view);
});

voiceSwitch.addEventListener('click', () => setVoice(!voiceOn));
eraseBtn.addEventListener('click', openConfirm);
confirmCancel.addEventListener('click', closeConfirm);
confirmOk.addEventListener('click', () => {
  try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* storage unavailable */ }
  confirmEl.classList.add('hidden');
  resetState();
  gameStarted = false; // the next entry reloads the data and starts from the defaults
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

function initDashboard() {
  document.getElementById('dash-welcome').textContent = 'Welcome, ' + PLAYER_NAME;
  document.getElementById('lb-avatar').textContent = PLAYER_NAME.charAt(0).toUpperCase();
  document.getElementById('lb-name').textContent = PLAYER_NAME;
  loadSettings();
  if (!HAS_SPEECH) {
    voiceSwitch.disabled = true;
    voiceSwitch.setAttribute('aria-checked', 'false');
    document.getElementById('voice-desc').textContent = 'This browser does not support speech.';
  }
  refreshDashboard();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDashboard);
else initDashboard();
