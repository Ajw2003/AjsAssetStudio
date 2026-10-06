# Ajs Asset Studio

Turn a rough scribble into game-asset concept art, one step at a time:
**Sketch → Describe → Pick → Save.** Everything autosaves.

The AI runs on your own PC through [ComfyUI](https://www.comfy.org/). The app finds it by itself
on port 8000 (ComfyUI Desktop) or 8188 (manual install) and picks the installed SDXL model and
scribble ControlNet, so you never type file names.

## Where things are saved

- Projects: `Documents\AjsAssetStudio\Projects`
- Exported pictures: `Documents\Concepts`

## For developers

```
npm install
npm start          # run the app
npm test           # AI connection tests against a fake ComfyUI
npm run e2e        # drives the real app through the whole flow (Linux: xvfb-run npm run e2e)
```

More: [docs/1-landing/README.md](docs/1-landing/README.md)
