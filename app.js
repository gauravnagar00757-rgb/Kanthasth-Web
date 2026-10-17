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

const PLAYER = { hearts: 5, maxHearts: 5, streak: 3, xp: 150 };

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
  const lost = PLAYER.maxHearts - PLAYER.hearts;
  const hearts = document.getElementById('stat-hearts');
  hearts.className = 'stat stat--hearts';
  hearts.textContent = '\u2764\uFE0F'.repeat(PLAYER.hearts) + '\uD83D\uDDA4'.repeat(lost);

  const streak = document.getElementById('stat-streak');
  streak.className = 'stat stat--streak';
  streak.textContent = '\uD83D\uDD25 ' + PLAYER.streak;

  const xp = document.getElementById('stat-xp');
  xp.className = 'stat stat--xp';
  xp.textContent = '\u26A1 ' + PLAYER.xp;
}

function currentTarget() {
  return SKILL_TREE_DATA.find(n => n.state === 'unlocked');
}

function mentorLines() {
  const target = currentTarget();
  const done = SKILL_TREE_DATA.filter(n => n.state === 'completed').length;
  if (!target) return ['All modules cleared. Now revise. Mocks are the next battlefield.'];
  return [
    `Target: Clear the \u2018${target.title}\u2019 node today. Do not break the streak.`,
    `${PLAYER.streak}-day streak. Protect it. One module before anything else.`,
    `Hearts: ${PLAYER.hearts}/${PLAYER.maxHearts}. Each wrong answer costs one. Accuracy over speed.`,
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
}

/* ------------------------------------------------------------------
   EVENTS
------------------------------------------------------------------- */
treeEl.addEventListener('click', e => {
  const btn = e.target.closest('.node');
  if (!btn) return;
  const node = NODE_BY_ID.get(btn.dataset.id);

  if (node.state === 'unlocked') {
    alert('Starting module...\n' + node.title);
    // Phase 2: route to the flashcard player, e.g. location.href = 'flashcards.html?deck=' + node.deck;
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
   INIT
------------------------------------------------------------------- */
renderHUD();
renderTree();
say(mentorLines()[0]);
syncBottomPadding();
