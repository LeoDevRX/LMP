// Bridge between LMP.html and the app: presets folder, .lmp project files, importing files.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('texpaintNative', {
  isApp: true,
  listPresets: () => ipcRenderer.invoke('presets:list'),
  readPreset: (p) => ipcRenderer.invoke('presets:read', p),
  writePreset: (name, data) => ipcRenderer.invoke('presets:write', name, data),
  openPresetsFolder: () => ipcRenderer.invoke('presets:open'),
  saveProject: (name, data, filePath, saveAs) => ipcRenderer.invoke('project:save', name, data, filePath, saveAs),
  openProject: () => ipcRenderer.invoke('project:open'),
  readProject: (p) => ipcRenderer.invoke('project:read', p),
  importFiles: () => ipcRenderer.invoke('file:import'),
  onOpenPath: (cb) => ipcRenderer.on('project:open-path', (_e, p) => cb(p)),
  onCloseRequest: (cb) => ipcRenderer.on('app:close-request', () => cb()),
  ackClose: () => ipcRenderer.send('app:close-ack'),
  quit: () => ipcRenderer.send('app:quit'),
  autosaveWrite: (name, data, thumb, projectPath, keep) => ipcRenderer.invoke('autosave:write', name, data, thumb, projectPath, keep),
  autosaveList: () => ipcRenderer.invoke('autosave:list'),
  autosaveFolder: () => ipcRenderer.invoke('autosave:open-folder'),
  sessionStart: () => ipcRenderer.invoke('session:start'),
  recentList: () => ipcRenderer.invoke('recent:list'),
  recentAdd: (p, name, thumb) => ipcRenderer.invoke('recent:add', p, name, thumb),
  recentRemove: (p) => ipcRenderer.invoke('recent:remove', p),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  openUrl: (url) => ipcRenderer.invoke('shell:open', url),
});
