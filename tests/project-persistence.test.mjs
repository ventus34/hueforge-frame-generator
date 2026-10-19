import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PARAMS } from '../src/utils/params.ts';
import {
  loadProjectFromStorage,
  loadProjectFromStorageResult,
  MAX_PROJECT_FILE_BYTES,
  parseProject,
  parseProjectText,
  PROJECT_SCHEMA_VERSION,
  PROJECT_RECOVERY_KEY,
  PROJECT_STORAGE_KEY,
  saveProjectToStorage
} from '../src/utils/projectPersistence.ts';

const baseProject = () => ({
  schemaVersion: PROJECT_SCHEMA_VERSION,
  params: { ...DEFAULT_PARAMS },
  strips: [{ id: 'strip-1', x: 0, y: 100, w: 16, l: 46, size: 'S', angle: 15 }],
  materialColor: '#ff5100',
  lang: 'pl',
  showGrid: false,
  activeTab: '2d',
  printer: { profileId: 'custom', name: 'Custom bed', bedX: 210, bedY: 220 }
});

test('project JSON preserves frame, strips, display, language, color and custom printer settings', () => {
  const project = baseProject();
  assert.deepEqual(parseProject(project), project);
  assert.deepEqual(parseProjectText(JSON.stringify(project)), project);
});

test('project import rejects unknown schema, invalid frame parameters and invalid settings', () => {
  const unknownVersion = baseProject();
  unknownVersion.schemaVersion = 999;
  assert.throws(() => parseProject(unknownVersion), /schema version/);

  const invalidParams = baseProject();
  invalidParams.params.wPic = 100000;
  assert.throws(() => parseProject(invalidParams), /wPic/);

  const invalidColor = baseProject();
  invalidColor.materialColor = 'red';
  assert.throws(() => parseProject(invalidColor), /HEX/);

  const invalidPrinter = baseProject();
  invalidPrinter.printer = { profileId: 'bambu-256', name: 'Other size', bedX: 210, bedY: 220 };
  assert.throws(() => parseProject(invalidPrinter), /profile and bed/);
});

test('project import bounds strip count and strip dimensions', () => {
  const tooMany = baseProject();
  tooMany.strips = Array.from({ length: 101 }, (_, i) => ({ id: `strip-${i}`, x: 0, y: 0, w: 16, l: 46, size: 'S', angle: 0 }));
  assert.throws(() => parseProject(tooMany), /at most 100 strips/);

  const invalidStrip = baseProject();
  invalidStrip.strips[0].w = 5000;
  assert.throws(() => parseProject(invalidStrip), /invalid values/);
});

test('project text size limit is enforced before JSON parsing', () => {
  assert.throws(() => parseProjectText(' '.repeat(MAX_PROJECT_FILE_BYTES + 1)), /exceeds/);
});

test('local save and restore use the versioned key and ignore corrupt stored data', () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value)
  };
  const project = baseProject();
  assert.equal(saveProjectToStorage(storage, project), true);
  assert.equal(data.has(PROJECT_STORAGE_KEY), true);
  assert.deepEqual(loadProjectFromStorage(storage, baseProject()), project);

  data.set(PROJECT_STORAGE_KEY, '{broken');
  const fallback = baseProject();
  fallback.lang = 'en';
  assert.deepEqual(loadProjectFromStorage(storage, fallback), fallback);
  assert.equal(data.get(PROJECT_STORAGE_KEY), '{broken');
  assert.equal(data.get(PROJECT_RECOVERY_KEY), '{broken');

  data.set(PROJECT_STORAGE_KEY, '{new-broken}');
  const secondRecovery = loadProjectFromStorageResult(storage, fallback);
  assert.equal(secondRecovery.recoverySaved, false);
  assert.equal(secondRecovery.recoveryBackup, '{broken');
  assert.equal(secondRecovery.recoveryRaw, '{new-broken}');
  assert.equal(data.get(PROJECT_RECOVERY_KEY), '{broken');
  assert.equal(data.get(PROJECT_STORAGE_KEY), '{new-broken}');
});

test('unreadable local data remains untouched if a recovery copy cannot be written', () => {
  const raw = '{future-version}';
  const storage = {
    getItem: (key) => key === PROJECT_STORAGE_KEY ? raw : null,
    setItem: () => { throw new Error('quota exceeded'); }
  };
  const result = loadProjectFromStorageResult(storage, baseProject());
  assert.equal(result.recoveryEncountered, true);
  assert.equal(result.recoverySaved, false);
  assert.equal(storage.getItem(PROJECT_STORAGE_KEY), raw);
});
