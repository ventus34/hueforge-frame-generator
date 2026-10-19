export interface BedSize {
  x: number;
  y: number;
}

export interface PrinterProfile {
  id: string;
  name: string;
  bed: BedSize;
}

export interface FootprintFit {
  width: number;
  length: number;
  fits: boolean;
  orientation: 'xy' | 'yx' | null;
}

export const PRINTER_PROFILES: PrinterProfile[] = [
  { id: 'bambu-256', name: '256 × 256 mm', bed: { x: 256, y: 256 } },
  { id: 'ender-220', name: '220 × 220 mm', bed: { x: 220, y: 220 } },
  { id: 'prusa-250', name: '250 × 210 mm', bed: { x: 250, y: 210 } },
  { id: 'custom', name: 'Custom', bed: { x: 256, y: 256 } }
];

export function getFootprintFit(width: number, length: number, bed: BedSize, tolerance = 1e-5): FootprintFit {
  if (!Number.isFinite(width) || !Number.isFinite(length) || width < 0 || length < 0 ||
      !Number.isFinite(bed.x) || !Number.isFinite(bed.y) || bed.x <= 0 || bed.y <= 0 ||
      !Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError('Footprint and bed dimensions must be finite and non-negative.');
  }
  const xy = width <= bed.x + tolerance && length <= bed.y + tolerance;
  const yx = length <= bed.x + tolerance && width <= bed.y + tolerance;
  return {
    width,
    length,
    fits: xy || yx,
    orientation: xy ? 'xy' : yx ? 'yx' : null
  };
}

/** Returns an axis-aligned XY footprint from model coordinates (Z is print height). */
export function getGeometryFootprint(positions: Float32Array): { width: number; length: number } {
  if (positions.length < 9 || positions.length % 9 !== 0) throw new RangeError('Geometry positions must contain complete triangles.');
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw new RangeError('Geometry contains non-finite coordinates.');
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { width: maxX - minX, length: maxY - minY };
}

export function getPartBedFit(positions: Float32Array, bed: BedSize): FootprintFit {
  const footprint = getGeometryFootprint(positions);
  return getFootprintFit(footprint.width, footprint.length, bed);
}
