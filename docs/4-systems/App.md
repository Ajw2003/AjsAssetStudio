# App structure

Plain HTML/CSS/JS in Electron. No build step.

| File | Job |
|---|---|
| `main.js` | Electron main process: window, saving/loading projects on disk, export, forwards AI calls. |
| `preload.js` | The only bridge the page can use (`window.studio`). |
| `comfy.js` | Talks to ComfyUI over HTTP: finds the server, picks models, builds the workflow graph, uploads the sketch, polls for results. Runs in the main process so ComfyUI needs no CORS flag. |
| `index.html`, `app.js`, `style.css` | The guided screens: Home, then Sketch → Describe → Pick → Save. |

## The AI graph (`comfy.js` `buildGraph`)

SDXL checkpoint → text prompts → sketch loaded and inverted (scribble ControlNets want white lines on black) → ControlNet (strength 0.75, ends at 85%) → 4 images at 1024×1024, 25 steps.

## Saving

Each project is a folder `Documents/AjsAssetStudio/Projects/<id>/` holding `project.json` (strokes, prompt, style, picked, step), `sketch.png`, and `result-N.png`. Writes go to a temp file then rename, so a crash can't leave half a file.
