import test from 'node:test';
import assert from 'node:assert/strict';
import { exportBinarySTL } from '../src/utils/stlExporter.ts';
import { createZip, crc32 } from '../src/utils/zipExporter.ts';
import { getFootprintFit, getPartBedFit } from '../src/utils/printerProfiles.ts';
import { DEFAULT_PARAMS } from '../src/utils/params.ts';
import { generateBowtieKeyGeometry, generateFrameGeometry, generateSplitFrameParts } from '../src/utils/geometry.ts';
import { bowtieKeyQuantityForClosedFrame, createBowtieKeyManifestEntry } from '../src/utils/assemblyManifest.ts';

test('binary STL writes one valid triangle with a little-endian triangle count', () => {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const stl = exportBinarySTL(positions, normals);
  const view = new DataView(stl);
  assert.equal(stl.byteLength, 134);
  assert.equal(view.getUint32(80, true), 1);
  assert.equal(view.getFloat32(96, true), 0);
  assert.equal(view.getFloat32(100, true), 0);
  assert.equal(view.getFloat32(104, true), 0);
  assert.equal(view.getUint16(132, true), 0);
});

test('binary STL rejects empty, partial, mismatched and non-finite mesh buffers', () => {
  const oneTriangle = new Float32Array(9);
  assert.throws(() => exportBinarySTL(new Float32Array(), new Float32Array()), /complete triangles/);
  assert.throws(() => exportBinarySTL(new Float32Array(8), new Float32Array(8)), /complete triangles/);
  assert.throws(() => exportBinarySTL(oneTriangle, new Float32Array(6)), /one vector for every vertex/);
  const nonFinite = new Float32Array(9);
  nonFinite[4] = Number.NaN;
  assert.throws(() => exportBinarySTL(nonFinite, new Float32Array(9)), /not finite/);
  const validPositions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const nonFiniteNormal = new Float32Array(9);
  nonFiniteNormal[0] = Infinity;
  assert.throws(() => exportBinarySTL(validPositions, nonFiniteNormal), /not finite/);
});

test('binary STL rejects degenerate triangles and zero facet normals', () => {
  const zeroNormal = new Float32Array(9);
  const validPositions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  assert.throws(() => exportBinarySTL(zeroNormal, new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])), /degenerate/);
  assert.throws(() => exportBinarySTL(validPositions, zeroNormal), /zero or invalid facet normal/);
  const collinear = new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2]);
  assert.throws(() => exportBinarySTL(collinear, new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])), /degenerate/);
});

test('default and split bowtie geometry serialize without degenerate triangles', () => {
  const full = generateFrameGeometry(DEFAULT_PARAMS);
  assert.ok(exportBinarySTL(full.positions, full.normals).byteLength > 84);
  const splitParams = { ...DEFAULT_PARAMS, splitEnabled: true, maxPartLength: 100, jointType: 'bowtie' };
  const parts = generateSplitFrameParts(splitParams);
  assert.ok(parts.length > 0);
  for (const part of parts) assert.ok(exportBinarySTL(part.positions, part.normals).byteLength > 84);
  const key = generateBowtieKeyGeometry(splitParams);
  assert.ok(exportBinarySTL(key.positions, key.normals).byteLength > 84);
});

test('CRC-32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('ZIP emits UTF-8 stored files with matching CRC and data', () => {
  const archive = createZip([
    { name: 'parts/ramka_ą.stl', data: new Uint8Array([1, 2, 3]) },
    { name: 'manifest.json', data: '{"ok":true}' }
  ]);
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(6, true) & 0x0800, 0x0800);
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const fileName = new TextDecoder().decode(archive.slice(30, 30 + nameLength));
  assert.equal(fileName, 'parts/ramka_ą.stl');
  const dataOffset = 30 + nameLength + extraLength;
  const dataLength = view.getUint32(22, true);
  const data = archive.slice(dataOffset, dataOffset + dataLength);
  assert.deepEqual([...data], [1, 2, 3]);
  assert.equal(view.getUint32(14, true), crc32(data));
  const endOffset = archive.length - 22;
  assert.equal(view.getUint32(endOffset, true), 0x06054b50);
  assert.equal(view.getUint16(endOffset + 10, true), 2);
});

test('ZIP rejects unsafe and duplicate file names', () => {
  assert.throws(() => createZip([{ name: '../escape.stl', data: '' }]), /Unsafe ZIP entry name/);
  assert.throws(() => createZip([{ name: 'C:/escape.stl', data: '' }]), /Unsafe ZIP entry name/);
  assert.throws(() => createZip([{ name: 'same.stl', data: '' }, { name: 'same.stl', data: '' }]), /Duplicate ZIP entry/);
});

test('bed fit allows an in-plane quarter turn and rejects undersized beds', () => {
  assert.deepEqual(getFootprintFit(230, 200, { x: 210, y: 240 }), {
    width: 230,
    length: 200,
    fits: true,
    orientation: 'yx'
  });
  assert.equal(getFootprintFit(230, 200, { x: 210, y: 220 }).fits, false);
  assert.throws(() => getFootprintFit(Number.NaN, 5, { x: 10, y: 10 }), /finite/);
});

test('bowtie manifest quantity matches generated 8-part and 4-part closed frames', () => {
  for (const [maxPartLength, expectedPartCount] of [[200, 8], [400, 4]]) {
    const params = { ...DEFAULT_PARAMS, splitEnabled: true, maxPartLength, jointType: 'bowtie' };
    const frameParts = generateSplitFrameParts(params);
    assert.equal(frameParts.length, expectedPartCount);
    const keyEntry = createBowtieKeyManifestEntry(frameParts.length, 'parts/bowtie_key.stl', {
      width: 12,
      length: 8,
      fits: true,
      orientation: 'xy'
    });
    assert.equal(keyEntry.quantity, expectedPartCount);
    assert.equal(keyEntry.isReusableTemplate, true);
  }
  assert.throws(() => bowtieKeyQuantityForClosedFrame(0), /at least one/);
});

test('geometry fit uses the XY bounds of finite model vertices', () => {
  const positions = new Float32Array([-110, -100, 0, 110, -100, 0, 110, 100, 12]);
  assert.equal(getPartBedFit(positions, { x: 220, y: 200 }).fits, true);
  assert.equal(getPartBedFit(positions, { x: 200, y: 200 }).fits, false);
  assert.throws(() => getPartBedFit(new Float32Array([0, 0, 0, Infinity, 1, 0, 2, 2, 0]), { x: 10, y: 10 }), /non-finite/);
});
