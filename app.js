import { getStroke } from './node_modules/perfect-freehand/dist/esm/index.mjs';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const studio = window.studio;

const canvas = $('#canvas');
const ctx = canvas.getContext('2d');

let project = null; // { id, name, prompt, style, strokes, picked, step }
let results = []; // data URLs of generated concepts
let tool = 'pen';
let size = 14;
let current = null; // stroke being drawn

// ---------- screens and steps ----------

function show(screen) {
  $('#home').hidden = screen !== 'home';
  $('#work').hidden = screen !== 'work';
}

function goTo(step) {
  project.step = step;
  for (const li of $$('.steps li')) li.classList.toggle('on', li.dataset.step === step);
  for (const p of $$('.panel')) p.hidden = p.dataset.panel !== step;
  canvas.hidden = step === 'pick' || step === 'save';
  $('#results').hidden = step !== 'pick';
  $('#final').hidden = step !== 'save';
  if (step === 'describe') refreshAi();
  if (step === 'save') $('#final').src = results[project.picked];
  if (step === 'pick') renderResults();
  save();
}

async function openHome() {
  show('home');
  refreshAi();
  const list = await studio.listProjects();
  $('#recent-title').hidden = list.length === 0;
  $('#recent').replaceChildren(...list.slice(0, 12).map((p) => {
    const b = document.createElement('button');
    b.className = 'card';
    const img = document.createElement('img');
    img.alt = '';
    if (p.thumb) img.src = p.thumb;
    const label = document.createElement('span');
    label.textContent = p.name || 'Untitled sketch';
    b.append(img, label);
    b.onclick = () => openProject(p.id);
    return b;
  }));
}

function newProject() {
  project = { id: `c${Date.now()}`, name: '', prompt: '', style: 'prop', strokes: [], picked: null, step: 'sketch' };
  results = [];
  openWork();
}

async function openProject(id) {
  ({ project, results } = await studio.loadProject(id));
  openWork();
}

function openWork() {
  show('work');
  $('#prompt').value = project.prompt;
  setChoice('.style', 'style', project.style);
  redraw();
  // Results may be gone if a generate was interrupted; fall back to the sketch.
  const step = (project.step === 'pick' || project.step === 'save') && results.length === 0 ? 'sketch' : project.step;
  goTo(step === 'save' && project.picked == null ? 'pick' : step);
}

function setChoice(selector, key, value) {
  for (const b of $$(selector)) b.classList.toggle('on', b.dataset[key] === String(value));
}

// ---------- autosave ----------

let saveTimer = null;
function save() {
  $('#saved').textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await studio.saveProject(project, canvas.toDataURL('image/png'));
      $('#saved').textContent = 'Saved';
    } catch (err) {
      console.error('Autosave failed', err);
      $('#saved').textContent = 'Not saved! Check disk space.';
    }
  }, 400);
}

// ---------- drawing ----------

function strokePath(stroke) {
  const outline = getStroke(stroke.points, {
    size: stroke.size,
    thinning: stroke.pen ? 0.5 : 0.2,
    smoothing: 0.6,
    streamline: 0.6,
    simulatePressure: !stroke.pen,
  });
  const path = new Path2D();
  outline.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
  path.closePath();
  return path;
}

function redraw() {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const s of [...project.strokes, ...(current ? [current] : [])]) {
    ctx.fillStyle = s.erase ? '#fff' : '#111';
    ctx.fill(strokePath(s));
  }
}

function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height, e.pressure || 0.5];
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  current = { points: [toCanvas(e)], size: tool === 'eraser' ? size * 2 : size, erase: tool === 'eraser', pen: e.pointerType === 'pen' };
  redraw();
});
canvas.addEventListener('pointermove', (e) => {
  if (!current) return;
  const p = toCanvas(e);
  // Shift = straight line from where the stroke started.
  current.points = e.shiftKey ? [current.points[0], p] : [...current.points, p];
  redraw();
});
const endStroke = () => {
  if (!current) return;
  project.strokes.push(current);
  current = null;
  redraw();
  save();
};
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

function undo() {
  if (project?.step !== 'sketch' || !project.strokes.length) return;
  project.strokes.pop();
  redraw();
  save();
}

// ---------- AI ----------

async function refreshAi() {
  const s = await studio.aiStatus();
  for (const el of $$('.ai-status')) {
    el.classList.toggle('ready', s.ready);
    el.querySelector('.ai-text').textContent = s.message;
  }
  return s;
}

async function generate() {
  const prompt = $('#prompt').value.trim();
  if (!prompt) {
    $('#prompt').focus();
    $('#prompt').placeholder = 'Type a few words first, e.g. rusty sci-fi crate';
    return;
  }
  project.prompt = prompt;
  project.name = prompt;
  const button = $('#generate');
  button.disabled = true;
  button.textContent = 'Making 4 concepts… (about a minute)';
  try {
    const res = await studio.generate(project.id, canvas.toDataURL('image/png'), prompt, project.style);
    if (res.error) {
      alert(res.error);
      return;
    }
    results = res.results;
    project.picked = null;
    goTo('pick');
  } finally {
    button.disabled = false;
    button.textContent = 'Make 4 concepts →';
  }
}

function renderResults() {
  $('#to-save').disabled = project.picked == null;
  $('#results').replaceChildren(...results.map((src, i) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = `Concept ${i + 1}`;
    img.tabIndex = 0;
    img.classList.toggle('picked', project.picked === i);
    img.onclick = img.onkeydown = (e) => {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      project.picked = i;
      renderResults();
      save();
    };
    return img;
  }));
}

// ---------- wiring ----------

$('#new-concept').onclick = newProject;
$('#another').onclick = newProject;
$('#go-home').onclick = openHome;
for (const b of $$('[data-go]')) b.onclick = () => goTo(b.dataset.go);
for (const b of $$('.ai-check')) b.onclick = refreshAi;
for (const b of $$('.tool')) b.onclick = () => { tool = b.dataset.tool; setChoice('.tool', 'tool', tool); };
for (const b of $$('.size')) b.onclick = () => { size = Number(b.dataset.size); setChoice('.size', 'size', size); };
for (const b of $$('.style')) b.onclick = () => { project.style = b.dataset.style; setChoice('.style', 'style', project.style); save(); };
for (const b of $$('.example')) b.onclick = () => { $('#prompt').value = b.textContent; };
$('#prompt').oninput = () => { project.prompt = $('#prompt').value; save(); };
$('#undo').onclick = undo;
$('#clear').onclick = () => {
  if (project.strokes.length && confirm('Clear the whole sketch? You can\'t undo this.')) {
    project.strokes = [];
    redraw();
    save();
  }
};
$('#generate').onclick = generate;
$('#again').onclick = () => { goTo('describe'); generate(); };
$('#export').onclick = async () => {
  const file = await studio.exportPng(project.id, project.picked, project.name);
  $('#exported').textContent = `Saved to ${file}`;
};
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undo();
  }
});

openHome();
