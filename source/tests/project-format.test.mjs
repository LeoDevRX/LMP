import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { checkProjectFileName, NotProjectError, parseProject } from '../src/engine/ProjectFormat.ts';

const project = (version = 3) => ({
  format: 'texpaint-project', version, name: 'Regression sample', resolution: 512,
  model: { kind: 'builtin', id: 'box' }, activeIndex: -1, layers: [],
});
const rejected = (title) => (e) => {
  assert.ok(e instanceof NotProjectError);
  assert.equal(e.name, 'NotProjectError');
  assert.match(e.title, title);
  assert.ok(e.message.length > 30);
  assert.doesNotMatch(e.message, /Unexpected token|Cannot read properties/);
  return true;
};

test('Substance project filenames are rejected before loading their contents', () => {
  for (const name of ['sample.spp', 'D:\\Art\\MY PROJECT.SPP', '/art/model.spp']) {
    assert.throws(() => checkProjectFileName(name), rejected(/Substance Painter/));
  }
  for (const name of ['sample.lmp', 'old.tpaint', 'material.sbsar', 'smart.spsm']) {
    assert.doesNotThrow(() => checkProjectFileName(name));
  }
});

test('the screenshot HDF5 signature receives an explanation even when renamed .lmp', async () => {
  const bytes = Uint8Array.of(0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
  await assert.rejects(parseProject(new TextDecoder().decode(bytes)), rejected(/HDF5/));
});

test('ZIP archives receive extraction guidance', async () => {
  for (const signature of ['PK\x03\x04', 'PK\x05\x06', 'PK\x07\x08']) {
    await assert.rejects(parseProject(signature), rejected(/ZIP/));
  }
});

test('legacy and current LocalPaint projects remain readable, including a UTF-8 BOM', async () => {
  for (const version of [1, 2, 3]) {
    const sample = project(version);
    assert.deepEqual(await parseProject(JSON.stringify(sample)), sample);
    assert.deepEqual(await parseProject('\uFEFF' + JSON.stringify(sample)), sample);
  }
  const embedded = { ...project(), model: { kind: 'file', name: 'mesh.obj', data: 'bWVzaA==' } };
  assert.deepEqual(await parseProject(JSON.stringify(embedded)), embedded);
});

test('unrelated JSON and corrupt text fail without null dereferences or raw JSON errors', async () => {
  for (const text of ['null', '[]', '42', '"hello"', '{}', '', '{"format":', 'not JSON']) {
    await assert.rejects(parseProject(text), rejected(/not a LocalPaint/));
  }
});

test('incomplete project headers fail before the active model is replaced', async () => {
  for (const patch of [
    { model: null }, { model: { kind: 'builtin', id: 'missing' } },
    { model: { kind: 'file', name: 'mesh.obj' } }, { layers: null },
    { resolution: 0 }, { resolution: 1.5 }, { activeIndex: null }, { name: null },
  ]) {
    await assert.rejects(parseProject(JSON.stringify({ ...project(), ...patch })), rejected(/damaged/));
  }
  await assert.rejects(parseProject(JSON.stringify(project(4))), rejected(/version/));
});

test('all published download and ownership links use the existing repository', async () => {
  for (const relative of ['../../README.md', '../README.md', '../src/guide.ts', '../desktop/main.js']) {
    const text = await readFile(new URL(relative, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /github\.com\/LeoDevRX\/LocalPaint\b/);
  }
});
