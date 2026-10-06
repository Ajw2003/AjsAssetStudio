const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  listProjects: () => ipcRenderer.invoke('projects:list'),
  loadProject: (id) => ipcRenderer.invoke('project:load', id),
  saveProject: (project, sketchDataUrl) => ipcRenderer.invoke('project:save', project, sketchDataUrl),
  aiStatus: () => ipcRenderer.invoke('ai:status'),
  generate: (id, sketchDataUrl, prompt, style) => ipcRenderer.invoke('ai:generate', id, sketchDataUrl, prompt, style),
  exportPng: (id, index, name) => ipcRenderer.invoke('export', id, index, name),
});
