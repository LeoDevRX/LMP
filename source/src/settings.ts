/** LMP settings (File → Settings), kept between sessions. */
export interface Settings {
  autosave: boolean;
  autosaveMinutes: number;
  autosaveKeep: number;
  /** Texture size for new files. */
  defaultSize: number;
  /** Viewport render scale (1 = sharp on high-DPI screens costs more). */
  pixelRatio: number;
  historyLimit: number;
  /** Low performance mode: smaller textures and previews, lighter bakes, lower render scale. */
  lowPerf: boolean;
  /** The weak-computer question was answered. */
  perfAsked: boolean;
  /** Guide shown once on first start. */
  welcomed: boolean;
  /** Show the start screen when LMP opens. */
  startScreen: boolean;
  /** Ask GitHub for a newer LMP when it starts. */
  checkUpdates: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  autosave: true, autosaveMinutes: 3, autosaveKeep: 5, defaultSize: 1024, pixelRatio: 0, historyLimit: 25,
  lowPerf: false, perfAsked: false, welcomed: false, startScreen: true, checkUpdates: true,
};

const KEY = 'lmp-settings';
export function loadSettings(): Settings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

/** Rough check for a weak computer: software rendering, old integrated GPUs, few cores or little RAM, or a slow GPU test. */
export function weakComputer(gl: WebGL2RenderingContext | WebGLRenderingContext): { weak: boolean; why: string[] } {
  const why: string[] = [];
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    if (/swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(r)) why.push('no graphics card acceleration (software rendering)');
    else if (/intel\(r\) (hd|uhd) graphics( \d{3,4})?\b/i.test(r) && !/iris|arc|xe/i.test(r)) why.push('an older integrated Intel graphics chip');
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    if (maxTex < 8192) why.push('a small graphics texture limit');
  } catch { /* ignore */ }
  const cores = navigator.hardwareConcurrency || 4;
  if (cores <= 2) why.push(`only ${cores} CPU cores`);
  const mem = (navigator as any).deviceMemory as number | undefined;
  if (mem && mem <= 4) why.push(`about ${mem} GB of memory`);
  return { weak: why.length > 0, why };
}
