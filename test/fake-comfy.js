// A stand-in for ComfyUI's HTTP API, enough to drive comfy.js end to end.
// It returns the uploaded sketch as every "generated" image.
const http = require('node:http');

function start(port, { checkpoints = ['sd_xl_base_1.0.safetensors'], controlnets = ['controlnet-scribble-sdxl.safetensors'] } = {}) {
  let uploaded = null;
  const jobs = {};
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const url = new URL(req.url, 'http://x');
    const json = (obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

    if (url.pathname === '/system_stats') return json({ system: {} });
    if (url.pathname === '/object_info/CheckpointLoaderSimple') return json({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [checkpoints] } } } });
    if (url.pathname === '/object_info/ControlNetLoader') return json({ ControlNetLoader: { input: { required: { control_net_name: [controlnets] } } } });
    if (url.pathname === '/upload/image') {
      // Pull the PNG out of the multipart body by its signature and IEND trailer.
      const start = body.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      const end = body.indexOf(Buffer.from('IEND')) + 8;
      uploaded = body.subarray(start, end);
      return json({ name: 'sketch.png', subfolder: '', type: 'input' });
    }
    if (url.pathname === '/prompt') {
      const graph = JSON.parse(body).prompt;
      // Every link must point at a node that exists, like real ComfyUI checks.
      for (const node of Object.values(graph)) {
        for (const v of Object.values(node.inputs)) {
          if (Array.isArray(v) && !graph[v[0]]) return json({ error: `missing node ${v[0]}` }, 400);
        }
      }
      if (graph[4].inputs.image !== 'sketch.png' || !uploaded) return json({ error: 'sketch not uploaded' }, 400);
      const id = `job${Object.keys(jobs).length}`;
      const count = graph[8].inputs.batch_size;
      jobs[id] = { graph, readyAt: Date.now() + 300, count };
      return json({ prompt_id: id });
    }
    if (url.pathname.startsWith('/history/')) {
      const id = url.pathname.split('/')[2];
      const job = jobs[id];
      if (!job || Date.now() < job.readyAt) return json({});
      const images = Array.from({ length: job.count }, (_, i) => ({ filename: `out_${i}.png`, subfolder: '', type: 'output' }));
      return json({ [id]: { status: { status_str: 'success' }, outputs: { 11: { images } } } });
    }
    if (url.pathname === '/view') { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(uploaded); }
    json({ error: 'not found' }, 404);
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r({ server, jobs })));
}

module.exports = { start };
