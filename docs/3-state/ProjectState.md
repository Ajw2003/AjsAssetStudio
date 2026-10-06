# Project state

Updated 2026-10-06.

## Works (tested in the cloud on Linux with a fake ComfyUI)

- Home screen with recent concepts and an AI-ready light (`app.js` `openHome`).
- Sketch with smoothed strokes, eraser, three sizes, undo (button and Ctrl+Z), Shift for straight lines, clear with confirm.
- Describe with example prompts and Prop / Character / Place styles.
- Generate 4 concepts through ComfyUI (`comfy.js` `generate`), pick one, try again.
- Autosave of every change; reopening a project returns to the same step.
- Export PNG to `Documents\Concepts`.

Evidence: `npm test` (3 passing) and `npm run e2e` (full flow plus relaunch) both pass.

## Not yet verified

- Never run against a real ComfyUI with real models.
- Windows installer: `.github/workflows/build.yml` builds it on a Windows machine, runs `npm run e2e` against the packaged app (`APP_EXE`), and publishes a GitHub Release on each merge to main. Check the latest Actions run for whether it passed.
