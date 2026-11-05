import type { ProjectFile } from './Project';

/** A rejected file, with an explanation that can be shown without a stack trace. */
export class NotProjectError extends Error {
  title: string;
  constructor(title: string, message: string) {
    super(message);
    this.name = 'NotProjectError';
    this.title = title;
  }
}

export function checkProjectFileName(name: string): void {
  if (/\.spp$/i.test(name)) {
    throw new NotProjectError('Substance Painter projects are not supported',
      'LocalPaint cannot open .spp projects directly. Open the project in Substance Painter and export its textures. Then open the original model in LocalPaint and import the exported textures. Use File > Import for .sbsar materials and .spsm smart materials.');
  }
}

const record = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export async function parseProject(text: string): Promise<ProjectFile> {
  const head = text.slice(0, 16);
  if (/^\uFFFD?HDF\r\n\x1a\n/.test(head)) {
    throw new NotProjectError('This is a binary HDF5 file',
      'This file is not a LocalPaint project, even if it was renamed to .lp. If it is a Substance Painter .spp project, export its textures from Painter, then open the original model and import those textures in LocalPaint. For .spsm smart materials, use File > Import.');
  }
  if (/^PK(?:\x03\x04|\x05\x06|\x07\x08)/.test(head)) {
    throw new NotProjectError('This is a ZIP archive',
      'Extract it first, then open the .lp project inside it. Use File > Import for models, textures or Substance materials.');
  }
  let f: unknown;
  try { f = JSON.parse(text.replace(/^\uFEFF/, '')); } catch {
    throw new NotProjectError('This is not a LocalPaint project',
      'LocalPaint projects are .lp files saved with File > Save. To bring in a model, textures or Substance materials, use File > Import (Ctrl+I).');
  }
  if (!record(f) || f.format !== 'texpaint-project') {
    throw new NotProjectError('This is not a LocalPaint project',
      'This file does not contain a LocalPaint project. Use a .lp file saved by LocalPaint (older .lmp and .tpaint files work too).');
  }
  if (![1, 2, 3].includes(f.version)) {
    throw new NotProjectError('Unsupported project version',
      'This project uses an unsupported file version. Check for a newer LocalPaint release before opening it.');
  }
  const model = f.model;
  const validModel = record(model) && (
    (model.kind === 'builtin' && ['box', 'vase', 'sphere', 'knot'].includes(model.id)) ||
    (model.kind === 'file' && typeof model.name === 'string' && typeof model.data === 'string')
  );
  if (!validModel || !Array.isArray(f.layers) ||
      !Number.isInteger(f.resolution) || f.resolution <= 0 ||
      !Number.isInteger(f.activeIndex) || typeof f.name !== 'string') {
    throw new NotProjectError('This project is incomplete or damaged',
      'The project is missing required model, layer or size information. Try an autosave or another copy of the project.');
  }
  return f as unknown as ProjectFile;
}
