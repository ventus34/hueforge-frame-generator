import { getHangerHoles } from './geometry.ts';
import type { FrameParams } from './geometry.ts';
import { getEffectiveFrameDimensions } from './params.ts';

export interface StripPlacement {
  x: number;
  y: number;
  w: number;
  l: number;
  angle: number;
}

/** Shared bounds for strip editing, project import, and geometry checks. */
export const MAX_STRIPS = 100;
export const STRIP_LIMITS = {
  x: { min: -2000, max: 2000 },
  y: { min: -2000, max: 2000 },
  w: { min: 1, max: 1000 },
  l: { min: 1, max: 1000 },
  angle: { min: -360, max: 360 }
} as const;

export interface FramePlanDimensions {
  wPocket: number;
  lPocket: number;
  wOut: number;
  lOut: number;
  wHole: number;
  lHole: number;
  outerBoundsWidth: number;
  outerBoundsLength: number;
}

/** Dimensions used by the 2D planner, derived with the same effective hex size as the mesh. */
export function getFramePlanDimensions(params: FrameParams): FramePlanDimensions {
  const effective = getEffectiveFrameDimensions(params);
  const wPocket = effective.pocketWidth;
  const lPocket = effective.pocketLength;
  const wOut = effective.outerWidth;
  const lOut = effective.outerLength;
  const maxShelf = Math.min(wPocket, lPocket) / 2 - 2;
  const actualShelf = Math.min(params.sShelf, maxShelf);
  const wHole = wPocket - 2 * actualShelf;
  const lHole = params.shape === 'hex' ? wHole : lPocket - 2 * actualShelf;

  return {
    wPocket,
    lPocket,
    wOut,
    lOut,
    wHole,
    lHole,
    outerBoundsWidth: params.shape === 'hex' ? (2 * wOut) / Math.sqrt(3) : wOut,
    outerBoundsLength: lOut
  };
}

type Point = { x: number; y: number };
const EPSILON = 1e-7;

function hexagon(size: number): Point[] {
  const radius = size / Math.sqrt(3);
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (index * Math.PI) / 3;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
}

// Keep the same eight facets per corner used by generateFrameGeometry.
function roundedRectangle(width: number, length: number, radius: number): Point[] {
  const r = Math.min(radius, width / 2, length / 2);
  if (r <= 0) {
    return [
      { x: width / 2, y: -length / 2 },
      { x: width / 2, y: length / 2 },
      { x: -width / 2, y: length / 2 },
      { x: -width / 2, y: -length / 2 }
    ];
  }

  const points: Point[] = [];
  const addArc = (cx: number, cy: number, start: number, end: number) => {
    for (let index = 0; index <= 8; index++) {
      const angle = start + ((end - start) * index) / 8;
      points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
  };
  addArc(width / 2 - r, -length / 2 + r, -Math.PI / 2, 0);
  addArc(width / 2 - r, length / 2 - r, 0, Math.PI / 2);
  addArc(-width / 2 + r, length / 2 - r, Math.PI / 2, Math.PI);
  addArc(-width / 2 + r, -length / 2 + r, Math.PI, (3 * Math.PI) / 2);
  return points;
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointInConvexPolygon(point: Point, polygon: Point[], allowBoundary = true): boolean {
  let sign = 0;
  for (let index = 0; index < polygon.length; index++) {
    const value = cross(polygon[index], polygon[(index + 1) % polygon.length], point);
    if (Math.abs(value) <= EPSILON) {
      if (!allowBoundary && onSegment(polygon[index], polygon[(index + 1) % polygon.length], point)) return false;
      continue;
    }
    const nextSign = Math.sign(value);
    if (sign !== 0 && sign !== nextSign) return false;
    sign = nextSign;
  }
  return true;
}

function onSegment(a: Point, b: Point, point: Point): boolean {
  return (
    Math.abs(cross(a, b, point)) <= EPSILON &&
    point.x >= Math.min(a.x, b.x) - EPSILON &&
    point.x <= Math.max(a.x, b.x) + EPSILON &&
    point.y >= Math.min(a.y, b.y) - EPSILON &&
    point.y <= Math.max(a.y, b.y) + EPSILON
  );
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);

  if (Math.abs(abC) <= EPSILON && onSegment(a, b, c)) return true;
  if (Math.abs(abD) <= EPSILON && onSegment(a, b, d)) return true;
  if (Math.abs(cdA) <= EPSILON && onSegment(c, d, a)) return true;
  if (Math.abs(cdB) <= EPSILON && onSegment(c, d, b)) return true;
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

function polygonsIntersect(a: Point[], b: Point[]): boolean {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentsIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
    }
  }
  return pointInConvexPolygon(a[0], b) || pointInConvexPolygon(b[0], a);
}

