import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const main = readFileSync(new URL('../desktop/main.js', import.meta.url), 'utf8');

function desktop(selected, canceled = false) {
  const handlers = new Map();
  const reads = [];
  const recent = [];
  const electron = {
    app: {
      commandLine: { appendSwitch() {} }, on() {}, getPath: () => 'test-data', setPath() {},
      requestSingleInstanceLock: () => false, quit() {}, addRecentDocument: (p) => recent.push(p),
    },
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    BrowserWindow: { fromWebContents: () => null },
    dialog: { showOpenDialog: async () => ({ canceled, filePaths: selected }) },
  };
  const fs = {
    existsSync: () => true,
    readFileSync: (p) => { reads.push(p); return Buffer.from('sample data'); },
  };
  vm.runInNewContext(main, {
    require: (name) => name === 'electron' ? electron : name === 'fs' ? fs : require(name),
    process, Buffer, console, __dirname: path.resolve('desktop'),
  });
  return { call: (name, ...args) => handlers.get(name)({ sender: {} }, ...args), reads, recent };
}

test('Open returns the selected path without reading an accidentally selected Substance project', async () => {
  const app = desktop(['D:\\Art\\huge.spp']);
  const result = await app.call('project:open');
  assert.equal(result.path, 'D:\\Art\\huge.spp');
  assert.equal(result.data, undefined);
  assert.deepEqual(app.reads, []);
  assert.deepEqual(app.recent, []);
});

test('Import does not read .spp contents but still reads other assets in the selection', async () => {
  const app = desktop(['large.SPP', 'model.obj', 'material.spsm']);
  const result = await app.call('file:import');
  assert.equal(result.length, 3);
  assert.equal(result[0].name, 'large.SPP');
  assert.equal(result[0].data.byteLength, 0);
  assert.ok(result[1].data.byteLength > 0);
  assert.deepEqual(app.reads, ['model.obj', 'material.spsm']);
});

test('canceling Open or Import leaves files untouched', async () => {
  const app = desktop([], true);
  assert.equal(await app.call('project:open'), null);
  assert.equal((await app.call('file:import')).length, 0);
  assert.deepEqual(app.reads, []);
});

test('supported projects can still be read after the renderer validates the filename', async () => {
  const app = desktop(['saved.lmp']);
  const selected = await app.call('project:open');
  const result = await app.call('project:read', selected.path);
  assert.equal(result.path, 'saved.lmp');
  assert.ok(result.data.byteLength > 0);
  assert.deepEqual(app.reads, ['saved.lmp']);
});
