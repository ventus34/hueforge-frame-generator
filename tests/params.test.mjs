import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PARAMS,
  getEffectiveFrameDimensions,
  normalizeFrameParams,
  validateFrameParams
} from '../src/utils/params.ts';

test('defaults are safe and valid', () => {
  assert.deepEqual(validateFrameParams(DEFAULT_PARAMS), []);
  assert.deepEqual(normalizeFrameParams(null), DEFAULT_PARAMS);
});

test('normalization replaces non-finite input and clamps configured ranges', () => {
  const normalized = normalizeFrameParams({
    ...DEFAULT_PARAMS,
    wPic: Number.NaN,
    lPic: 5000,
    clearance: Number.POSITIVE_INFINITY,
    tBorder: -4,
    height: 4,
    dPocket: 40,
    sShelf: -1,
    hangerCount: 3
  });

  assert.equal(normalized.wPic, DEFAULT_PARAMS.wPic);
  assert.equal(normalized.lPic, 1000);
  assert.equal(normalized.clearance, DEFAULT_PARAMS.clearance);
  assert.equal(normalized.tBorder, 3);
  assert.equal(normalized.height, 4);
  assert.equal(normalized.dPocket, 2);
  assert.equal(normalized.sShelf, 1);
  assert.equal(normalized.hangerCount, 1);
  assert.deepEqual(validateFrameParams(normalized), []);
});

test('normalization resolves unsupported shape combinations and disables split rounding', () => {
  const normalized = normalizeFrameParams({
    ...DEFAULT_PARAMS,
    shape: 'hex',
    hangerEnabled: true,
    jointType: 'bowtie',
    splitEnabled: true,
    cornerRadius: 5
  });

  assert.equal(normalized.hangerEnabled, false);
  assert.equal(normalized.jointType, 'half-lap');
  assert.equal(normalized.cornerRadius, 0);
  assert.deepEqual(validateFrameParams(normalized), []);
});

test('validation catches non-finite numbers, invalid counts, and dependent dimensions', () => {
  const errors = validateFrameParams({
    ...DEFAULT_PARAMS,
    height: 10,
    dPocket: Number.NaN,
    sShelf: 999,
    hangerDiameter: '8',
    hangerCount: 3,
    splitEnabled: true,
    cornerRadius: 2
  });

  assert.ok(errors.some((error) => error.includes('dPocket must be a finite number')));
  assert.ok(errors.some((error) => error.includes('Shelf width must be')));
  assert.ok(errors.some((error) => error.includes('hangerDiameter must be a finite number')));
  assert.ok(errors.some((error) => error.includes('hangerCount must be 1 or 2')));
  assert.ok(errors.some((error) => error.includes('Corner radius must be 0 while the frame is split')));
});

test('validation rejects non-finite dependent measurements and impossible hanger bores', () => {
  const errors = validateFrameParams({
    ...DEFAULT_PARAMS,
    sShelf: Number.POSITIVE_INFINITY,
    cornerRadius: Number.NaN,
    hangerEnabled: true,
    tBorder: 4,
    height: 4
  });

  assert.ok(errors.some((error) => error.includes('sShelf must be a finite number')));
  assert.ok(errors.some((error) => error.includes('cornerRadius must be a finite number')));
  assert.ok(errors.some((error) => error.includes('border thickness above 4 mm')));
  assert.ok(errors.some((error) => error.includes('frame height above 4 mm')));
});

test('hexagon effective dimensions do not depend on the hidden rectangle length', () => {
  const first = getEffectiveFrameDimensions({ ...DEFAULT_PARAMS, shape: 'hex', wPic: 200, lPic: 50 });
  const second = getEffectiveFrameDimensions({ ...DEFAULT_PARAMS, shape: 'hex', wPic: 200, lPic: 1000 });
  assert.deepEqual(first, second);
});

test('validation rejects a split bowtie rail when hanger clearance consumes every corner-safe seam', () => {
  const infeasible = {
    ...DEFAULT_PARAMS,
    wPic: 50,
    lPic: 50,
    tBorder: 30,
    sShelf: 23,
    hangerEnabled: true,
    splitEnabled: true,
    maxPartLength: 100,
    jointType: 'bowtie'
  };
  const errors = validateFrameParams(infeasible);
  assert.ok(errors.some((error) => error.includes('no safe split seam between the bowtie corner joints')));

  const feasible = { ...infeasible, wPic: 300, maxPartLength: 200 };
  assert.ok(!validateFrameParams(feasible).some((error) => error.includes('no safe split seam between the bowtie corner joints')));
});
