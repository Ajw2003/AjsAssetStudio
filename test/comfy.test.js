const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const comfy = require('../comfy');
const fake = require('./fake-comfy');

test('status says the AI is not running when nothing listens', async () => {
  const s = await comfy.status();
  assert.equal(s.ready, false);
  assert.match(s.message, /isn't running/);
});

test('status names the missing scribble model', async () => {
  const { server } = await fake.start(8188, { controlnets: ['depth.safetensors'] });
  try {
    const s = await comfy.status();
    assert.equal(s.ready, false);
    assert.match(s.message, /scribble/);
  } finally { server.close(); }
});

test('generate uploads the sketch and returns 4 images', async () => {
  const { server, jobs } = await fake.start(8188, { checkpoints: ['sd15.safetensors', 'juggernautXL.safetensors'] });
  try {
    const png = fs.readFileSync(path.join(__dirname, 'sketch-sample.png'));
    const images = await comfy.generate({ sketchPng: png, prompt: 'rusty crate', style: 'prop', seed: 1 });
    assert.equal(images.length, 4);
    assert.ok(images[0].equals(png), 'image round-trips through the server');
    const graph = jobs.job0.graph;
    assert.equal(graph[1].inputs.ckpt_name, 'juggernautXL.safetensors', 'prefers an SDXL checkpoint');
    assert.match(graph[2].inputs.text, /^rusty crate, game asset/);
  } finally { server.close(); }
});
