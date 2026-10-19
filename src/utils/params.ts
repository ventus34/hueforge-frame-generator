import type { FrameParams } from './geometry';
import { planSafeSplitBoundaries } from './splitSeams.ts';

export const DEFAULT_PARAMS: FrameParams = {
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

export interface EffectiveFrameDimensions {
  pocketWidth: number;
  pocketLength: number;
  outerWidth: number;
  outerLength: number;
}

export function getEffectiveFrameDimensions(
  params: Pick<FrameParams, 'shape' | 'wPic' | 'lPic' | 'clearance' | 'tBorder'>
): EffectiveFrameDimensions {
  const pocketWidth = params.wPic + 2 * params.clearance;
  const pocketLength = params.shape === 'hex'
    ? pocketWidth
    : params.lPic + 2 * params.clearance;

  return {
    pocketWidth,
    pocketLength,
    outerWidth: pocketWidth + 2 * params.tBorder,
    outerLength: pocketLength + 2 * params.tBorder
  };
}

type NumericKey =
  | 'wPic'
  | 'lPic'
  | 'clearance'
  | 'tBorder'
  | 'height'
  | 'dPocket'
  | 'sShelf'
  | 'cornerRadius'
  | 'hangerDiameter'
  | 'maxPartLength';

const NUMERIC_LIMITS: Record<Exclude<NumericKey, 'dPocket' | 'sShelf' | 'cornerRadius'>, [number, number]> = {
  wPic: [50, 1000],
  lPic: [50, 1000],
  clearance: [0, 2],
  tBorder: [3, 30],
  height: [4, 40],
  hangerDiameter: [3, 15],
  maxPartLength: [100, 400]
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFiniteNumber(input: Record<string, unknown>, key: NumericKey, fallback: number): number {
  const raw = input[key];
  const value = typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '')
    ? Number(raw)
    : Number.NaN;
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isOneOf<const T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === 'string' && options.includes(value);
}

function normalizeInteger(
  input: Record<string, unknown>,
  key: NumericKey,
  fallback: number,
  min: number,
  max: number
): number {
  return Math.round(clamp(readFiniteNumber(input, key, fallback), min, max));
}

function normalizeDecimal(
  input: Record<string, unknown>,
  key: NumericKey,
  fallback: number,
  min: number,
  max: number
): number {
  return Math.round(clamp(readFiniteNumber(input, key, fallback), min, max) * 10) / 10;
}

export function normalizeFrameParams(input: unknown): FrameParams {
  const source = isRecord(input) ? input : {};
  const shape = source.shape === 'hex' ? 'hex' : 'rect';
  const wPic = normalizeInteger(source, 'wPic', DEFAULT_PARAMS.wPic, ...NUMERIC_LIMITS.wPic);
  const lPic = normalizeInteger(source, 'lPic', DEFAULT_PARAMS.lPic, ...NUMERIC_LIMITS.lPic);
  const clearance = normalizeDecimal(source, 'clearance', DEFAULT_PARAMS.clearance, ...NUMERIC_LIMITS.clearance);
  const tBorder = normalizeInteger(source, 'tBorder', DEFAULT_PARAMS.tBorder, ...NUMERIC_LIMITS.tBorder);
  const height = normalizeInteger(source, 'height', DEFAULT_PARAMS.height, ...NUMERIC_LIMITS.height);
  const dPocket = normalizeInteger(source, 'dPocket', DEFAULT_PARAMS.dPocket, 1, height - 2);
  const splitEnabled = source.splitEnabled === true;
  const hangerEnabled = source.hangerEnabled === true && shape === 'rect';
  const jointType = isOneOf(source.jointType, ['half-lap', 'bowtie', 'dovetail'] as const)
    ? source.jointType
    : DEFAULT_PARAMS.jointType;
  const normalizedJointType = shape === 'hex' && jointType === 'bowtie'
    ? 'half-lap'
    : jointType;
  const dimensions = getEffectiveFrameDimensions({ shape, wPic, lPic, clearance, tBorder });
  const maxShelfWidth = Math.max(1, Math.floor(Math.min(dimensions.pocketWidth, dimensions.pocketLength) / 2 - 2));
  const maxRadius = Math.max(0, Math.floor(Math.min(tBorder, dimensions.outerWidth / 2, dimensions.outerLength / 2)));
  const rawRadius = normalizeInteger(source, 'cornerRadius', DEFAULT_PARAMS.cornerRadius, 0, maxRadius);
  const cornerRadius = shape === 'rect' && !splitEnabled ? rawRadius : 0;
  const hangerSide = isOneOf(source.hangerSide, ['top', 'bottom', 'left', 'right'] as const)
    ? source.hangerSide
    : DEFAULT_PARAMS.hangerSide;
  const hangerCount = source.hangerCount === 2 ? 2 : 1;

  return {
    shape,
    wPic,
    lPic,
    clearance,
    tBorder,
    height,
    dPocket,
    sShelf: normalizeInteger(source, 'sShelf', DEFAULT_PARAMS.sShelf, 1, maxShelfWidth),
    cornerRadius,
    hangerEnabled,
    hangerSide,
    hangerCount,
    hangerDiameter: normalizeInteger(source, 'hangerDiameter', DEFAULT_PARAMS.hangerDiameter, ...NUMERIC_LIMITS.hangerDiameter),
    splitEnabled,
    maxPartLength: normalizeInteger(source, 'maxPartLength', DEFAULT_PARAMS.maxPartLength, ...NUMERIC_LIMITS.maxPartLength),
    jointType: normalizedJointType
  };
}

export function validateFrameParams(params: unknown): string[] {
  if (!isRecord(params)) return ['Parameters must be an object.'];

  const values = params;
  const errors: string[] = [];
  const shape = values.shape;
  const numericFields: Array<[NumericKey, number, number, number, boolean]> = [
    ['wPic', values.wPic as number, ...NUMERIC_LIMITS.wPic, true],
    ['lPic', values.lPic as number, ...NUMERIC_LIMITS.lPic, shape !== 'hex'],
    ['clearance', values.clearance as number, ...NUMERIC_LIMITS.clearance, true],
    ['tBorder', values.tBorder as number, ...NUMERIC_LIMITS.tBorder, true],
    ['height', values.height as number, ...NUMERIC_LIMITS.height, true],
    ['dPocket', values.dPocket as number, 1, Number.POSITIVE_INFINITY, true],
    ['sShelf', values.sShelf as number, 1, Number.POSITIVE_INFINITY, true],
    ['cornerRadius', values.cornerRadius as number, 0, Number.POSITIVE_INFINITY, true],
    ['hangerDiameter', values.hangerDiameter as number, ...NUMERIC_LIMITS.hangerDiameter, true],
    ['maxPartLength', values.maxPartLength as number, ...NUMERIC_LIMITS.maxPartLength, true]
  ];

  for (const [key, value, min, max, checkRange] of numericFields) {
    if (!Number.isFinite(value)) {
      errors.push(`${key} must be a finite number.`);
    } else if (checkRange && (value < min || value > max)) {
      errors.push(`${key} must be at least ${min}${Number.isFinite(max) ? ` and at most ${max}` : ''} mm.`);
    }
  }

  const paramsTyped = values as unknown as FrameParams;
  if (typeof values.clearance === 'number' && Number.isFinite(values.clearance)
    && Math.abs(values.clearance * 10 - Math.round(values.clearance * 10)) > 1e-8) {
    errors.push('clearance must use 0.1 mm increments.');
  }
  for (const key of ['wPic', 'lPic', 'tBorder', 'height', 'dPocket', 'sShelf', 'cornerRadius', 'hangerDiameter', 'maxPartLength'] as const) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value)) {
      errors.push(`${key} must be a whole number of millimeters.`);
    }
  }

  if (!['rect', 'hex'].includes(String(shape))) errors.push('shape must be rect or hex.');
  if (!['top', 'bottom', 'left', 'right'].includes(String(values.hangerSide))) errors.push('hangerSide is not supported.');
  if (values.hangerCount !== 1 && values.hangerCount !== 2) errors.push('hangerCount must be 1 or 2.');
  if (!['half-lap', 'bowtie', 'dovetail'].includes(String(values.jointType))) errors.push('jointType is not supported.');
  if (typeof values.hangerEnabled !== 'boolean') errors.push('hangerEnabled must be a boolean.');
  if (typeof values.splitEnabled !== 'boolean') errors.push('splitEnabled must be a boolean.');
  if (shape === 'hex' && values.hangerEnabled === true) errors.push('Hanger holes are available only for rectangular frames.');
  if (values.hangerEnabled === true && Number.isFinite(values.tBorder) && (values.tBorder as number) <= 4) {
    errors.push('Increase border thickness above 4 mm to create hanger holes.');
  }
  if (values.hangerEnabled === true && Number.isFinite(values.height) && (values.height as number) <= 4) {
    errors.push('Increase frame height above 4 mm to create hanger holes.');
  }
  if (shape === 'hex' && values.jointType === 'bowtie') errors.push('Bowtie joints are available only for rectangular frames.');

  if (Number.isFinite(values.height) && Number.isFinite(values.dPocket)) {
    if ((values.dPocket as number) < 1 || (values.dPocket as number) > (values.height as number) - 2) {
      errors.push('Pocket depth must leave at least 2 mm of shelf thickness.');
    }
  }

  const hasBaseDimensions = typeof shape === 'string'
    && Number.isFinite(values.wPic)
    && Number.isFinite(values.clearance)
    && Number.isFinite(values.tBorder)
    && (shape === 'hex' || Number.isFinite(values.lPic));
  if (typeof values.sShelf === 'number' && Number.isFinite(values.sShelf) && hasBaseDimensions) {
    const dimensions = getEffectiveFrameDimensions(paramsTyped);
    const maxShelfWidth = Math.floor(Math.min(dimensions.pocketWidth, dimensions.pocketLength) / 2 - 2);
    if (values.sShelf < 1 || values.sShelf > maxShelfWidth) {
      errors.push(`Shelf width must be between 1 and ${Math.max(0, maxShelfWidth)} mm for these picture dimensions.`);
    }
  }

  if (typeof values.cornerRadius === 'number' && Number.isFinite(values.cornerRadius)
    && Number.isFinite(values.tBorder) && hasBaseDimensions) {
    const dimensions = getEffectiveFrameDimensions(paramsTyped);
    const maxRadius = Math.floor(Math.min(values.tBorder as number, dimensions.outerWidth / 2, dimensions.outerLength / 2));
    if (values.cornerRadius < 0 || values.cornerRadius > maxRadius) {
      errors.push(`Corner radius must be between 0 and ${Math.max(0, maxRadius)} mm.`);
    }
    if (shape === 'hex' && values.cornerRadius !== 0) {
      errors.push('Corner radius applies only to rectangular frames.');
    }
    if (values.splitEnabled && values.cornerRadius !== 0) {
      errors.push('Corner radius must be 0 while the frame is split.');
    }
  }

  if (shape === 'rect'
    && values.splitEnabled === true
    && values.jointType === 'bowtie'
    && values.hangerEnabled === true
    && Number.isFinite(values.wPic)
    && Number.isFinite(values.lPic)
    && Number.isFinite(values.clearance)
    && Number.isFinite(values.tBorder)
    && Number.isFinite(values.sShelf)
    && Number.isFinite(values.hangerDiameter)
    && Number.isFinite(values.maxPartLength)
    && (values.hangerSide === 'top' || values.hangerSide === 'bottom' || values.hangerSide === 'left' || values.hangerSide === 'right')
    && (values.hangerCount === 1 || values.hangerCount === 2)) {
    const dimensions = getEffectiveFrameDimensions(paramsTyped);
    const pocketMin = Math.min(dimensions.pocketWidth, dimensions.pocketLength);
    const maxShelf = pocketMin / 2 - 2;
    const actualShelf = Math.min(values.sShelf as number, maxShelf);
    const railLength = values.hangerSide === 'top' || values.hangerSide === 'bottom'
      ? dimensions.outerWidth
      : dimensions.outerLength;
    const hangerCenters = values.hangerCount === 1
      ? [railLength / 2]
      : [railLength / 3, 2 * railLength / 3];
    const W = (values.tBorder as number) + actualShelf;
    const L_bowtie = Math.max(4, Math.min(20, (W - 2) * 1.4 * 0.6));
    const hangerRadius = Math.max(0, Math.min(values.hangerDiameter as number, (values.tBorder as number) - 2) / 2);
    const seamPlan = planSafeSplitBoundaries({
      length: railLength,
      maxPartLength: values.maxPartLength as number,
      maxNominalSpan: (values.maxPartLength as number) - 0.25,
      keepouts: hangerCenters,
      seamClearance: hangerRadius + L_bowtie / 2 + 1,
      cornerClearance: W + 0.5
    });
    if (seamPlan.hangerAndCornerBlocked && seamPlan.plans.every(plan => plan === null)) {
      errors.push('The selected hanger side has no safe split seam between the bowtie corner joints. Increase that frame dimension, reduce hanger diameter or count, or choose a different joint.');
    }
  }
  return errors;
}
