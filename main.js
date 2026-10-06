const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const comfy = require('./comfy');

// Everything the app saves lives under Documents so it's easy to find.
// ASSET_STUDIO_HOME overrides it for tests.
const documents = () => process.env.ASSET_STUDIO_HOME ?? app.getPath('documents');
const projectsDir = () => path.join(documents(), 'AjsAssetStudio', 'Projects');
const exportDir = () => path.join(documents(), 'Concepts');

// Project ids come from the renderer; keep them to safe folder names.
function projectDir(id) {
  if (!/^[\w-]+$/.test(id)) throw new Error(`Bad project id: ${id}`);
  return path.join(projectsDir(), id);
}
const toDataUrl = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
const fromDataUrl = (url) => Buffer.from(url.split(',')[1], 'base64');
const resultFiles = (dir) => fs.readdirSync(dir).filter((f) => /^result-\d+\.png$/.test(f)).sort();

// Write to a temp file then rename, so a crash mid-save never leaves a broken project.
function writeSafely(file, content) {
  fs.writeFileSync(`${file}.tmp`, content);
  fs.renameSync(`${file}.tmp`, file);
}

ipcMain.handle('projects:list', () => {
  if (!fs.existsSync(projectsDir())) return [];
  return fs.readdirSync(projectsDir())
    .map((id) => {
      try {
        const dir = projectDir(id);
        const project = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
        const results = resultFiles(dir);
        const thumbFile = results[project.picked] ?? 'sketch.png';
        const thumb = fs.existsSync(path.join(dir, thumbFile)) ? toDataUrl(path.join(dir, thumbFile)) : null;
        return { ...project, thumb };
      } catch (err) {
        console.error(`Skipping unreadable project ${id}:`, err);
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.updated - a.updated);
});

ipcMain.handle('project:load', (_e, id) => {
  const dir = projectDir(id);
  const project = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
  return { project, results: resultFiles(dir).map((f) => toDataUrl(path.join(dir, f))) };
});

ipcMain.handle('project:save', (_e, project, sketchDataUrl) => {
  const dir = projectDir(project.id);
  fs.mkdirSync(dir, { recursive: true });
  writeSafely(path.join(dir, 'project.json'), JSON.stringify({ ...project, updated: Date.now() }));
  if (sketchDataUrl) writeSafely(path.join(dir, 'sketch.png'), fromDataUrl(sketchDataUrl));
});

ipcMain.handle('ai:status', async () => {
  const { ready, message } = await comfy.status();
  return { ready, message };
});

ipcMain.handle('ai:generate', async (_e, id, sketchDataUrl, prompt, style) => {
  try {
    const images = await comfy.generate({ sketchPng: fromDataUrl(sketchDataUrl), prompt, style });
    const dir = projectDir(id);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of resultFiles(dir)) fs.unlinkSync(path.join(dir, f));
    images.forEach((png, i) => fs.writeFileSync(path.join(dir, `result-${i}.png`), png));
    return { results: images.map((png) => `data:image/png;base64,${png.toString('base64')}`) };
  } catch (err) {
    console.error('Generate failed:', err);
    return { error: err.message };
  }
});

ipcMain.handle('export', (_e, id, index, name) => {
  const source = path.join(projectDir(id), `result-${index}.png`);
  fs.mkdirSync(exportDir(), { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const safeName = (name || 'concept').replace(/[^\w -]/g, '').trim().slice(0, 40) || 'concept';
  const target = path.join(exportDir(), `${safeName} ${stamp}.png`);
  fs.copyFileSync(source, target);
  if (!process.env.ASSET_STUDIO_HOME) shell.showItemInFolder(target);
  return target;
});

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#1e1f24',
    title: 'Ajs Asset Studio',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile('index.html');
});

app.on('window-all-closed', () => app.quit());
