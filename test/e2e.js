// Drives the real Electron app through the whole Sketch → Save flow against a
// fake ComfyUI, then relaunches it to check the project was autosaved.
// Run: npm run e2e   (on Linux without a screen: xvfb-run npm run e2e)
const { _electron: electron } = require('playwright');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fake = require('./fake-comfy');

const shots = process.env.SHOTS_DIR ?? path.join(__dirname, 'screenshots');
fs.mkdirSync(shots, { recursive: true });
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));

async function launch() {
  // APP_EXE runs a packaged build instead of the source folder.
  const target = process.env.APP_EXE ? { executablePath: process.env.APP_EXE, args: ['--no-sandbox'] } : { args: [path.join(__dirname, '..'), '--no-sandbox'] };
  const app = await electron.launch({ ...target, env: { ...process.env, ASSET_STUDIO_HOME: home } });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewportSize({ width: 1400, height: 900 });
  return { app, page, errors };
}

async function draw(page, points, { shift = false } = {}) {
  const box = await page.locator('#canvas').boundingBox();
  const at = ([x, y]) => [box.x + x * box.width, box.y + y * box.height];
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(...at(points[0]));
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(...at(p), { steps: 8 });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}

(async () => {
  const { server } = await fake.start(8000);
  try {
    // ---- first run: full flow ----
    let { app, page, errors } = await launch();
    await page.getByText('AI ready').first().waitFor();
    await page.screenshot({ path: `${shots}/1-home.png` });

    await page.click('#new-concept');
    // A wobbly box with a lid, like someone drawing a crate with a mouse.
    await draw(page, [[0.3, 0.4], [0.31, 0.75], [0.7, 0.76], [0.69, 0.41], [0.3, 0.4]]);
    await draw(page, [[0.3, 0.4], [0.7, 0.4]], { shift: true });
    await draw(page, [[0.3, 0.55], [0.5, 0.58], [0.7, 0.55]]);
    await draw(page, [[0.1, 0.1], [0.2, 0.2]]);
    await page.click('#undo'); // removes the stray line
    await page.getByText('Saved', { exact: true }).waitFor();
    await page.screenshot({ path: `${shots}/2-sketch.png` });

    await page.click('text=Next: describe it');
    await page.click('text=rusty sci-fi crate');
    await page.screenshot({ path: `${shots}/3-describe.png` });

    await page.click('#generate');
    await page.locator('#results img').nth(3).waitFor();
    assert.equal(await page.locator('#results img').count(), 4);
    assert.ok(await page.locator('#to-save').isDisabled(), 'cannot continue before picking');
    await page.locator('#results img').nth(1).click();
    await page.screenshot({ path: `${shots}/4-pick.png` });

    await page.click('#to-save');
    await page.click('#export');
    await page.locator('#exported').filter({ hasText: 'Saved to' }).waitFor();
    await page.screenshot({ path: `${shots}/5-save.png` });
    const exported = fs.readdirSync(path.join(home, 'Concepts'));
    assert.equal(exported.length, 1);
    assert.match(exported[0], /^rusty sci-fi crate .*\.png$/);
    await page.waitForTimeout(600); // let the last autosave land
    assert.deepEqual(errors, []);
    await app.close();

    // ---- second run: the project is still there ----
    ({ app, page, errors } = await launch());
    await page.locator('.card').first().waitFor();
    assert.equal(await page.locator('.card').count(), 1);
    assert.equal(await page.locator('.card span').textContent(), 'rusty sci-fi crate');
    await page.screenshot({ path: `${shots}/6-home-again.png` });
    await page.locator('.card').click();
    assert.ok(await page.locator('#final').isVisible(), 'reopens on the Save step with the picked concept');
    const project = JSON.parse(fs.readFileSync(path.join(home, 'AjsAssetStudio/Projects', fs.readdirSync(path.join(home, 'AjsAssetStudio/Projects'))[0], 'project.json'), 'utf8'));
    assert.equal(project.strokes.length, 3, 'undo removed the stray stroke');
    assert.equal(project.picked, 1);
    assert.deepEqual(errors, []);
    await app.close();
    console.log(`E2E passed. Screenshots in ${shots}`);
  } finally {
    server.close();
    fs.rmSync(home, { recursive: true, force: true });
  }
})().catch((err) => { console.error(err); process.exit(1); });
