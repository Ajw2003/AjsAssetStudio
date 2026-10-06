# Decisions

## 2026-10-06: build our own app instead of a focus mode over Krita/Blender
ajw03 asked for something specialised for the game-dev pipeline. Heavy parts are borrowed: ComfyUI (AI), perfect-freehand (strokes), three.js later (3D).

## 2026-10-06: plain JavaScript, not TypeScript
The plan said TypeScript. Version 1 is small enough that a build step costs more than it saves. Revisit if the code grows past a few files per screen.

## 2026-10-06: models are found, not configured
The app picks an installed SDXL checkpoint and a ControlNet whose name contains "scribble" or "union", so the user never types a model file name.
