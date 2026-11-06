/**
 * LocalPaint's own colour picker. The browser's <input type="color"> opens the Windows colour dialog, which only
 * reports the colour after OK, so nothing updates while you pick. This popover replaces it for every colour input:
 * it fires `input` events live while you drag (and `change` when it closes), so existing listeners keep working.
 */
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const hex2 = (n: number) => Math.round(clamp(n) * 255).toString(16).padStart(2, '0');
function hexToRgb(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
const rgbToHex = (r: number, g: number, b: number) => '#' + hex2(r) + hex2(g) + hex2(b);
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h * 60) + 360) % 360, mx ? d / mx : 0, mx];
}
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
}

let open: { close: (commit: boolean) => void } | null = null;

function openPicker(input: HTMLInputElement) {
  open?.close(true);
  const start = input.value;
  let [h, s, v] = rgbToHsv(...hexToRgb(start));
  const pop = document.createElement('div');
  pop.className = 'cpop';
  const sv = document.createElement('canvas'); sv.width = 200; sv.height = 140; sv.className = 'cpop-sv';
  const hue = document.createElement('canvas'); hue.width = 200; hue.height = 14; hue.className = 'cpop-hue';
  const row = document.createElement('div'); row.className = 'cpop-row';
  const was = document.createElement('span'); was.className = 'cpop-swatch'; was.style.background = start; was.title = 'Before (click to go back)';
  const now = document.createElement('span'); now.className = 'cpop-swatch';
  const hex = document.createElement('input'); hex.className = 'cpop-hex'; hex.spellcheck = false; hex.maxLength = 7;
  row.append(was, now, hex);
  pop.append(sv, hue, row);
  document.body.append(pop);

  const drawSV = () => {
    const g = sv.getContext('2d')!;
    const [r, gg, b] = hsvToRgb(h, 1, 1);
    g.fillStyle = rgbToHex(r, gg, b); g.fillRect(0, 0, sv.width, sv.height);
    const w = g.createLinearGradient(0, 0, sv.width, 0); w.addColorStop(0, '#fff'); w.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = w; g.fillRect(0, 0, sv.width, sv.height);
    const k = g.createLinearGradient(0, 0, 0, sv.height); k.addColorStop(0, 'rgba(0,0,0,0)'); k.addColorStop(1, '#000');
    g.fillStyle = k; g.fillRect(0, 0, sv.width, sv.height);
    const x = s * sv.width, y = (1 - v) * sv.height;
    g.lineWidth = 2; g.strokeStyle = v > 0.5 && s < 0.5 ? '#000' : '#fff';
    g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.stroke();
  };
  const drawHue = () => {
    const g = hue.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, hue.width, 0);
    for (let i = 0; i <= 6; i++) { const [r, gg, b] = hsvToRgb(i * 60, 1, 1); grd.addColorStop(i / 6, rgbToHex(r, gg, b)); }
    g.fillStyle = grd; g.fillRect(0, 0, hue.width, hue.height);
    const x = (h / 360) * hue.width;
    g.fillStyle = '#fff'; g.fillRect(x - 2, 0, 4, hue.height);
    g.strokeStyle = '#000'; g.strokeRect(x - 2.5, 0.5, 5, hue.height - 1);
  };
  const emit = (fromHex = false) => {
    const c = rgbToHex(...hsvToRgb(h, s, v));
    now.style.background = c;
    if (!fromHex) hex.value = c;
    if (input.value !== c) { input.value = c; input.dispatchEvent(new Event('input', { bubbles: true })); }
    drawSV(); drawHue();
  };
  const drag = (cv: HTMLCanvasElement, f: (x: number, y: number) => void) => {
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      const at = (ev: PointerEvent) => { const r = cv.getBoundingClientRect(); f(clamp((ev.clientX - r.left) / r.width), clamp((ev.clientY - r.top) / r.height)); emit(); };
      at(e);
      const move = (ev: PointerEvent) => at(ev);
      const up = () => { cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); };
      cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up);
    });
  };
  drag(sv, (x, y) => { s = x; v = 1 - y; });
  drag(hue, (x) => { h = Math.min(359.9, x * 360); });
  hex.addEventListener('input', () => {
    if (!/^#?[0-9a-f]{6}$/i.test(hex.value.trim())) return;
    [h, s, v] = rgbToHsv(...hexToRgb(hex.value)); emit(true);
  });
  was.addEventListener('click', () => { [h, s, v] = rgbToHsv(...hexToRgb(start)); emit(); });

  // Place it under the input (or above when there's no room), inside the window.
  const r = input.getBoundingClientRect(), pw = 216, ph = 210;
  let left = Math.min(window.innerWidth - pw - 8, Math.max(8, r.left));
  let top = r.bottom + 6; if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  Object.assign(pop.style, { left: `${left}px`, top: `${top}px` });

  const outside = (e: PointerEvent) => { if (!pop.contains(e.target as Node) && e.target !== input) close(true); };
  const key = (e: KeyboardEvent) => {
    // preventDefault: Enter on the focused colour input would "click" it and open the picker again.
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); [h, s, v] = rgbToHsv(...hexToRgb(start)); emit(); close(false); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(true); }
  };
  const close = (commit: boolean) => {
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('keydown', key, true);
    pop.remove(); open = null;
    if (commit && input.value !== start) input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  document.addEventListener('pointerdown', outside, true);
  window.addEventListener('keydown', key, true);
  open = { close };
  emit();
}

/** Route every colour input in the app to the live picker. */
export function installColorPopover() {
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (!(t instanceof HTMLInputElement) || t.type !== 'color' || t.disabled) return;
    e.preventDefault();
    if (open) { open.close(true); return; }
    openPicker(t);
  }, true);
}
