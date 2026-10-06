// Talks to ComfyUI, the local AI server. Runs in Electron's main process so
// ComfyUI needs no special CORS setting.

// ComfyUI Desktop listens on 8000, the portable/manual install on 8188.
const PORTS = [8000, 8188];

const STYLES = {
  prop: 'game asset concept art, single prop, centered, clean background, detailed, painterly',
  character: 'game character concept art, full body, neutral pose, clean background, detailed, painterly',
  environment: 'game environment concept art, wide shot, atmospheric lighting, detailed, painterly',
};
const NEGATIVE = 'blurry, low quality, text, watermark, signature, deformed';

async function findServer() {
  for (const port of PORTS) {
    const base = `http://127.0.0.1:${port}`;
    try {
      const res = await fetch(`${base}/system_stats`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return base;
    } catch {
      // not on this port, try the next
    }
  }
  return null;
}

// Picks an installed SDXL checkpoint and a scribble ControlNet, so the user
// never has to type model file names.
async function findModels(base) {
  const info = await (await fetch(`${base}/object_info/CheckpointLoaderSimple`)).json();
  const cn = await (await fetch(`${base}/object_info/ControlNetLoader`)).json();
  const checkpoints = info.CheckpointLoaderSimple.input.required.ckpt_name[0];
  const controlnets = cn.ControlNetLoader.input.required.control_net_name[0];
  const pick = (list, words) => list.find((n) => words.some((w) => n.toLowerCase().includes(w)));
  return {
    checkpoint: pick(checkpoints, ['xl']) ?? checkpoints[0] ?? null,
    controlnet: pick(controlnets, ['scribble', 'union']) ?? null,
  };
}

/** Plain-words status for the app's "AI ready?" light. */
async function status() {
  const base = await findServer();
  if (!base) return { ready: false, message: 'The AI isn\'t running. Open ComfyUI, then press Check again.' };
  const models = await findModels(base);
  if (!models.checkpoint) return { ready: false, message: 'ComfyUI is running but has no image model yet.' };
  if (!models.controlnet) return { ready: false, message: 'ComfyUI needs the scribble guide model (ControlNet scribble).' };
  return { ready: true, message: 'AI ready', base, models };
}

function buildGraph({ sketchName, prompt, style, models, seed, count }) {
  const text = `${prompt}, ${STYLES[style] ?? STYLES.prop}`;
  return {
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: models.checkpoint } },
    2: { class_type: 'CLIPTextEncode', inputs: { text, clip: ['1', 1] } },
    3: { class_type: 'CLIPTextEncode', inputs: { text: NEGATIVE, clip: ['1', 1] } },
    4: { class_type: 'LoadImage', inputs: { image: sketchName } },
    // Scribble ControlNets expect white lines on black; the canvas is black on white.
    5: { class_type: 'ImageInvert', inputs: { image: ['4', 0] } },
    6: { class_type: 'ControlNetLoader', inputs: { control_net_name: models.controlnet } },
    7: {
      class_type: 'ControlNetApplyAdvanced',
      inputs: { positive: ['2', 0], negative: ['3', 0], control_net: ['6', 0], image: ['5', 0], strength: 0.75, start_percent: 0, end_percent: 0.85 },
    },
    8: { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024, batch_size: count } },
    9: {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0], positive: ['7', 0], negative: ['7', 1], latent_image: ['8', 0],
        seed, steps: 25, cfg: 6, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1,
      },
    },
    10: { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['1', 2] } },
    11: { class_type: 'SaveImage', inputs: { images: ['10', 0], filename_prefix: 'AjsAssetStudio' } },
  };
}

/**
 * Turns a sketch PNG into `count` concept images.
 * Returns an array of PNG Buffers. Throws an Error with a plain-words message.
 */
async function generate({ sketchPng, prompt, style, count = 4, seed = Math.floor(Math.random() * 2 ** 31) }) {
  const s = await status();
  if (!s.ready) throw new Error(s.message);

  const form = new FormData();
  form.append('image', new Blob([sketchPng], { type: 'image/png' }), 'sketch.png');
  form.append('overwrite', 'true');
  const upload = await (await fetch(`${s.base}/upload/image`, { method: 'POST', body: form })).json();

  const graph = buildGraph({ sketchName: upload.name, prompt, style, models: s.models, seed, count });
  const queued = await fetch(`${s.base}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: graph }) });
  if (!queued.ok) throw new Error(`ComfyUI refused the job: ${await queued.text()}`);
  const { prompt_id } = await queued.json();

  // ponytail: polls history every second; switch to ComfyUI's websocket if progress bars are wanted
  for (let i = 0; i < 600; i++) {
    const history = await (await fetch(`${s.base}/history/${prompt_id}`)).json();
    const job = history[prompt_id];
    if (job?.status?.status_str === 'error') throw new Error('The AI hit an error while making the pictures. Check the ComfyUI window.');
    const images = job?.outputs?.['11']?.images;
    if (images) {
      return Promise.all(images.map(async (img) => {
        const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
        return Buffer.from(await (await fetch(`${s.base}/view?${q}`)).arrayBuffer());
      }));
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('The AI took longer than 10 minutes. Check the ComfyUI window.');
}

module.exports = { status, generate, buildGraph, PORTS };
