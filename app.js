'use strict';

/* ------------------------------------------------------------------
   DATA
   x = horizontal position in % of tree width, y = row index (0 = top)
   parents = ids that must be completed before this node unlocks
------------------------------------------------------------------- */
const SKILL_TREE_DATA = [
  { id: 'polity_basics',      title: 'Polity Basics',        state: 'completed', x: 50, y: 0, parents: [],                              deck: 'polity_mod1' },
  { id: 'preamble',           title: 'Preamble',             state: 'completed', x: 75, y: 1, parents: ['polity_basics'],               deck: 'polity_mod2' },
  { id: 'fundamental_rights', title: 'Fundamental Rights',   state: 'unlocked',  x: 25, y: 1, parents: ['polity_basics'],               deck: 'polity_mod3' },
  { id: 'dpsp',               title: 'DPSP',                 state: 'locked',    x: 25, y: 2, parents: ['fundamental_rights'],          deck: 'polity_mod4' },
  { id: 'union_executive',    title: 'Union Executive',      state: 'unlocked',  x: 75, y: 2, parents: ['preamble'],                    deck: 'polity_mod5' },
  { id: 'parliament',         title: 'Parliament',           state: 'locked',    x: 50, y: 3, parents: ['dpsp', 'union_executive'],     deck: 'polity_mod6' },
  { id: 'judiciary',          title: 'Judiciary',            state: 'locked',    x: 25, y: 4, parents: ['parliament'],                  deck: 'polity_mod7' },
  { id: 'federalism',         title: 'Federal Structure',    state: 'locked',    x: 75, y: 4, parents: ['parliament'],                  deck: 'polity_mod8' },
  { id: 'polity_boss',        title: 'Polity Boss Test',     state: 'locked',    x: 50, y: 5, parents: ['judiciary', 'federalism'],     deck: 'polity_boss' }
];

/* ------------------------------------------------------------------
   GLOBAL GAME STATE
------------------------------------------------------------------- */
const MAX_HEARTS = 5;
const XP_PER_CORRECT = 50;
const QUESTIONS_PER_RUN = 1; // questions asked before a node completes; raise it when modules have more content
let hearts = 5;
let streak = 0;
let xp = 0;

/* ------------------------------------------------------------------
   MODULE DATA (keyed by node id)
   correctAnswer must match one of the options exactly
------------------------------------------------------------------- */
const MODULE_DATA = {
  fundamental_rights: {
    questions: [
      {
        question: 'Which Article of the Constitution of India guarantees the Right to Life and Personal Liberty?',
        options: ['Article 19', 'Article 20', 'Article 21', 'Article 22'],
        correctAnswer: 'Article 21',
        mentorScolding: 'Focus! Article 21 is life and liberty. You just lost a heart and your streak. Try again!'
      },
      {
        question: 'The Right to Education was made a Fundamental Right (Article 21A) by which Constitutional Amendment?',
        options: ['42nd Amendment', '44th Amendment', '86th Amendment', '93rd Amendment'],
        correctAnswer: '86th Amendment',
        mentorScolding: 'Sloppy. The 86th Amendment gave us Article 21A. Dates and numbers win this exam. You lost a heart. Recover.'
      },
      {
        question: 'Who described Article 32, the Right to Constitutional Remedies, as the heart and soul of the Constitution?',
        options: ['Jawaharlal Nehru', 'Dr. B. R. Ambedkar', 'Rajendra Prasad', 'Sardar Patel'],
        correctAnswer: 'Dr. B. R. Ambedkar',
        mentorScolding: 'Unacceptable. Ambedkar called Article 32 the heart and soul. This is a one-mark gift and you dropped it. Streak gone. Rebuild.'
      }
    ]
  }
};

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

const NODE_BY_ID = new Map(SKILL_TREE_DATA.map(n => [n.id, n]));
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
  if (hearts <= 0) return ['No hearts left. Revise your notes. Come back sharper.'];
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
  if (hearts <= 0) {
    alertMentor('No hearts left. Revise your notes and come back sharper. Weakness does not get a second attempt today.');
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
   INIT
------------------------------------------------------------------- */
renderHUD();
renderTree();
say(mentorLines()[0]);
syncBottomPadding();
