// Tiny DOM helpers for the panels.

type Attrs = Record<string, any>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Attrs = {}, ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in e && k !== 'list') (e as any)[k] = v;
    else e.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) e.append(c as any);
  return e;
}

export function section(title: string, ...children: (Node | null | false)[]) {
  return el('div', { class: 'section' }, el('h3', {}, title), ...children);
}

export interface SliderOpts {
  min: number; max: number; step: number; value: number;
  fmt?: (v: number) => string;
  onInput: (v: number) => void;
  check?: { value: boolean; onChange: (v: boolean) => void };
}

export function slider(label: string, o: SliderOpts) {
  const fmt = o.fmt ?? ((v: number) => v.toFixed(2));
  const input = el('input', { type: 'range', min: o.min, max: o.max, step: o.step }) as HTMLInputElement;
  const val = el('span', { class: 'val' });
  const paint = () => {
    const p = ((+input.value - o.min) / (o.max - o.min)) * 100;
    input.style.setProperty('--p', `${p}%`);
    val.textContent = fmt(+input.value);
  };
  const set = (v: number) => { input.value = String(v); paint(); };
  set(o.value);
  input.addEventListener('input', () => { paint(); o.onInput(+input.value); });
  const root = el('div', { class: 'slider' + (o.check ? ' check' : '') });
  let box: HTMLInputElement | null = null;
  if (o.check) {
    box = el('input', { type: 'checkbox', checked: o.check.value }) as HTMLInputElement;
    const sync = () => { input.disabled = !box!.checked; root.classList.toggle('dim', !box!.checked); };
    box.addEventListener('change', () => { sync(); o.check!.onChange(box!.checked); });
    sync();
    root.append(box);
  }
  root.append(el('label', { title: label }, label), input, val);
  return { el: root, set, input };
}

export function select<T extends string | number>(
  options: { value: T; label: string }[], value: T, onChange: (v: T) => void,
) {
  const s = el('select') as HTMLSelectElement;
  for (const o of options) s.append(el('option', { value: String(o.value) }, o.label));
  s.value = String(value);
  s.addEventListener('change', () => {
    const o = options.find((x) => String(x.value) === s.value)!;
    onChange(o.value);
  });
  return s;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function rgbToHex(c: [number, number, number]) {
  return '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
}

let toastTimer = 0;
export function toast(msg: string, warn = false) {
  const t = document.getElementById('toast')!;
  t.textContent = msg;
  t.className = 'show' + (warn ? ' warn' : '');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.className = warn ? 'warn' : ''), warn ? 3200 : 2200);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((res) => {
    const i = el('input', { type: 'file', accept }) as HTMLInputElement;
    i.addEventListener('change', () => res(i.files?.[0] ?? null));
    i.click();
  });
}

export function pickFiles(accept: string): Promise<File[]> {
  return new Promise((res) => {
    const i = el('input', { type: 'file', accept, multiple: true }) as HTMLInputElement;
    i.addEventListener('change', () => res([...(i.files ?? [])]));
    i.click();
  });
}

export const ICON = {
  eye: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/></svg>',
  brush: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 2l4 4-11 11-4-4z"/><path d="M7 13c-3 0-4 2-4 4s-1 3-2 4c4 0 9 0 9-5"/></svg>',
  up: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  down: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  trash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/></svg>',
  undo: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  redo: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/></svg>',
};

const sv = (d: string, w = 18) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICON2 = {
  paint: sv('<path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L11 15.8 8.2 13z"/><path d="M8 14c-2.5 0-4 1.6-4 3.6 0 1.4-.8 2.2-2 2.4 1.2 1.1 3 1.5 4.6 1.5 2.6 0 4.4-1.8 4.4-4.2"/>'),
  erase: sv('<path d="M7 21h13"/><path d="M5.6 15.4 14.8 6.2a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 19H8.4z"/><path d="m9 11 5 5"/>'),
  smudge: sv('<path d="M8 13V4.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11.5v-2a1.5 1.5 0 0 1 3 0V12"/><path d="M14 10.5a1.5 1.5 0 0 1 3 0V12"/><path d="M17 11.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-2a6 6 0 0 1-4.6-2.2L4.6 16a1.6 1.6 0 0 1 2.4-2l1 1"/>'),
  clone: sv('<path d="M5 22h14"/><path d="M19 15H5a2 2 0 0 0-2 2v2h18v-2a2 2 0 0 0-2-2z"/><path d="M14 15V9.5a3 3 0 1 0-4 0V15"/>'),
  blur: sv('<path d="M12 2.7 6.3 8.4a8 8 0 1 0 11.4 0z"/><path d="M8.5 14a3.5 3.5 0 0 0 3.5 3.5"/>'),
  picker: sv('<path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3z"/>'),
  mask: sv('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 21 21 3" /><path d="M12 21h7a2 2 0 0 0 2-2v-7" fill="currentColor" stroke="none" opacity=".6"/>'),
  history: sv('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>'),
  guide: sv('<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5V4.5"/><path d="M9 7h7M9 11h5"/>', 15),
  settings: sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  layerPaint: sv('<path d="M12 3 2 8l10 5 10-5z"/><path d="m2 16 10 5 10-5"/><path d="M17 11v6M14 14h6"/>'),
  layerFill: sv('<path d="m19 11-8-8-8.5 8.5a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 2-4 2-4s2 2.4 2 4z"/>'),
  addMask: sv('<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M3 17 17 3"/><path d="M19 14v6M16 17h6"/>'),
  up: sv('<path d="M12 19V5M5 12l7-7 7 7"/>', 16),
  down: sv('<path d="M12 5v14M5 12l7 7 7-7"/>', 16),
  trash: sv('<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>', 16),
  export: sv('<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>'),
  tsSettings: sv('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/>'),
  display: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  bake: sv('<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 3v3M12 3v3M17 3v3"/><circle cx="12" cy="15" r="2.5"/>'),
  help: sv('<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5"/><path d="M12 17.5h.01"/>'),
  split: sv('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 4v16"/>', 16),
  cube: sv('<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>', 16),
  square: sv('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18" opacity=".55"/>', 16),
  wire: sv('<path d="M3 3h18v18H3z"/><path d="m3 3 18 18M21 3 3 21"/>', 16),
  overlap: sv('<path d="M3 3h12v12H3z"/><path d="M9 9h12v12H9z"/><path d="M9 9h6v6H9z" fill="currentColor" stroke="none"/>', 16),
  frame: sv('<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><circle cx="12" cy="12" r="3"/>', 16),
  folder: sv('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', 16),
  refresh: sv('<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>', 16),
  save: sv('<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8M7 21v-7h10v7"/>', 16),
  smart: sv('<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>', 16),
  search: sv('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>', 15),
  close: sv('<path d="M18 6 6 18M6 6l12 12"/>', 15),
  polyfill: sv('<path d="M3 20 9 4l6 10 6-6v12z"/><path d="M3 20h18" />'),
  path: sv('<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="12" r="1.5"/><path d="M6.5 16.5C9 14 10 13 11 12.5M13 11.5c1.5-.8 3-2.2 4.6-4"/>'),
  folder2: sv('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/>'),
  caretR: sv('<path d="m9 6 6 6-6 6"/>', 14),
  caretD: sv('<path d="m6 9 6 6 6-6"/>', 14),
  eye: ICON.eye, eyeOff: ICON.eyeOff, brush: ICON.brush, undo: ICON.undo, redo: ICON.redo,
};

export function iconBtn(svg: string, title: string, onClick: () => void) {
  const b = el('button', { class: 'icon', title, onclick: onClick });
  b.innerHTML = svg;
  return b;
}