function stripPolygon(strip: StripPlacement): Point[] {
  const theta = (strip.angle * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const halfW = strip.w / 2;
  const halfL = strip.l / 2;
  return [
    { x: -halfW, y: -halfL },
    { x: halfW, y: -halfL },
    { x: halfW, y: halfL },
    { x: -halfW, y: halfL }
  ].map((point) => ({
    x: strip.x + point.x * cos - point.y * sin,
    y: strip.y + point.x * sin + point.y * cos
  }));
}

/** True only when the entire tape rectangle lies on frame material on the back face. */
export function isStripValid(params: FrameParams, strip: StripPlacement): boolean {
  if (
    ![strip.x, strip.y, strip.w, strip.l, strip.angle].every(Number.isFinite) ||
    strip.x < STRIP_LIMITS.x.min || strip.x > STRIP_LIMITS.x.max ||
    strip.y < STRIP_LIMITS.y.min || strip.y > STRIP_LIMITS.y.max ||
    strip.w < STRIP_LIMITS.w.min || strip.w > STRIP_LIMITS.w.max ||
    strip.l < STRIP_LIMITS.l.min || strip.l > STRIP_LIMITS.l.max ||
    strip.angle < STRIP_LIMITS.angle.min || strip.angle > STRIP_LIMITS.angle.max ||
    ![params.wPic, params.clearance, params.tBorder, params.sShelf, params.cornerRadius].every(Number.isFinite) ||
    (params.shape !== 'rect' && params.shape !== 'hex') ||
    params.wPic <= 0 || params.clearance < 0 || params.tBorder <= 0 || params.sShelf < 0 || params.cornerRadius < 0 ||
    (params.shape === 'rect' && (!Number.isFinite(params.lPic) || params.lPic <= 0)) ||
    (params.hangerEnabled && (!Number.isFinite(params.height) || !Number.isFinite(params.hangerDiameter) || params.hangerDiameter <= 0))
  ) return false;

  const dimensions = getFramePlanDimensions(params);
  if (dimensions.wHole <= 0 || dimensions.lHole <= 0) return false;
  const outer = params.shape === 'hex'
    ? hexagon(dimensions.wOut)
    : roundedRectangle(dimensions.wOut, dimensions.lOut, params.cornerRadius);
  const hole = params.shape === 'hex'
    ? hexagon(dimensions.wHole)
    : [
        { x: -dimensions.wHole / 2, y: -dimensions.lHole / 2 },
        { x: dimensions.wHole / 2, y: -dimensions.lHole / 2 },
        { x: dimensions.wHole / 2, y: dimensions.lHole / 2 },
        { x: -dimensions.wHole / 2, y: dimensions.lHole / 2 }
      ];
  const tape = stripPolygon(strip);

  // The outer outline and inner opening are convex. Every tape vertex must fit
  // inside the outer outline; then intersection testing catches a hole crossing
  // even when none of the tape's four corners lands inside the opening.
  if (!tape.every((point) => pointInConvexPolygon(point, outer))) return false;
  if (polygonsIntersect(tape, hole)) return false;

  // The rectangular frame generator leaves a square-to-dodecagon transition
  // at each hanger opening. Only the dodecagonal opening lacks material.
  if (params.shape === 'rect' && params.hangerEnabled && params.tBorder > 4 && params.height > 4) {
    const centers = getHangerHoles(
      params,
      dimensions.wOut,
      dimensions.lOut,
      dimensions.wPocket,
      dimensions.lPocket
    );
    const cutoutDiameter = Math.min(params.hangerDiameter, params.tBorder - 2);
    for (const center of centers) {
      const cutout = Array.from({ length: 12 }, (_, index) => {
        const angle = (index * 2 * Math.PI) / 12;
        return {
          x: center.cx + (cutoutDiameter / 2) * Math.cos(angle),
          y: center.cy + (cutoutDiameter / 2) * Math.sin(angle)
        };
      });
      if (polygonsIntersect(tape, cutout)) return false;
    }
  }

  return true;
}
