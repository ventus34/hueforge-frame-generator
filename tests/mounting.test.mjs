import assert from 'node:assert/strict';
import test from 'node:test';
import { getFramePlanDimensions, isStripValid } from '../src/utils/mounting.ts';

const baseParams = {
  shape: 'rect',
  wPic: 200,
  lPic: 200,
  clearance: 0.2,
  tBorder: 8,
  height: 12,
  dPocket: 3,
  sShelf: 4,
  cornerRadius: 0,
  hangerEnabled: false,
  hangerSide: 'top',
  hangerCount: 1,
  hangerDiameter: 8,
  splitEnabled: false,
  maxPartLength: 200,
  jointType: 'half-lap'
};

const strip = (overrides = {}) => ({
  x: 0,
  y: 104,
  w: 16,
  l: 46,
  angle: 0,
  ...overrides
});

test('accepts a strip fully supported by a rectangular rail', () => {
  assert.equal(isStripValid(baseParams, strip({ y: 102.2, w: 46, l: 8 })), true);
});

test('rejects a strip that bridges across the center opening even when all four corners are supported', () => {
  assert.equal(
    isStripValid(baseParams, strip({ x: 0, y: 0, w: 204, l: 4 })),
    false
  );
});

test('uses the generated rounded outer profile when checking the entire strip', () => {
  const params = { ...baseParams, wPic: 80, lPic: 80, cornerRadius: 20 };
  assert.equal(isStripValid(params, strip({ x: 50, y: 50, w: 10, l: 10 })), false);
  assert.equal(isStripValid(params, strip({ x: 44, y: 20, w: 8, l: 8 })), true);
});

test('matches the generated hexagon extents and inner opening', () => {
  const params = { ...baseParams, shape: 'hex', wPic: 80, lPic: 300, sShelf: 4 };
  const dimensions = getFramePlanDimensions(params);
  assert.ok(Math.abs(dimensions.outerBoundsWidth - (2 * dimensions.wOut) / Math.sqrt(3)) < 1e-10);
  assert.equal(isStripValid(params, strip({ x: 0, y: 0, w: 4, l: 4 })), false);
  assert.equal(isStripValid(params, strip({ x: 0, y: dimensions.wOut / 2 - 6, w: 8, l: 8 })), true);
  assert.equal(
    isStripValid(params, strip({ x: dimensions.outerBoundsWidth / 2, y: 0, w: 8, l: 8 })),
    false
  );
});

test('ignores the hidden rectangle length in hex planner dimensions', () => {
  const squareHiddenLength = getFramePlanDimensions({ ...baseParams, shape: 'hex', lPic: 200 });
  const shortHiddenLength = getFramePlanDimensions({ ...baseParams, shape: 'hex', lPic: 40 });
  assert.deepEqual(shortHiddenLength, squareHiddenLength);
  const hexStrip = strip({ x: 0, y: squareHiddenLength.wOut / 2 - 6, w: 8, l: 8 });
  assert.equal(isStripValid({ ...baseParams, shape: 'hex', lPic: 200 }, hexStrip), true);
  assert.equal(isStripValid({ ...baseParams, shape: 'hex', lPic: Number.NaN }, hexStrip), true);
});

test('excludes the actual dodecagonal hanger opening from the back-face support area', () => {
  const params = { ...baseParams, hangerEnabled: true };
  assert.equal(isStripValid(params, strip({ x: 0, y: 104.2, w: 6, l: 6 })), false);
  assert.equal(isStripValid(params, strip({ x: 24, y: 104.2, w: 6, l: 6 })), true);
  assert.equal(isStripValid(params, strip({ x: 3.5, y: 107.7, w: 1, l: 1 })), true);
});

test('rejects non-finite or degenerate strip geometry', () => {
  assert.equal(isStripValid(baseParams, strip({ x: Number.NaN })), false);
  assert.equal(isStripValid(baseParams, strip({ w: 0 })), false);
});
