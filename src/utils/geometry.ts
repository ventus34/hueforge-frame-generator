import { ShapeUtils } from 'three/src/extras/ShapeUtils.js';
import { Vector2 } from 'three/src/math/Vector2.js';
import { getEffectiveFrameDimensions, validateFrameParams } from './params.ts';
import { planSafeSplitBoundaries } from './splitSeams.ts';

export interface FrameParams {
  shape: 'rect' | 'hex';      // Frame shape: 'rect' or 'hex'
  wPic: number;               // Picture width (or flat-to-flat width for hex) (mm)
  lPic: number;               // Picture length (ignored for hex) (mm)
  clearance: number;          // Clearance gap (mm)
  tBorder: number;            // Outer border thickness (mm)
  height: number;             // Total frame height (mm)
  dPocket: number;            // Pocket depth (mm)
  sShelf: number;             // Shelf ledge width (mm)
  cornerRadius: number;       // Corner radius for outer border (mm, ignored for hex)
  hangerEnabled: boolean;     // Add hanger holes
  hangerSide: 'top' | 'bottom' | 'left' | 'right';
  hangerCount: 1 | 2;
  hangerDiameter: number;     // Hanger hole diameter (mm)
  splitEnabled: boolean;      // Split frame into printable segments
  maxPartLength: number;      // Maximum length of a single printed part (mm)
  jointType: 'half-lap' | 'bowtie' | 'dovetail'; // Woodworking joint type
}

// Helper to push a face's vertices and normals
function addFace(
  positions: number[],
  normals: number[],
  v0: [number, number, number],
  v1: [number, number, number],
  v2: [number, number, number],
  v3: [number, number, number],
  normal: [number, number, number]
) {
  addTriangleFace(positions, normals, v0, v1, v2, normal);
  addTriangleFace(positions, normals, v0, v2, v3, normal);
}

// Helper to add a triangle (for corner fans and cylinder ends)
function addTriangleFace(
  positions: number[],
  normals: number[],
  v0: [number, number, number],
  v1: [number, number, number],
  v2: [number, number, number],
  normal: [number, number, number]
) {
  const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
  const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
  const nx = e1[1] * e2[2] - e1[2] * e2[1];
  const ny = e1[2] * e2[0] - e1[0] * e2[2];
  const nz = e1[0] * e2[1] - e1[1] * e2[0];
  if (Math.hypot(nx, ny, nz) < 1e-10) return;
  const dot = nx * normal[0] + ny * normal[1] + nz * normal[2];
  if (dot < 0) {
    positions.push(...v0, ...v2, ...v1);
  } else {
    positions.push(...v0, ...v1, ...v2);
  }
  normals.push(...normal, ...normal, ...normal);
}

function addPolygonFaceWithHoles(
  positions: number[],
  normals: number[],
  contour: [number, number][],
  holes: [number, number][][],
  z: number,
  normal: [number, number, number]
) {
  const contourVectors = contour.map(([x, y]) => new Vector2(x, y));
  const holeVectors = holes.map(hole => hole.map(([x, y]) => new Vector2(x, y)));
  const vertices = [...contour, ...holes.flat()];
  const triangles = ShapeUtils.triangulateShape(contourVectors, holeVectors);

  for (const triangle of triangles) {
    const [a, b, c] = triangle.map(index => vertices[index]);
    addTriangleFace(
      positions,
      normals,
      [a[0], a[1], z],
      [b[0], b[1], z],
      [c[0], c[1], z],
      normal
    );
  }
}

function getCirclePolygon(cx: number, cy: number, diameter: number, sides = 12): [number, number][] {
  return Array.from({ length: sides }, (_, index) => {
    const angle = (index * 2 * Math.PI) / sides;
    return [cx + (diameter / 2) * Math.cos(angle), cy + (diameter / 2) * Math.sin(angle)];
  });
}

// Helper to add a box to the geometry arrays (kept for backwards compatibility/utilities)
export function addBox(
  positions: number[],
  normals: number[],
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  zMin: number,
  zMax: number
) {
  // Left (-X)
  addFace(
    positions, normals,
    [xMin, yMax, zMin], [xMin, yMin, zMin], [xMin, yMin, zMax], [xMin, yMax, zMax],
    [-1, 0, 0]
  );
  // Right (+X)
  addFace(
    positions, normals,
    [xMax, yMin, zMin], [xMax, yMax, zMin], [xMax, yMax, zMax], [xMax, yMin, zMax],
    [1, 0, 0]
  );
  // Bottom (-Z)
  addFace(
    positions, normals,
    [xMin, yMax, zMin], [xMax, yMax, zMin], [xMax, yMin, zMin], [xMin, yMin, zMin],
    [0, 0, -1]
  );
  // Top (+Z)
  addFace(
    positions, normals,
    [xMin, yMin, zMax], [xMax, yMin, zMax], [xMax, yMax, zMax], [xMin, yMax, zMax],
    [0, 0, 1]
  );
  // Front (-Y)
  addFace(
    positions, normals,
    [xMin, yMin, zMin], [xMax, yMin, zMin], [xMax, yMin, zMax], [xMin, yMin, zMax],
    [0, -1, 0]
  );
  // Back (+Y)
  addFace(
    positions, normals,
    [xMax, yMax, zMin], [xMin, yMax, zMin], [xMin, yMax, zMax], [xMax, yMax, zMax],
    [0, 1, 0]
  );
}

// Helper to generate a dodecagonal blind cylindrical cutout in the frame.
// zOpen = Z level of the hole opening.
// goesUp = true → hole drills upward from zOpen (use for back/bottom face, zOpen=0).
// goesUp = false → hole drills downward from zOpen (legacy, zOpen=height).
function addCylindricalHole(
  positions: number[],
  normals: number[],
  cx: number,
  cy: number,
  diameter: number,
  depth: number,
  zOpen: number,
  goesUp = false
) {
  const zMin = goesUp ? zOpen : zOpen - depth;
  const zMax = goesUp ? zOpen + depth : zOpen;
  const points = getCirclePolygon(cx, cy, diameter);
  const sides = points.length;

  // The opening is a true polygonal boundary. The planar opening face is
  // triangulated with the same vertices by the caller, so the wall closes it.
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    const theta = ((i + 0.5) * 2 * Math.PI) / sides;
    const nx = -Math.cos(theta);
    const ny = -Math.sin(theta);

    addFace(
      positions, normals,
      [points[i][0], points[i][1], zMin],
      [points[next][0], points[next][1], zMin],
      [points[next][0], points[next][1], zMax],
      [points[i][0], points[i][1], zMax],
      [nx, ny, 0]
    );
  }

  const zCeil = goesUp ? zMax : zMin;
  const ceilNz: [number, number, number] = goesUp ? [0, 0, -1] : [0, 0, 1];
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    if (goesUp) {
      addTriangleFace(positions, normals,
        [cx, cy, zCeil],
        [points[next][0], points[next][1], zCeil],
        [points[i][0], points[i][1], zCeil],
        ceilNz
      );
    } else {
      addTriangleFace(positions, normals,
        [cx, cy, zCeil],
        [points[i][0], points[i][1], zCeil],
        [points[next][0], points[next][1], zCeil],
        ceilNz
      );
    }
  }
}

// Generates vertices for a rounded rectangle CCW
function getRoundedRectPolygon(width: number, length: number, radius: number, segmentsPerCorner = 8): [number, number][] {
  const poly: [number, number][] = [];
  const r = Math.min(radius, width / 2, length / 2);
  const w2 = width / 2;
  const l2 = length / 2;
  
  if (r <= 0 || segmentsPerCorner === 0) {
    return [
      [w2, -l2], // Bottom-Right
      [w2, l2],  // Top-Right
      [-w2, l2], // Top-Left
      [-w2, -l2] // Bottom-Left
    ];
  }

  const addArc = (cx: number, cy: number, startAngle: number, endAngle: number) => {
    for (let i = 0; i <= segmentsPerCorner; i++) {
      const angle = startAngle + (endAngle - startAngle) * (i / segmentsPerCorner);
      poly.push([
        cx + r * Math.cos(angle),
        cy + r * Math.sin(angle)
      ]);
    }
  };

  // Bottom-Right corner: -pi/2 to 0
  addArc(w2 - r, -l2 + r, -Math.PI / 2, 0);
  // Top-Right corner: 0 to pi/2
  addArc(w2 - r, l2 - r, 0, Math.PI / 2);
  // Top-Left corner: pi/2 to pi
  addArc(-w2 + r, l2 - r, Math.PI / 2, Math.PI);
  // Bottom-Left corner: pi to 3pi/2
  addArc(-w2 + r, -l2 + r, Math.PI, 3 * Math.PI / 2);

  return poly;
}

// Maps outer rounded rect index to inner rectangle corner (0: BL, 1: BR, 2: TR, 3: TL)
function getCornerForIndex(idx: number, K: number, w: number, l: number): [number, number] {
  const w2 = w / 2;
  const l2 = l / 2;
  
  if (K === 0) {
    if (idx === 0) return [w2, -l2];
    if (idx === 1) return [w2, l2];
    if (idx === 2) return [-w2, l2];
    return [-w2, -l2];
  }

  if (idx <= K) {
    return [w2, -l2]; // Bottom-Right corner
  } else if (idx <= 2 * K + 1) {
    return [w2, l2];  // Top-Right corner
  } else if (idx <= 3 * K + 2) {
    return [-w2, l2]; // Top-Left corner
  } else {
    return [-w2, -l2]; // Bottom-Left corner
  }
}

// Generates regular hexagon vertices CCW (flat top/bottom edges)
function getHexagonPolygon(flatToFlatWidth: number): [number, number][] {
  const r = flatToFlatWidth / Math.sqrt(3);
  const poly: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    poly.push([
      r * Math.cos(angle),
      r * Math.sin(angle)
    ]);
  }
  return poly;
}

// Helper to compute coordinates of the active hanger holes
export function getHangerHoles(
  params: FrameParams,
  wOut: number,
  lOut: number,
  wPocket: number,
  lPocket: number
): { cx: number; cy: number }[] {
  const { hangerEnabled, hangerSide, hangerCount } = params;
  if (!hangerEnabled) return [];

  const centers: { cx: number; cy: number }[] = [];

  const yTop = (lPocket / 2 + lOut / 2) / 2;
  const yBottom = (-lOut / 2 - lPocket / 2) / 2;
  const xLeft = (-wOut / 2 - wPocket / 2) / 2;
  const xRight = (wPocket / 2 + wOut / 2) / 2;

  if (hangerSide === 'top') {
    if (hangerCount === 1) {
      centers.push({ cx: 0, cy: yTop });
    } else {
      centers.push({ cx: wOut / 6, cy: yTop });
      centers.push({ cx: -wOut / 6, cy: yTop });
    }
  } else if (hangerSide === 'bottom') {
    if (hangerCount === 1) {
      centers.push({ cx: 0, cy: yBottom });
    } else {
      centers.push({ cx: -wOut / 6, cy: yBottom });
      centers.push({ cx: wOut / 6, cy: yBottom });
    }
  } else if (hangerSide === 'left') {
    if (hangerCount === 1) {
      centers.push({ cx: xLeft, cy: 0 });
    } else {
      centers.push({ cx: xLeft, cy: lOut / 6 });
      centers.push({ cx: xLeft, cy: -lOut / 6 });
    }
  } else if (hangerSide === 'right') {
    if (hangerCount === 1) {
      centers.push({ cx: xRight, cy: 0 });
    } else {
      centers.push({ cx: xRight, cy: -lOut / 6 });
      centers.push({ cx: xRight, cy: lOut / 6 });
    }
  }

  return centers;
}

function getPolygonArea(points: [number, number][]): number {
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length;
    twiceArea += points[i][0] * points[next][1] - points[next][0] * points[i][1];
  }
  return Math.abs(twiceArea) / 2;
}

/**
 * Generates the frame geometry as unindexed position and normal arrays.
 */
export function generateFrameGeometry(params: FrameParams): {
  positions: Float32Array;
  normals: Float32Array;
} {
  const validationErrors = validateFrameParams(params);
  if (validationErrors.length > 0) {
    throw new RangeError(validationErrors.join(' '));
  }

  const positions: number[] = [];
  const normals: number[] = [];

  const {
    shape,
    tBorder,
    height,
    dPocket,
    sShelf,
    cornerRadius,
    hangerEnabled,
    hangerSide,
    hangerDiameter
  } = params;

  // 1. DIMENSION PREPARATION
  const dimensions = getEffectiveFrameDimensions(params);
  const wPocket = dimensions.pocketWidth;
  const lPocket = dimensions.pocketLength;
  const wOut = dimensions.outerWidth;
  const lOut = dimensions.outerLength;
  
  const maxShelf = Math.min(wPocket, lPocket) / 2 - 2;
  const actualShelf = Math.min(sShelf, maxShelf);
  
  const wHole = wPocket - 2 * actualShelf;
  const lHole = lPocket - 2 * actualShelf;
  const hShelf = Math.max(0.2, height - dPocket);

  const z0 = 0;
  const z1 = hShelf;
  const z2 = height;

  // Retrieve active hanger hole positions
  const centers = getHangerHoles(params, wOut, lOut, wPocket, lPocket);

  // The selected back-face rail is triangulated around the exact dodecagon
  // boundaries used by the cylindrical walls. This keeps the opening watertight.
  const addHangerSegment = (
    p1: [number, number],
    p2: [number, number],
    c1: [number, number],
    c2: [number, number],
    _side: 'top' | 'bottom' | 'left' | 'right',
    zLevel: number,
    nz: number
  ) => {
    const diameter = Math.min(hangerDiameter, tBorder - 2);
    const contour: [number, number][] = [p2, p1, c1, c2];
    const holeContours = centers.map(center => getCirclePolygon(center.cx, center.cy, diameter));
    addPolygonFaceWithHoles(positions, normals, contour, holeContours, zLevel, [0, 0, nz]);
  };

  if (shape === 'hex') {
    // === HEXAGONAL FRAME GENERATION ===
    const polyOut = getHexagonPolygon(wOut);
    const polyPocket = getHexagonPolygon(wPocket);
    const polyHole = getHexagonPolygon(wHole);
    const N = 6;

    // A. Bottom Hexagonal Ring (Z = 0, normal = -Z)
    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      addFace(
        positions, normals,
        [polyOut[next][0], polyOut[next][1], z0],
        [polyOut[i][0], polyOut[i][1], z0],
        [polyHole[i][0], polyHole[i][1], z0],
        [polyHole[next][0], polyHole[next][1], z0],
        [0, 0, -1]
      );
    }

    // B. Top Hexagonal Ring (Z = height, normal = +Z)
    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      addFace(
        positions, normals,
        [polyOut[i][0], polyOut[i][1], z2],
        [polyOut[next][0], polyOut[next][1], z2],
        [polyPocket[next][0], polyPocket[next][1], z2],
        [polyPocket[i][0], polyPocket[i][1], z2],
        [0, 0, 1]
      );
    }

    // C. Shelf Hexagonal Ring (Z = hShelf, normal = +Z)
    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      addFace(
        positions, normals,
        [polyPocket[i][0], polyPocket[i][1], z1],
        [polyPocket[next][0], polyPocket[next][1], z1],
        [polyHole[next][0], polyHole[next][1], z1],
        [polyHole[i][0], polyHole[i][1], z1],
        [0, 0, 1]
      );
    }

    // D. Outer Vertical Walls (Z from 0 to height, normal = outward)
    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      const dx = polyOut[next][0] - polyOut[i][0];
      const dy = polyOut[next][1] - polyOut[i][1];
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = dy / len;
      const ny = -dx / len;

      addFace(
        positions, normals,
        [polyOut[i][0], polyOut[i][1], z0],
        [polyOut[next][0], polyOut[next][1], z0],
        [polyOut[next][0], polyOut[next][1], z2],
        [polyOut[i][0], polyOut[i][1], z2],
        [nx, ny, 0]
      );
    }

    // E. Inner Pocket Vertical Walls (Z from hShelf to height, normal = inward)
    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      const dx = polyPocket[next][0] - polyPocket[i][0];
      const dy = polyPocket[next][1] - polyPocket[i][1];
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len;
      const ny = dx / len;

      addFace(
        positions, normals,
        [polyPocket[next][0], polyPocket[next][1], z1],
        [polyPocket[i][0], polyPocket[i][1], z1],
        [polyPocket[i][0], polyPocket[i][1], z2],
        [polyPocket[next][0], polyPocket[next][1], z2],
        [nx, ny, 0]
      );
    }

    // F. Inner Hole Vertical Walls (Z from 0 to hShelf, normal = inward)
    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      const dx = polyHole[next][0] - polyHole[i][0];
      const dy = polyHole[next][1] - polyHole[i][1];
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len;
      const ny = dx / len;

      addFace(
        positions, normals,
        [polyHole[next][0], polyHole[next][1], z0],
        [polyHole[i][0], polyHole[i][1], z0],
        [polyHole[i][0], polyHole[i][1], z1],
        [polyHole[next][0], polyHole[next][1], z1],
        [nx, ny, 0]
      );
    }

  } else {
    // === RECTANGULAR FRAME GENERATION (UNIFIED PATH) ===

    // Coordinates for simple rectangle walls
    const x1 = -wPocket / 2;
    const x2 = -wHole / 2;
    const x3 = wHole / 2;
    const x4 = wPocket / 2;

    const y1 = -lPocket / 2;
    const y2 = -lHole / 2;
    const y3 = lHole / 2;
    const y4 = lPocket / 2;



    const K = cornerRadius > 0 ? 8 : 0; // Segments per corner
    const polyOut = getRoundedRectPolygon(wOut, lOut, cornerRadius, K);
    const N = polyOut.length;

    // Helper to check which side a segment is on
    const getSegmentSide = (p1: [number, number], p2: [number, number]): 'top' | 'bottom' | 'left' | 'right' | 'other' => {
      const isTop = Math.abs(p1[1] - lOut / 2) < 1e-4 && Math.abs(p2[1] - lOut / 2) < 1e-4;
      if (isTop) return 'top';
      const isBottom = Math.abs(p1[1] - (-lOut / 2)) < 1e-4 && Math.abs(p2[1] - (-lOut / 2)) < 1e-4;
      if (isBottom) return 'bottom';
      const isLeft = Math.abs(p1[0] - (-wOut / 2)) < 1e-4 && Math.abs(p2[0] - (-wOut / 2)) < 1e-4;
      if (isLeft) return 'left';
      const isRight = Math.abs(p1[0] - wOut / 2) < 1e-4 && Math.abs(p2[0] - wOut / 2) < 1e-4;
      if (isRight) return 'right';
      return 'other';
    };

    // A. Bottom Ring (Z = 0, normal = -Z, outer is rounded, inner hole is sharp rectangle)
    // Hanger holes open on THIS face (back face = print bed side).
    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      const c1 = getCornerForIndex(i, K, wHole, lHole);
      const c2 = getCornerForIndex(next, K, wHole, lHole);

      const side = getSegmentSide(polyOut[i], polyOut[next]);

      if (hangerEnabled && side === hangerSide && tBorder > 4 && height > 4) {
        // Render ring face with hole slots; nz=-1 for bottom face
        addHangerSegment(polyOut[i], polyOut[next], c1, c2, side, z0, -1);
      } else if (c1[0] === c2[0] && c1[1] === c2[1]) {
        addTriangleFace(
          positions, normals,
          [polyOut[next][0], polyOut[next][1], z0],
          [polyOut[i][0], polyOut[i][1], z0],
          [c1[0], c1[1], z0],
          [0, 0, -1]
        );
      } else {
        addFace(
          positions, normals,
          [polyOut[next][0], polyOut[next][1], z0],
          [polyOut[i][0], polyOut[i][1], z0],
          [c1[0], c1[1], z0],
          [c2[0], c2[1], z0],
          [0, 0, -1]
        );
      }
    }

    // B. Top Ring (Z = height, normal = +Z, outer is rounded, inner pocket is sharp rectangle)
    // No hanger holes on the front/top face — they are now on the bottom (A).
    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      const c1 = getCornerForIndex(i, K, wPocket, lPocket);
      const c2 = getCornerForIndex(next, K, wPocket, lPocket);

      if (c1[0] === c2[0] && c1[1] === c2[1]) {
        addTriangleFace(
          positions, normals,
          [polyOut[i][0], polyOut[i][1], z2],
          [polyOut[next][0], polyOut[next][1], z2],
          [c1[0], c1[1], z2],
          [0, 0, 1]
        );
      } else {
        addFace(
          positions, normals,
          [polyOut[i][0], polyOut[i][1], z2],
          [polyOut[next][0], polyOut[next][1], z2],
          [c2[0], c2[1], z2],
          [c1[0], c1[1], z2],
          [0, 0, 1]
        );
      }
    }

    // C. Outer Vertical Walls (Z from 0 to height, rounded outer profile)
    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      const dx = polyOut[next][0] - polyOut[i][0];
      const dy = polyOut[next][1] - polyOut[i][1];
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = dy / len;
      const ny = -dx / len;

      addFace(
        positions,
        normals,
        [polyOut[i][0], polyOut[i][1], z0],
        [polyOut[next][0], polyOut[next][1], z0],
        [polyOut[next][0], polyOut[next][1], z2],
        [polyOut[i][0], polyOut[i][1], z2],
        [nx, ny, 0]
      );
    }

    // D. Inner Pocket Vertical Walls (Z from hShelf to height, sharp rectangle)
    addFace(positions, normals, [x4, y1, z1], [x1, y1, z1], [x1, y1, z2], [x4, y1, z2], [0, 1, 0]);
    addFace(positions, normals, [x1, y4, z1], [x4, y4, z1], [x4, y4, z2], [x1, y4, z2], [0, -1, 0]);
    addFace(positions, normals, [x1, y1, z1], [x1, y4, z1], [x1, y4, z2], [x1, y1, z2], [1, 0, 0]);
    addFace(positions, normals, [x4, y4, z1], [x4, y1, z1], [x4, y1, z2], [x4, y4, z2], [-1, 0, 0]);

    // E. Inner Hole Vertical Walls (Z from 0 to hShelf, sharp rectangle)
    addFace(positions, normals, [x3, y2, z0], [x2, y2, z0], [x2, y2, z1], [x3, y2, z1], [0, 1, 0]);
    addFace(positions, normals, [x2, y3, z0], [x3, y3, z0], [x3, y3, z1], [x2, y3, z1], [0, -1, 0]);
    addFace(positions, normals, [x2, y2, z0], [x2, y3, z0], [x2, y3, z1], [x2, y2, z1], [1, 0, 0]);
    addFace(positions, normals, [x3, y3, z0], [x3, y2, z0], [x3, y2, z1], [x3, y3, z1], [-1, 0, 0]);

    // F. Shelf Ring (Z = hShelf, sharp rectangle ring facing +Z)
    addFace(positions, normals, [x1, y1, z1], [x4, y1, z1], [x3, y2, z1], [x2, y2, z1], [0, 0, 1]);
    addFace(positions, normals, [x4, y4, z1], [x1, y4, z1], [x2, y3, z1], [x3, y3, z1], [0, 0, 1]);
    addFace(positions, normals, [x1, y4, z1], [x1, y1, z1], [x2, y2, z1], [x2, y3, z1], [0, 0, 1]);
    addFace(positions, normals, [x4, y1, z1], [x4, y4, z1], [x3, y3, z1], [x3, y2, z1], [0, 0, 1]);

    // G. Render Cylindrical Hanger Holes if enabled.
    // Holes open from the bottom face (z0 = 0, print bed / back of frame) and drill upward.
    if (hangerEnabled && tBorder > 4 && height > 4) {
      const S = Math.min(hangerDiameter, tBorder - 2);
      const D = S;
      const depth = Math.min(height - 2, 8);
      for (const c of centers) {
        addCylindricalHole(positions, normals, c.cx, c.cy, D, depth, z0, true);
      }
    }
  }

  return orientTriangleMesh(new Float32Array(positions));
}

/**
 * Calculates the exact volume of the frame mesh in cubic millimeters (mm³).
 */
export function calculateFrameVolume(params: FrameParams): number {
  const {
    shape,
    tBorder,
    height,
    dPocket,
    sShelf,
    cornerRadius,
    hangerEnabled,
    hangerCount,
    hangerDiameter
  } = params;

  const dimensions = getEffectiveFrameDimensions(params);
  const wPocket = dimensions.pocketWidth;
  const lPocket = dimensions.pocketLength;
  const wOut = dimensions.outerWidth;
  const lOut = dimensions.outerLength;
  
  const maxShelf = Math.min(wPocket, lPocket) / 2 - 2;
  const actualShelf = Math.min(sShelf, maxShelf);
  
  const wHole = wPocket - 2 * actualShelf;
  const lHole = lPocket - 2 * actualShelf;
  const hShelf = Math.max(0.2, height - dPocket);

  let outerVolume: number;
  let pocketVolume: number;
  let holeVolume: number;

  if (shape === 'hex') {
    // Area of regular hexagon = (sqrt(3)/2) * flatToFlat^2
    const hexFactor = Math.sqrt(3) / 2;
    outerVolume = hexFactor * wOut * wOut * height;
    pocketVolume = hexFactor * wPocket * wPocket * dPocket;
    holeVolume = hexFactor * wHole * wHole * hShelf;
  } else {
    const r = Math.min(cornerRadius, wOut / 2, lOut / 2);
    const outerArea = getPolygonArea(getRoundedRectPolygon(wOut, lOut, r));

    outerVolume = outerArea * height;
    pocketVolume = wPocket * lPocket * dPocket;
    holeVolume = wHole * lHole * hShelf;
  }

  let totalVolume = outerVolume - pocketVolume - holeVolume;

  // Subtract hanger hole cylinder volumes if enabled
  if (hangerEnabled && tBorder > 4 && height > 4) {
    const S = Math.min(hangerDiameter, tBorder - 2);
    const depth = Math.min(height - 2, 8);
    const holeArea = 0.5 * 12 * (S / 2) ** 2 * Math.sin((2 * Math.PI) / 12);
    const singleHoleVolume = holeArea * depth;
    totalVolume -= hangerCount * singleHoleVolume;
  }

  return Math.max(0, totalVolume);
}

export interface SplitPart {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
}

export function getBowtieDims(W: number, H: number, maxDepth = Number.POSITIVE_INFINITY) {
  const max_sum = (W - 2) * 1.4;
  const L_bowtie = Math.max(4, Math.min(20, max_sum * 0.6));
  const wEnds = Math.max(1.5, Math.min(12, max_sum * 0.4));
  const wNeck = wEnds / 2;
  const dBowtie = Math.max(0.2, Math.min(4.0, Math.max(0.2, H / 2 - 1), H - 2, maxDepth));
  return { L_bowtie, wEnds, wNeck, dBowtie };
}

// Standalone Bowtie Key
export function generateBowtieKeyGeometry(params: FrameParams): { positions: Float32Array; normals: Float32Array } {
  const validationErrors = validateFrameParams(params);
  if (validationErrors.length > 0) {
    throw new RangeError(validationErrors.join(' '));
  }

  const positions: number[] = [];
  const normals: number[] = [];
  
  const dimensions = getEffectiveFrameDimensions(params);
  const wPocket = dimensions.pocketWidth;
  const lPocket = dimensions.pocketLength;
  const maxShelf = Math.min(wPocket, lPocket) / 2 - 2;
  const actualShelf = Math.min(params.sShelf, maxShelf);
  const W = params.tBorder + actualShelf;
  const H = params.height;
  const hShelf = Math.max(0.2, params.height - params.dPocket);

  const { L_bowtie, wEnds, wNeck, dBowtie } = getBowtieDims(W, H, hShelf - 0.5);
  
  // Apply standard 0.3 mm clearance on mating faces for printing fit
  const L = L_bowtie - 0.3;
  const wE = wEnds - 0.3;
  const wN = wNeck - 0.3;
  const dB = dBowtie - 0.5;
  
  const p0: [number, number, number] = [-L/2, -wE/2, 0];
  const p1: [number, number, number] = [-L/2, wE/2, 0];
  const p2: [number, number, number] = [0, wN/2, 0];
  const p3: [number, number, number] = [L/2, wE/2, 0];
  const p4: [number, number, number] = [L/2, -wE/2, 0];
  const p5: [number, number, number] = [0, -wN/2, 0];
  
  const q0: [number, number, number] = [-L/2, -wE/2, dB];
  const q1: [number, number, number] = [-L/2, wE/2, dB];
  const q2: [number, number, number] = [0, wN/2, dB];
  const q3: [number, number, number] = [L/2, wE/2, dB];
  const q4: [number, number, number] = [L/2, -wE/2, dB];
  const q5: [number, number, number] = [0, -wN/2, dB];
  
  const addTri = (v0: [number, number, number], v1: [number, number, number], v2: [number, number, number], n: [number, number, number]) => {
    const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    if (Math.hypot(nx, ny, nz) < 1e-10) return;
    const dot = nx * n[0] + ny * n[1] + nz * n[2];
    if (dot < 0) {
      positions.push(...v0, ...v2, ...v1);
    } else {
      positions.push(...v0, ...v1, ...v2);
    }
    normals.push(...n, ...n, ...n);
  };
  
  const addQ = (v0: [number, number, number], v1: [number, number, number], v2: [number, number, number], v3: [number, number, number], n: [number, number, number]) => {
    addTri(v0, v1, v2, n);
    addTri(v0, v2, v3, n);
  };

  addTri(p0, p5, p1, [0, 0, -1]);
  addTri(p1, p5, p2, [0, 0, -1]);
  addTri(p2, p5, p4, [0, 0, -1]);
  addTri(p2, p4, p3, [0, 0, -1]);
  
  addTri(q0, q1, q5, [0, 0, 1]);
  addTri(q1, q2, q5, [0, 0, 1]);
  addTri(q2, q4, q5, [0, 0, 1]);
  addTri(q2, q3, q4, [0, 0, 1]);
  
  addQ(p0, p1, q1, q0, [-1, 0, 0]);
  
  const nx2 = (wE - wN) / 2;
  const ny2 = L / 2;
  const n2 = [nx2, ny2, 0] as [number, number, number];
  const len2 = Math.sqrt(n2[0]**2 + n2[1]**2);
  n2[0] /= len2; n2[1] /= len2;
  addQ(p1, p2, q2, q1, n2);
  
  const nx3 = -(wE - wN) / 2;
  const ny3 = L / 2;
  const n3 = [nx3, ny3, 0] as [number, number, number];
  const len3 = Math.sqrt(n3[0]**2 + n3[1]**2);
  n3[0] /= len3; n3[1] /= len3;
  addQ(p2, p3, q3, q2, n3);
  
  addQ(p3, p4, q4, q3, [1, 0, 0]);
  
  const nx5 = -(wE - wN) / 2;
  const ny5 = -L / 2;
  const n5 = [nx5, ny5, 0] as [number, number, number];
  const len5 = Math.sqrt(n5[0]**2 + n5[1]**2);
  n5[0] /= len5; n5[1] /= len5;
  addQ(p4, p5, q5, q4, n5);
  
  const nx6 = (wE - wN) / 2;
  const ny6 = -L / 2;
  const n6 = [nx6, ny6, 0] as [number, number, number];
  const len6 = Math.sqrt(n6[0]**2 + n6[1]**2);
  n6[0] /= len6; n6[1] /= len6;
  addQ(p5, p0, q0, q5, n6);
  
  return orientTriangleMesh(new Float32Array(positions));
}

type Point3 = [number, number, number];

/** Reorient each connected triangle component consistently and recompute facet normals. */
function orientTriangleMesh(positions: ArrayLike<number>): {
  positions: Float32Array;
  normals: Float32Array;
} {
  if (positions.length % 9 !== 0) {
    throw new RangeError('Generated geometry must contain complete triangles.');
  }

  type EdgeUse = { triangle: number; direction: 1 | -1 };
  type Neighbor = { triangle: number; sameDirection: boolean };
  const triangleCount = positions.length / 9;
  const edges = new Map<string, EdgeUse[]>();
  const keyOf = (offset: number) => [0, 1, 2]
    .map(axis => Math.round(positions[offset + axis] * 1e4))
    .join(',');

  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const offset = triangle * 9;
    const keys = [keyOf(offset), keyOf(offset + 3), keyOf(offset + 6)] as [string, string, string];
    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
      const start = keys[edgeIndex];
      const end = keys[(edgeIndex + 1) % 3];
      const [first, second] = start < end ? [start, end] : [end, start];
      const edgeKey = `${first}|${second}`;
      const uses = edges.get(edgeKey) ?? [];
      uses.push({ triangle, direction: start === first ? 1 : -1 });
      if (uses.length > 2) {
        throw new RangeError('Generated geometry contains a non-manifold edge.');
      }
      edges.set(edgeKey, uses);
    }
  }

  const adjacency: Neighbor[][] = Array.from({ length: triangleCount }, () => []);
  for (const uses of edges.values()) {
    if (uses.length !== 2) continue;
    const [first, second] = uses;
    const sameDirection = first.direction === second.direction;
    adjacency[first.triangle].push({ triangle: second.triangle, sameDirection });
    adjacency[second.triangle].push({ triangle: first.triangle, sameDirection });
  }

  const flipByTriangle: (boolean | undefined)[] = Array(triangleCount).fill(undefined);
  const components: number[][] = [];
  for (let seed = 0; seed < triangleCount; seed++) {
    if (flipByTriangle[seed] !== undefined) continue;
    flipByTriangle[seed] = false;
    const component: number[] = [];
    const pending = [seed];
    while (pending.length > 0) {
      const triangle = pending.pop()!;
      component.push(triangle);
      const flip = flipByTriangle[triangle]!;
      for (const neighbor of adjacency[triangle]) {
        const neighborFlip = neighbor.sameDirection ? !flip : flip;
        const assigned = flipByTriangle[neighbor.triangle];
        if (assigned === undefined) {
          flipByTriangle[neighbor.triangle] = neighborFlip;
          pending.push(neighbor.triangle);
        } else if (assigned !== neighborFlip) {
          throw new RangeError('Generated geometry has inconsistent triangle winding.');
        }
      }
    }
    components.push(component);
  }

  const orientedPositions = new Float32Array(positions.length);
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const offset = triangle * 9;
    for (let index = 0; index < 9; index++) {
      orientedPositions[offset + index] = positions[offset + index];
    }
    if (flipByTriangle[triangle]) {
      for (let axis = 0; axis < 3; axis++) {
        const second = orientedPositions[offset + 3 + axis];
        orientedPositions[offset + 3 + axis] = orientedPositions[offset + 6 + axis];
        orientedPositions[offset + 6 + axis] = second;
      }
    }
  }

  const normals = new Float32Array(positions.length);
  for (let componentIndex = 0; componentIndex < components.length; componentIndex++) {
    const component = components[componentIndex];
    const reference: Point3 = [0, 0, 0];
    for (const triangle of component) {
      const offset = triangle * 9;
      for (let vertex = 0; vertex < 3; vertex++) {
        for (let axis = 0; axis < 3; axis++) {
          reference[axis] += orientedPositions[offset + vertex * 3 + axis] / (component.length * 3);
        }
      }
    }

    let signedVolume = 0;
    for (const triangle of component) {
      const offset = triangle * 9;
      const a: Point3 = [0, 1, 2].map(axis => orientedPositions[offset + axis] - reference[axis]) as Point3;
      const b: Point3 = [0, 1, 2].map(axis => orientedPositions[offset + 3 + axis] - reference[axis]) as Point3;
      const c: Point3 = [0, 1, 2].map(axis => orientedPositions[offset + 6 + axis] - reference[axis]) as Point3;
      signedVolume += (
        a[0] * (b[1] * c[2] - b[2] * c[1])
        + a[1] * (b[2] * c[0] - b[0] * c[2])
        + a[2] * (b[0] * c[1] - b[1] * c[0])
      ) / 6;
    }

    if (signedVolume < 0) {
      for (const triangle of component) {
        const offset = triangle * 9;
        for (let axis = 0; axis < 3; axis++) {
          const second = orientedPositions[offset + 3 + axis];
          orientedPositions[offset + 3 + axis] = orientedPositions[offset + 6 + axis];
          orientedPositions[offset + 6 + axis] = second;
        }
      }
    }
  }

  for (let offset = 0; offset < orientedPositions.length; offset += 9) {
    const ab: Point3 = [
      orientedPositions[offset + 3] - orientedPositions[offset],
      orientedPositions[offset + 4] - orientedPositions[offset + 1],
      orientedPositions[offset + 5] - orientedPositions[offset + 2]
    ];
    const ac: Point3 = [
      orientedPositions[offset + 6] - orientedPositions[offset],
      orientedPositions[offset + 7] - orientedPositions[offset + 1],
      orientedPositions[offset + 8] - orientedPositions[offset + 2]
    ];
    const normal: Point3 = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0]
    ];
    const length = Math.hypot(...normal);
    if (length > 1e-12) {
      for (let axis = 0; axis < 3; axis++) {
        normals[offset + axis] = normal[axis] / length;
        normals[offset + 3 + axis] = normal[axis] / length;
        normals[offset + 6 + axis] = normal[axis] / length;
      }
    }
  }

  return { positions: orientedPositions, normals };
}

/** Split triangle edges at existing collinear vertices to remove mesh T-junctions. */
function conformTriangleMesh(
  positions: number[],
  normals: number[]
): { positions: number[]; normals: number[] } {
  const triangleCount = positions.length / 9;
  if (triangleCount < 2) return { positions, normals };

  const vertexByKey = new Map<string, Point3>();
  const keyOf = (point: Point3) => point.map(value => Math.round(value * 1e4)).join(',');
  const triangles: Array<{ points: [Point3, Point3, Point3]; normal: Point3 }> = [];
  const edgeUse = new Map<string, number>();
  const edgeKey = (a: Point3, b: Point3) => [keyOf(a), keyOf(b)].sort().join('|');

  for (let offset = 0; offset < positions.length; offset += 9) {
    const points = [
      positions.slice(offset, offset + 3) as Point3,
      positions.slice(offset + 3, offset + 6) as Point3,
      positions.slice(offset + 6, offset + 9) as Point3
    ] as [Point3, Point3, Point3];
    const normal = normals.slice(offset, offset + 3) as Point3;
    triangles.push({ points, normal });
    for (const point of points) vertexByKey.set(keyOf(point), point);
    for (let index = 0; index < 3; index++) {
      const key = edgeKey(points[index], points[(index + 1) % 3]);
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    }
  }

  const unmatchedEdges = [...edgeUse.keys()].filter(key => edgeUse.get(key) === 1);
  if (unmatchedEdges.length === 0) return { positions, normals };

  const vertices = [...vertexByKey.values()];
  const sortedByAxis = [0, 1, 2].map(axis => (
    [...vertices].sort((a, b) => a[axis] - b[axis])
  ));
  const lowerBound = (values: Point3[], axis: number, target: number) => {
    let low = 0;
    let high = values.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (values[middle][axis] < target) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const edgeSplits = new Map<string, Point3[]>();
  const tolerance = 1e-4;

  for (const edge of unmatchedEdges) {
    const [aKey, bKey] = edge.split('|');
    const a = vertexByKey.get(aKey);
    const b = vertexByKey.get(bKey);
    if (!a || !b) continue;
    const direction: Point3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const lengthSquared = direction.reduce((sum, value) => sum + value * value, 0);
    if (lengthSquared < tolerance * tolerance) continue;
    const axis = direction.reduce((best, value, index) => (
      Math.abs(value) > Math.abs(direction[best]) ? index : best
    ), 0);
    const candidates = sortedByAxis[axis];
    const minimum = Math.min(a[axis], b[axis]) + tolerance;
    const maximum = Math.max(a[axis], b[axis]) - tolerance;
    const splits: Array<{ t: number; point: Point3 }> = [];
    for (let index = lowerBound(candidates, axis, minimum); index < candidates.length; index++) {
      const point = candidates[index];
      if (point[axis] > maximum) break;
      const relative: Point3 = [point[0] - a[0], point[1] - a[1], point[2] - a[2]];
      const t = relative.reduce((sum, value, component) => sum + value * direction[component], 0) / lengthSquared;
      if (t <= 1e-6 || t >= 1 - 1e-6) continue;
      const distance = Math.hypot(
        relative[0] - t * direction[0],
        relative[1] - t * direction[1],
        relative[2] - t * direction[2]
      );
      if (distance <= tolerance) splits.push({ t, point });
    }
    if (splits.length > 0) {
      splits.sort((first, second) => first.t - second.t);
      edgeSplits.set(edge, splits.map(split => split.point));
    }
  }

  if (edgeSplits.size === 0) return { positions, normals };

  const conformedPositions: number[] = [];
  const conformedNormals: number[] = [];
  for (const { points, normal } of triangles) {
    const boundary: Point3[] = [];
    let hasSplit = false;
    for (let index = 0; index < 3; index++) {
      const start = points[index];
      const end = points[(index + 1) % 3];
      boundary.push(start);
      const splits = edgeSplits.get(edgeKey(start, end)) ?? [];
      if (splits.length > 0) {
        hasSplit = true;
        const direction: Point3 = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
        const lengthSquared = direction.reduce((sum, value) => sum + value * value, 0);
        splits.sort((first, second) => {
          const firstT = (first[0] - start[0]) * direction[0]
            + (first[1] - start[1]) * direction[1]
            + (first[2] - start[2]) * direction[2];
          const secondT = (second[0] - start[0]) * direction[0]
            + (second[1] - start[1]) * direction[1]
            + (second[2] - start[2]) * direction[2];
          return firstT / lengthSquared - secondT / lengthSquared;
        });
        boundary.push(...splits);
      }
    }
    if (!hasSplit) {
      addTriangleFace(conformedPositions, conformedNormals, points[0], points[1], points[2], normal);
      continue;
    }

    const center: Point3 = [
      (points[0][0] + points[1][0] + points[2][0]) / 3,
      (points[0][1] + points[1][1] + points[2][1]) / 3,
      (points[0][2] + points[1][2] + points[2][2]) / 3
    ];
    for (let index = 0; index < boundary.length; index++) {
      addTriangleFace(
        conformedPositions,
        conformedNormals,
        center,
        boundary[index],
        boundary[(index + 1) % boundary.length],
        normal
      );
    }
  }
  return { positions: conformedPositions, normals: conformedNormals };
}

/** Close simple planar gaps left by collapsed contour vertices in Earcut's output. */
function closePlanarBoundaryLoops(
  positions: number[],
  normals: number[]
): { positions: number[]; normals: number[] } {
  type BoundaryEdge = { start: Point3; end: Point3; startKey: string; endKey: string };
  const keyOf = (point: Point3) => point.map(value => Math.round(value * 1e4)).join(',');
  const edges = new Map<string, { count: number; edge: BoundaryEdge }>();
  for (let offset = 0; offset < positions.length; offset += 9) {
    const points = [
      positions.slice(offset, offset + 3) as Point3,
      positions.slice(offset + 3, offset + 6) as Point3,
      positions.slice(offset + 6, offset + 9) as Point3
    ] as [Point3, Point3, Point3];
    for (let index = 0; index < 3; index++) {
      const start = points[index];
      const end = points[(index + 1) % 3];
      const startKey = keyOf(start);
      const endKey = keyOf(end);
      const key = [startKey, endKey].sort().join('|');
      const entry = edges.get(key);
      if (entry) entry.count++;
      else edges.set(key, { count: 1, edge: { start, end, startKey, endKey } });
    }
  }

  const openEdges = [...edges.values()].filter(entry => entry.count === 1).map(entry => entry.edge);
  if (openEdges.length < 3) return { positions, normals };
  const adjacency = new Map<string, { point: Point3; neighbors: Set<string> }>();
  for (const edge of openEdges) {
    const start = adjacency.get(edge.startKey) ?? { point: edge.start, neighbors: new Set<string>() };
    const end = adjacency.get(edge.endKey) ?? { point: edge.end, neighbors: new Set<string>() };
    start.neighbors.add(edge.endKey);
    end.neighbors.add(edge.startKey);
    adjacency.set(edge.startKey, start);
    adjacency.set(edge.endKey, end);
  }
  const visited = new Set<BoundaryEdge>();
  const visitedVertices = new Set<string>();
  const allMeshVertices = [...new Map(
    [...edges.values()].map(({ edge }) => [edge.startKey, edge.start] as const)
  ).values()];
  const meshCenter: Point3 = [0, 0, 0];
  for (const point of allMeshVertices) {
    meshCenter[0] += point[0] / allMeshVertices.length;
    meshCenter[1] += point[1] / allMeshVertices.length;
    meshCenter[2] += point[2] / allMeshVertices.length;
  }
  const positionsWithCaps = [...positions];
  const normalsWithCaps = [...normals];

  for (const first of openEdges) {
    if (visited.has(first) || visitedVertices.has(first.startKey)) continue;
    const component: BoundaryEdge[] = [];
    const pending = [first.startKey];
    const componentVertices = new Set<string>();
    while (pending.length > 0) {
      const currentKey = pending.pop()!;
      if (componentVertices.has(currentKey)) continue;
      componentVertices.add(currentKey);
      for (const neighbor of adjacency.get(currentKey)?.neighbors ?? []) pending.push(neighbor);
    }
    for (const edge of openEdges) {
      if (componentVertices.has(edge.startKey) && componentVertices.has(edge.endKey)) {
        component.push(edge);
        visited.add(edge);
      }
    }
    componentVertices.forEach(key => visitedVertices.add(key));
    if (component.length < 3 || [...componentVertices].some(key => adjacency.get(key)?.neighbors.size !== 2)) continue;

    const firstKey = component[0].startKey;
    const contour: Point3[] = [];
    let currentKey = firstKey;
    let previousKey: string | null = null;
    do {
      const vertex = adjacency.get(currentKey);
      if (!vertex) break;
      contour.push(vertex.point);
      const nextKey = [...vertex.neighbors].find(key => key !== previousKey);
      if (!nextKey) break;
      previousKey = currentKey;
      currentKey = nextKey;
    } while (currentKey !== firstKey && contour.length <= component.length);
    if (currentKey !== firstKey || contour.length !== component.length) continue;

    const newell: Point3 = [0, 0, 0];
    for (let index = 0; index < contour.length; index++) {
      const current = contour[index];
      const next = contour[(index + 1) % contour.length];
      newell[0] += (current[1] - next[1]) * (current[2] + next[2]);
      newell[1] += (current[2] - next[2]) * (current[0] + next[0]);
      newell[2] += (current[0] - next[0]) * (current[1] + next[1]);
    }
    const length = Math.hypot(...newell);
    if (length < 1e-8) continue;
    let boundaryNormal: Point3 = newell.map(value => value / length) as Point3;
    const origin = contour[0];
    if (contour.some(point => (
      Math.abs(
        (point[0] - origin[0]) * boundaryNormal[0]
        + (point[1] - origin[1]) * boundaryNormal[1]
        + (point[2] - origin[2]) * boundaryNormal[2]
      ) > 1e-4
    ))) continue;

    const loopCenter: Point3 = [0, 0, 0];
    for (const point of contour) {
      loopCenter[0] += point[0] / contour.length;
      loopCenter[1] += point[1] / contour.length;
      loopCenter[2] += point[2] / contour.length;
    }
    const outward: Point3 = [
      loopCenter[0] - meshCenter[0],
      loopCenter[1] - meshCenter[1],
      loopCenter[2] - meshCenter[2]
    ];
    if (outward[0] * boundaryNormal[0] + outward[1] * boundaryNormal[1] + outward[2] * boundaryNormal[2] < 0) {
      boundaryNormal = boundaryNormal.map(value => -value) as Point3;
    }

    const droppedAxis = boundaryNormal.reduce((best, value, index) => (
      Math.abs(value) > Math.abs(boundaryNormal[best]) ? index : best
    ), 0);
    const contour2D = contour.map(point => {
      if (droppedAxis === 0) return new Vector2(point[1], point[2]);
      if (droppedAxis === 1) return new Vector2(point[0], point[2]);
      return new Vector2(point[0], point[1]);
    });
    const triangles = ShapeUtils.triangulateShape(contour2D, []);
    const fillNormal: Point3 = boundaryNormal.map(value => -value) as Point3;
    for (const triangle of triangles) {
      const [a, b, c] = triangle.map(index => contour[index]);
      addTriangleFace(positionsWithCaps, normalsWithCaps, a, b, c, fillNormal);
    }
  }
  return { positions: positionsWithCaps, normals: normalsWithCaps };
}

function segmentJointTypes(params: FrameParams, index: number, count: number, hex = false): [string, string] {
  const jointType = hex && params.jointType === 'bowtie' ? 'half-lap' : params.jointType;
  if (hex) {
    const start = index === 0
      ? 'miter'
      : jointType === 'half-lap' ? 'half-lap-female' : 'dovetail-female';
    const end = index === count - 1
      ? 'miter'
      : jointType === 'half-lap' ? 'half-lap-male' : 'dovetail-male';
    return [start, end];
  }

  const start = index === 0
    ? jointType === 'bowtie' ? 'miter-bowtie' : 'miter'
    : jointType === 'half-lap' ? 'half-lap-female'
      : jointType === 'dovetail' ? 'dovetail-female' : 'flat-bowtie';
  const end = index === count - 1
    ? jointType === 'bowtie' ? 'miter-bowtie' : 'miter'
    : jointType === 'half-lap' ? 'half-lap-male'
      : jointType === 'dovetail' ? 'dovetail-male' : 'flat-bowtie';
  return [start, end];
}

function getSegmentLongitudinalSpan(positions: number[]): number {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < positions.length; index += 3) {
    min = Math.min(min, positions[index]);
    max = Math.max(max, positions[index]);
  }
  return max - min;
}

function createSafeSegmentBoundaries(
  length: number,
  params: FrameParams,
  W: number,
  centers: Array<{ cx: number; cy: number }>,
  side: 'top' | 'bottom' | 'left' | 'right',
  wOut: number,
  lOut: number,
  hex = false
): number[] {
  const effectiveJoint = hex && params.jointType === 'bowtie' ? 'half-lap' : params.jointType;
  const jointAllowance = effectiveJoint === 'half-lap' ? 7.5 : effectiveJoint === 'dovetail' ? 8.25 : 0;
  const maxNominalSpan = params.maxPartLength - jointAllowance - 0.25;
  if (maxNominalSpan <= 1) {
    throw new RangeError('Maximum part length is too small for the selected joint.');
  }

  const localHangers = params.hangerEnabled && !hex && side === params.hangerSide
    ? mapHangerCentersToRail(centers, side, wOut, lOut)
    : [];
  const hangerRadius = Math.max(0, Math.min(params.hangerDiameter, params.tBorder - 2) / 2);
  const jointDepth = effectiveJoint === 'half-lap' ? 7.5
    : effectiveJoint === 'dovetail' ? 8
      : getBowtieDims(W, params.height).L_bowtie / 2;
  const seamClearance = hangerRadius + jointDepth + 1;
  const keepouts = localHangers.map(({ u }) => u);
  const cornerClearance = !hex && params.jointType === 'bowtie' ? W + 0.5 : 0;
  const seamPlan = planSafeSplitBoundaries({
    length,
    maxPartLength: params.maxPartLength,
    maxNominalSpan,
    keepouts,
    seamClearance,
    cornerClearance
  });

  for (const boundaries of seamPlan.plans) {
    if (!boundaries) continue;
    const count = boundaries.length - 1;
    const actualFits = boundaries.slice(1).every((end, index) => {
      const [startJoint, endJoint] = segmentJointTypes(params, index, count, hex);
      const mesh = generateSegmentMesh(
        params,
        W,
        boundaries[index],
        end,
        startJoint,
        endJoint,
        side,
        centers,
        wOut,
        lOut
      );
      return getSegmentLongitudinalSpan(mesh.positions) <= params.maxPartLength + 1e-5;
    });
    if (actualFits) return boundaries;
  }

  if (seamPlan.hangerAndCornerBlocked && seamPlan.plans.every(plan => plan === null)) {
    throw new RangeError('The selected hanger side has no safe split seam between the bowtie corner joints. Increase that frame dimension, reduce hanger diameter or count, or choose a different joint.');
  }
  throw new RangeError('Unable to split the frame into parts within the requested maximum length.');
}

// Generates the geometry for all parts of a split frame
export function generateSplitFrameParts(params: FrameParams): SplitPart[] {
  const validationErrors = validateFrameParams(params);
  if (validationErrors.length > 0) {
    throw new RangeError(validationErrors.join(' '));
  }
  if (!Number.isFinite(params.maxPartLength) || params.maxPartLength <= 0) {
    throw new RangeError('Maximum part length must be a positive finite number.');
  }
  if (params.shape === 'rect' && params.cornerRadius > 0) {
    throw new RangeError('Rounded corners are not supported when splitting a rectangular frame.');
  }

  if (params.shape === 'hex') {
    const dimensions = getEffectiveFrameDimensions(params);
    const wPocket = dimensions.pocketWidth;
    const wOut = dimensions.outerWidth;
    const maxShelf = wPocket / 2 - 2;
    const actualShelf = Math.min(params.sShelf, maxShelf);
    const W = params.tBorder + actualShelf;

    const polyOut = getHexagonPolygon(wOut);
    const L = wOut / Math.sqrt(3); // side length

    const parts: SplitPart[] = [];
    const centers = hangerCenters(params);
    const boundaries = createSafeSegmentBoundaries(
      L, params, W, centers, 'top', wOut, wOut, true
    );
    const N = boundaries.length - 1;

    for (let sideIdx = 0; sideIdx < 6; sideIdx++) {
      const nextIdx = (sideIdx + 1) % 6;
      const p_start = polyOut[sideIdx];
      const p_end = polyOut[nextIdx];

      const dir_u = [
        (p_end[0] - p_start[0]) / L,
        (p_end[1] - p_start[1]) / L
      ];
      const dir_v = [-dir_u[1], dir_u[0]];

      for (let i = 0; i < N; i++) {
        const u1 = boundaries[i];
        const u2 = boundaries[i + 1];
        const [startJoint, endJoint] = segmentJointTypes(params, i, N, true);

        const segmentMesh = generateSegmentMesh(
          params, W, u1, u2, startJoint, endJoint, 'top', centers, L, wOut
        );

        const positions = new Float32Array(segmentMesh.positions.length);
        const normals = new Float32Array(segmentMesh.normals.length);

        const tx = (u: number, v: number, z: number, nu: number, nv: number, nz: number) => {
          const xGlobal = p_start[0] + u * dir_u[0] + v * dir_v[0];
          const yGlobal = p_start[1] + u * dir_u[1] + v * dir_v[1];
          const nxGlobal = nu * dir_u[0] + nv * dir_v[0];
          const nyGlobal = nu * dir_u[1] + nv * dir_v[1];
          return [xGlobal, yGlobal, z, nxGlobal, nyGlobal, nz];
        };

        for (let j = 0; j < segmentMesh.positions.length; j += 9) {
          const pt0 = tx(segmentMesh.positions[j], segmentMesh.positions[j+1], segmentMesh.positions[j+2], segmentMesh.normals[j], segmentMesh.normals[j+1], segmentMesh.normals[j+2]);
          const pt1 = tx(segmentMesh.positions[j+3], segmentMesh.positions[j+4], segmentMesh.positions[j+5], segmentMesh.normals[j+3], segmentMesh.normals[j+4], segmentMesh.normals[j+5]);
          const pt2 = tx(segmentMesh.positions[j+6], segmentMesh.positions[j+7], segmentMesh.positions[j+8], segmentMesh.normals[j+6], segmentMesh.normals[j+7], segmentMesh.normals[j+8]);

          positions[j] = pt0[0];
          positions[j+1] = pt0[1];
          positions[j+2] = pt0[2];
          normals[j] = pt0[3];
          normals[j+1] = pt0[4];
          normals[j+2] = pt0[5];

          positions[j+3] = pt1[0];
          positions[j+4] = pt1[1];
          positions[j+5] = pt1[2];
          normals[j+3] = pt1[3];
          normals[j+4] = pt1[4];
          normals[j+5] = pt1[5];

          positions[j+6] = pt2[0];
          positions[j+7] = pt2[1];
          positions[j+8] = pt2[2];
          normals[j+6] = pt2[3];
          normals[j+7] = pt2[4];
          normals[j+8] = pt2[5];
        }

        const sideLabel = `Side ${sideIdx + 1}`;
        const segmentLabel = N > 1 ? ` - Part ${i + 1}` : '';
        const orientedMesh = orientTriangleMesh(positions);
        parts.push({
          name: `${sideLabel}${segmentLabel}`,
          positions: orientedMesh.positions,
          normals: orientedMesh.normals
        });
      }
    }
    return parts;
  }

  const dimensions = getEffectiveFrameDimensions(params);
  const wPocket = dimensions.pocketWidth;
  const lPocket = dimensions.pocketLength;
  const wOut = dimensions.outerWidth;
  const lOut = dimensions.outerLength;
  
  const maxShelf = Math.min(wPocket, lPocket) / 2 - 2;
  const actualShelf = Math.min(params.sShelf, maxShelf);
  
  const W = params.tBorder + actualShelf;

  // Keyhole hangers mapping helper
  const centers = hangerCenters(params);

  const parts: SplitPart[] = [];

  const sides: Array<{ side: 'top' | 'bottom' | 'left' | 'right'; L: number }> = [
    { side: 'top', L: wOut },
    { side: 'bottom', L: wOut },
    { side: 'left', L: lOut },
    { side: 'right', L: lOut }
  ];

  sides.forEach(({ side, L }) => {
    const boundaries = createSafeSegmentBoundaries(L, params, W, centers, side, wOut, lOut);
    const N = boundaries.length - 1;

    for (let i = 0; i < N; i++) {
      const u1 = boundaries[i];
      const u2 = boundaries[i + 1];
      const [startJoint, endJoint] = segmentJointTypes(params, i, N);

      const segmentMesh = generateSegmentMesh(
        params, W, u1, u2, startJoint, endJoint, side, centers, wOut, lOut
      );

      const globalMesh = transformLocalToGlobal(segmentMesh.positions, segmentMesh.normals, side, L, wOut, lOut);

      // Name parts intuitively
      const sideNameMap = { top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right' };
      const segmentLabel = N > 1 ? ` - Part ${i + 1}` : '';
      const orientedMesh = orientTriangleMesh(globalMesh.positions);
      parts.push({
        name: `${sideNameMap[side]}${segmentLabel}`,
        positions: orientedMesh.positions,
        normals: orientedMesh.normals
      });
    }
  });

  return parts;
}

function hangerCenters(params: FrameParams) {
  const dimensions = getEffectiveFrameDimensions(params);
  return getHangerHoles(
    params,
    dimensions.outerWidth,
    dimensions.outerLength,
    dimensions.pocketWidth,
    dimensions.pocketLength
  );
}

function mapHangerCentersToRail(
  centers: Array<{ cx: number; cy: number }>,
  side: 'top' | 'bottom' | 'left' | 'right',
  wOut: number,
  lOut: number
): Array<{ u: number; v: number }> {
  return centers.map(({ cx, cy }) => {
    if (side === 'top') return { u: cx + wOut / 2, v: lOut / 2 - cy };
    if (side === 'bottom') return { u: wOut / 2 - cx, v: cy + lOut / 2 };
    if (side === 'left') return { u: cy + lOut / 2, v: cx + wOut / 2 };
    return { u: lOut / 2 - cy, v: wOut / 2 - cx };
  });
}

// Generate the local coordinates mesh for a single rail segment
function generateSegmentMesh(
  params: FrameParams,
  W: number,
  u1: number,
  u2: number,
  startJoint: string,
  endJoint: string,
  side: 'top' | 'bottom' | 'left' | 'right',
  centers: Array<{ cx: number; cy: number }>,
  wOut: number,
  lOut: number
): { positions: number[]; normals: number[] } {
  const positions: number[] = [];
  const normals: number[] = [];

  const H = params.height;
  const hShelf = Math.max(0.2, params.height - params.dPocket);
  const halfLapHeight = params.jointType === 'half-lap' && hShelf <= H / 2
    ? Math.max(0.5, hShelf - 0.5)
    : H / 2;
  const profileMidHeight = params.jointType === 'half-lap'
    ? halfLapHeight
    : Math.min(H / 2, hShelf);
  const tBorder = params.tBorder;
  const L_lap = 15;
  const { L_bowtie, wEnds, wNeck, dBowtie } = getBowtieDims(W, H, params.height - params.dPocket - 0.5);
  const L_dove = 8;
  const hangerDiameter = Math.min(params.hangerDiameter, tBorder - 2);
  const localHangers = params.hangerEnabled && side === params.hangerSide
    ? mapHangerCentersToRail(centers, side, wOut, lOut).filter(({ u, v }) => (
      u >= u1 && u <= u2 && v >= hangerDiameter / 2 && v <= tBorder - hangerDiameter / 2
    ))
    : [];
  const segmentHangers = localHangers.filter(({ u }) => u >= u1 && u < u2);

  const hasBowtieStart = startJoint === 'flat-bowtie' || startJoint === 'miter-bowtie';
  const hasBowtieEnd = endJoint === 'flat-bowtie' || endJoint === 'miter-bowtie';

  const Y_set = new Set<number>([0, tBorder, W]);
  for (const hanger of segmentHangers) {
    for (const point of getCirclePolygon(hanger.u, hanger.v, hangerDiameter)) Y_set.add(point[1]);
  }
  const addPocketSplits = (jointTypeStr: string) => {
    if (jointTypeStr === 'flat-bowtie') {
      const y1 = W / 2 - wEnds / 2;
      const y2 = W / 2 - wNeck / 2;
      const y3 = W / 2 + wNeck / 2;
      const y4 = W / 2 + wEnds / 2;
      Y_set.add(y1);
      Y_set.add(y2);
      Y_set.add(y3);
      Y_set.add(y4);
    } else if (jointTypeStr === 'miter-bowtie') {
      const C_y = W / 2;
      const cos45 = 1 / Math.sqrt(2);
      const dy_neck = (wNeck / 2) * cos45;
      const dy_ends = (wEnds / 2) * cos45;
      const dy_perp = (L_bowtie / 2) * cos45;

      const y1_pocket = C_y - dy_perp - dy_ends;
      const y2_pocket = C_y - dy_perp + dy_ends;
      const y3_pocket = W - y2_pocket;
      const y4_pocket = W - y1_pocket;
      const y_c0 = C_y - dy_neck;
      const y_c1 = C_y + dy_neck;

      Y_set.add(y1_pocket);
      Y_set.add(y2_pocket);
      Y_set.add(y_c0);
      Y_set.add(y_c1);
      Y_set.add(y3_pocket);
      Y_set.add(y4_pocket);
    }
  };

  if (hasBowtieStart) addPocketSplits(startJoint);
  if (hasBowtieEnd) addPocketSplits(endJoint);

  const Y_splits = Array.from(Y_set).sort((a, b) => a - b);

  interface SlantedSplit {
    uAtY: (y: number) => number;
    isBowtie?: boolean;
  }

  const splitsList: SlantedSplit[] = [];
  if (startJoint.startsWith('half-lap-')) {
    const uVal = u1 + L_lap / 2;
    splitsList.push({ uAtY: () => uVal });
  }
  if (endJoint.startsWith('half-lap-')) {
    const uVal = u2 - L_lap / 2;
    splitsList.push({ uAtY: () => uVal });
  }

  if (params.jointType === 'bowtie') {
    const C_y = W / 2;
    const cos45 = 1 / Math.sqrt(2);
    const dy_perp = (L_bowtie / 2) * cos45;
    const dy_ends = (wEnds / 2) * cos45;
    const c3_y = C_y - dy_perp - dy_ends;

    if (hasBowtieStart) {
      if (startJoint === 'flat-bowtie') {
        const uVal = u1 + L_bowtie / 2;
        splitsList.push({ uAtY: () => uVal, isBowtie: true });
      } else if (startJoint === 'miter-bowtie') {
        const C_u = u1 + W / 2;
        const dx_ends = (wEnds / 2) * cos45;
        const dx_perp = (L_bowtie / 2) * cos45;
        const c3_x = C_u + dx_perp - dx_ends;
        splitsList.push({
          uAtY: (y) => c3_x + (y - c3_y) * miterFactor,
          isBowtie: true
        });
      }
    }
    if (hasBowtieEnd) {
      if (endJoint === 'flat-bowtie') {
        const uVal = u2 - L_bowtie / 2;
        splitsList.push({ uAtY: () => uVal, isBowtie: true });
      } else if (endJoint === 'miter-bowtie') {
        const C_u = u2 - W / 2;
        const dx_ends = (wEnds / 2) * cos45;
        const dx_perp = (L_bowtie / 2) * cos45;
        const c3_x = C_u - dx_perp + dx_ends;
        splitsList.push({
          uAtY: (y) => c3_x - (y - c3_y) * miterFactor,
          isBowtie: true
        });
      }
    }
  }

  const wD = Math.min(16, W - 2);
  const wN = wD / 2;

  const miterFactor = params.shape === 'hex' ? 1.0 / Math.sqrt(3) : 1.0;

  // Helper to get offset U based on joint type
  const getOffsetU = (uVal: number, y: number, joint: string, isEnd: boolean, isTopHalf: boolean): number => {
    if (joint === 'miter' || joint === 'miter-bowtie') {
      return isEnd ? (uVal - y * miterFactor) : (uVal + y * miterFactor);
    }
    if (joint === 'half-lap-female') {
      if (!isEnd) {
        return isTopHalf ? (uVal + L_lap / 2) : (uVal - L_lap / 2);
      } else {
        return isTopHalf ? (uVal - L_lap / 2) : (uVal + L_lap / 2);
      }
    }
    if (joint === 'half-lap-male') {
      if (!isEnd) {
        return isTopHalf ? (uVal - L_lap / 2) : (uVal + L_lap / 2);
      } else {
        return isTopHalf ? (uVal + L_lap / 2) : (uVal - L_lap / 2);
      }
    }
    if (joint === 'dovetail-female') {
      const yc = W / 2;
      const dy = Math.abs(y - yc);
      let offset = 0;
      if (dy <= wN / 2) offset = L_dove;
      else if (dy < wD / 2) offset = L_dove * (wD / 2 - dy) / (wD / 2 - wN / 2);
      const clearance = 0.15;
      return isEnd ? (uVal - (offset - clearance)) : (uVal + (offset + clearance));
    }
    if (joint === 'dovetail-male') {
      const yc = W / 2;
      const dy = Math.abs(y - yc);
      let offset = 0;
      if (dy <= wN / 2) offset = L_dove;
      else if (dy < wD / 2) offset = L_dove * (wD / 2 - dy) / (wD / 2 - wN / 2);
      return isEnd ? (uVal + offset) : (uVal - offset);
    }
    return uVal;
  };

  // Face helper
  const addQ = (v0: [number, number, number], v1: [number, number, number], v2: [number, number, number], v3: [number, number, number], n: [number, number, number]) => {
    const dist = (pA: [number, number, number], pB: [number, number, number]) => {
      return Math.sqrt((pA[0] - pB[0]) ** 2 + (pA[1] - pB[1]) ** 2 + (pA[2] - pB[2]) ** 2);
    };
    const d01 = dist(v0, v1);
    const d12 = dist(v1, v2);
    const d23 = dist(v2, v3);
    const d30 = dist(v3, v0);

    const c01 = d01 < 1e-5;
    const c12 = d12 < 1e-5;
    const c23 = d23 < 1e-5;
    const c30 = d30 < 1e-5;

    const collapsedCount = (c01 ? 1 : 0) + (c12 ? 1 : 0) + (c23 ? 1 : 0) + (c30 ? 1 : 0);
    if (collapsedCount >= 2) {
      return;
    }
    if (c30 || c23) {
      addTri(v0, v1, v2, n);
    } else if (c12 || c01) {
      addTri(v0, v2, v3, n);
    } else {
      addTri(v0, v1, v2, n);
      addTri(v0, v2, v3, n);
    }
  };
  
  const addTri = (v0: [number, number, number], v1: [number, number, number], v2: [number, number, number], n: [number, number, number]) => {
    const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    if (Math.hypot(nx, ny, nz) < 1e-10) return;
    const dot = nx * n[0] + ny * n[1] + nz * n[2];
    if (dot < 0) {
      positions.push(...v0, ...v2, ...v1);
    } else {
      positions.push(...v0, ...v1, ...v2);
    }
    normals.push(...n, ...n, ...n);
  };

  const getNormalFromPoints = (v0: [number, number, number], v1: [number, number, number], v2: [number, number, number], flip: boolean): [number, number, number] => {
    const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
    const scale = (flip ? -1 : 1) / (len || 1);
    return [nx * scale, ny * scale, nz * scale];
  };

  // Helper to build 2D profiles using 6 rows to allow sharp vertical step in half-lap and dBowtie T-junction prevention
  const getProfilePoints = (uVal: number, joint: string, isEnd: boolean) => {
    const yArr = [0, tBorder, W];
    const zArr = [0, dBowtie, profileMidHeight, profileMidHeight, hShelf, H];
    const pts: Array<Array<[number, number, number]>> = []; // [col][row]
    for (let c = 0; c < 3; c++) {
      pts[c] = [];
      const y = yArr[c];
      for (let r = 0; r < 6; r++) {
        let z = zArr[r];
        if (c === 0 && r === 4) z = Math.max(hShelf, profileMidHeight);
        if (c === 2 && r === 5) z = hShelf; // clamp top row for inner hole to shelf height
        // Row 0, 1, 2 are bottom half. Row 3, 4, 5 are top half.
        const isTopHalf = r >= 3;
        const u = getOffsetU(uVal, y, joint, isEnd, isTopHalf);
        pts[c][r] = [u, y, z];
      }
    }
    return pts;
  };

  const startPts = getProfilePoints(u1, startJoint, false);
  const endPts = getProfilePoints(u2, endJoint, true);

  // 1. Cap faces (Start and End)
  const addSegmentCap = (pts: Array<Array<[number, number, number]>>, isEnd: boolean, joint: string) => {
    const flip = isEnd;
    const n = isEnd ? [1, 0, 0] as [number, number, number] : [-1, 0, 0] as [number, number, number];

    const addCapQ = (q: Array<[number, number, number]>) => {
      const actNorm = (joint === 'miter' || joint === 'miter-bowtie' || joint.includes('dovetail'))
        ? getNormalFromPoints(q[0], q[1], q[2], !flip)
        : n;
      if (flip) {
        addQ(q[0], q[1], q[2], q[3], actNorm);
      } else {
        addQ(q[0], q[3], q[2], q[1], actNorm);
      }
    };

    const addCapTri = (v0: [number, number, number], v1: [number, number, number], v2: [number, number, number]) => {
      const actNorm = (joint === 'miter' || joint === 'miter-bowtie' || joint.includes('dovetail'))
        ? getNormalFromPoints(v0, v1, v2, !flip)
        : n;
      if (flip) {
        addTri(v0, v1, v2, actNorm);
      } else {
        addTri(v0, v2, v1, actNorm);
      }
    };

    // Sub-quads of the cap (Row 3 to 4, Row 4 to 5)
    const q2 = [pts[0][3], pts[1][3], pts[1][4], pts[0][4]] as Array<[number, number, number]>;
    const q3 = [pts[0][4], pts[1][4], pts[1][5], pts[0][5]] as Array<[number, number, number]>;
    const q5 = [pts[1][3], pts[2][3], pts[2][4], pts[1][4]] as Array<[number, number, number]>;
    addCapQ(q2);
    addCapQ(q3);
    addCapQ(q5);

    if (joint === 'flat-bowtie' || joint === 'miter-bowtie') {
      const A_mid = pts[0][2]; // outer bottom-half (z=H/2)
      const B_mid = pts[2][2]; // inner bottom-half (z=H/2)
      const Col1_mid = pts[1][2]; // Col 1, z=H/2

      const uVal = isEnd ? u2 : u1;
      const C_y = W / 2;
      const cos45 = 1 / Math.sqrt(2);
      const dy_neck = (wNeck / 2) * cos45;
      const dy_ends = (wEnds / 2) * cos45;
      const dy_perp = (L_bowtie / 2) * cos45;

      const y1_pocket = C_y - dy_perp - dy_ends;
      const y4_pocket = W - y1_pocket;

      const y_transition_left = (joint === 'flat-bowtie') ? (W / 2 - wNeck / 2) : (C_y - dy_neck);
      const y_transition_right = (joint === 'flat-bowtie') ? tBorder : y4_pocket;

      const getPtAtZ = (yVal: number, zVal: number): [number, number, number] => {
        const u = getOffsetU(uVal, yVal, joint, isEnd, false);
        return [u, yVal, zVal];
      };

      // 1. Cap face below z = dBowtie (level-by-level)
      for (let i = 0; i < Y_splits.length - 1; i++) {
        const y_low = Y_splits[i];
        const y_high = Y_splits[i+1];
        const y_mid = (y_low + y_high) / 2;

        let isOpening = false;
        if (joint === 'flat-bowtie') {
          const y2 = W / 2 - wNeck / 2;
          const y3 = W / 2 + wNeck / 2;
          if (y_mid >= y2 && y_mid <= y3) isOpening = true;
        } else {
          const y_c0 = C_y - dy_neck;
          const y_c1 = C_y + dy_neck;
          if (y_mid >= y_c0 && y_mid <= y_c1) isOpening = true;
        }

        if (!isOpening) {
          const p00 = getPtAtZ(y_low, 0);
          const p10 = getPtAtZ(y_high, 0);
          const p11 = getPtAtZ(y_high, dBowtie);
          const p01 = getPtAtZ(y_low, dBowtie);
          addCapQ([p00, p10, p11, p01]);
        }
      }

      // 2. Cap face from z = dBowtie to z = H/2 (level-by-level)
      // Left half: y in [0, tBorder]
      for (let i = 0; i < Y_splits.length - 1; i++) {
        const y_low = Y_splits[i];
        const y_high = Y_splits[i+1];
        if (y_high > tBorder) break;

        const y_low_t = getPtAtZ(y_low, dBowtie);
        const y_high_t = getPtAtZ(y_high, dBowtie);

        if (y_high <= y_transition_left + 1e-6) {
          addCapTri(A_mid, y_low_t, y_high_t);
        } else if (y_low >= y_transition_left - 1e-6) {
          addCapTri(Col1_mid, y_low_t, y_high_t);
        }
      }
      // Add left transition triangle
      const y_trans_left_t = getPtAtZ(y_transition_left, dBowtie);
      addCapTri(A_mid, y_trans_left_t, Col1_mid);

      // Right half: y in [tBorder, W]
      for (let i = 0; i < Y_splits.length - 1; i++) {
        const y_low = Y_splits[i];
        const y_high = Y_splits[i+1];
        if (y_low < tBorder) continue;

        const y_low_t = getPtAtZ(y_low, dBowtie);
        const y_high_t = getPtAtZ(y_high, dBowtie);

        if (y_high <= y_transition_right + 1e-6) {
          addCapTri(Col1_mid, y_low_t, y_high_t);
        } else if (y_low >= y_transition_right - 1e-6) {
          addCapTri(B_mid, y_low_t, y_high_t);
        }
      }
      // Add right transition triangle
      const y_trans_right_t = getPtAtZ(y_transition_right, dBowtie);
      addCapTri(Col1_mid, y_trans_right_t, B_mid);
    } else {
      const qBottom_left_1 = [pts[0][0], pts[1][0], pts[1][1], pts[0][1]] as Array<[number, number, number]>;
      const qBottom_left_2 = [pts[0][1], pts[1][1], pts[1][2], pts[0][2]] as Array<[number, number, number]>;
      const qBottom_right_1 = [pts[1][0], pts[2][0], pts[2][1], pts[1][1]] as Array<[number, number, number]>;
      const qBottom_right_2 = [pts[1][1], pts[2][1], pts[2][2], pts[1][2]] as Array<[number, number, number]>;
      addCapQ(qBottom_left_1);
      addCapQ(qBottom_left_2);
      addCapQ(qBottom_right_1);
      addCapQ(qBottom_right_2);
    }
  };

  addSegmentCap(startPts, false, startJoint);
  addSegmentCap(endPts, true, endJoint);

  // 2. Longitudinal Side Faces
  const addLongQ = (
    c1: number, r1: number, c2: number, r2: number, n: [number, number, number]
  ) => {
    const pStart1 = startPts[c1][r1];
    const pStart2 = startPts[c2][r2];
    const pEnd1 = endPts[c1][r1];
    const pEnd2 = endPts[c2][r2];

    const uStart = pStart1[0];
    const uEnd = pEnd1[0];

    const splits: SlantedSplit[] = [];
    const isBottomHalf = r1 < 3 && r2 < 3;
    const isTopHalf = r1 >= 3 && r2 >= 3;

    if (startJoint.startsWith('half-lap-') && isBottomHalf) {
      const uSplit = u1 + L_lap / 2;
      if (uStart < uEnd && uSplit > uStart && uSplit < uEnd) {
        splits.push({ uAtY: () => uSplit });
      } else if (uStart > uEnd && uSplit < uStart && uSplit > uEnd) {
        splits.push({ uAtY: () => uSplit });
      }
    }

    if (endJoint.startsWith('half-lap-') && isTopHalf) {
      const uSplit = u2 - L_lap / 2;
      if (uStart < uEnd && uSplit > uStart && uSplit < uEnd) {
        splits.push({ uAtY: () => uSplit });
      } else if (uStart > uEnd && uSplit < uStart && uSplit > uEnd) {
        splits.push({ uAtY: () => uSplit });
      }
    }

    const touchesBowtiePocket = Math.min(pStart1[2], pStart2[2], pEnd1[2], pEnd2[2]) <= dBowtie + 1e-6;
    if (params.jointType === 'bowtie' && touchesBowtiePocket) {
      const y1 = pStart1[1];
      const y2 = pStart2[1];

      for (const split of splitsList) {
        if (split.isBowtie) {
          const uSplit1_slanted = split.uAtY(y1);
          const uSplit2_slanted = split.uAtY(y2);

          const min1 = Math.min(pStart1[0], pEnd1[0]);
          const max1 = Math.max(pStart1[0], pEnd1[0]);
          const min2 = Math.min(pStart2[0], pEnd2[0]);
          const max2 = Math.max(pStart2[0], pEnd2[0]);

          const in1 = uSplit1_slanted > min1 + 1e-5 && uSplit1_slanted < max1 - 1e-5;
          const in2 = uSplit2_slanted > min2 + 1e-5 && uSplit2_slanted < max2 - 1e-5;

          if (in1 || in2) {
            splits.push(split);
          }
        }
      }
    }

    if (splits.length === 0) {
      addQ(pStart1, pStart2, pEnd2, pEnd1, n);
    } else {
      // Sort splits by their position at y1
      const y1_ref = pStart1[1];
      splits.sort((a, b) => {
        const ua = a.uAtY(y1_ref);
        const ub = b.uAtY(y1_ref);
        return uStart < uEnd ? ua - ub : ub - ua;
      });

      let lastP1 = pStart1;
      let lastP2 = pStart2;

      for (const split of splits) {
        const denom1 = pEnd1[0] - pStart1[0];
        const denom2 = pEnd2[0] - pStart2[0];

        const y1 = pStart1[1];
        const y2 = pStart2[1];

        const uSplit1_slanted = split.uAtY(y1);
        const uSplit2_slanted = split.uAtY(y2);

        const uSplit1 = Math.max(Math.min(pStart1[0], pEnd1[0]), Math.min(Math.max(pStart1[0], pEnd1[0]), uSplit1_slanted));
        const uSplit2 = Math.max(Math.min(pStart2[0], pEnd2[0]), Math.min(Math.max(pStart2[0], pEnd2[0]), uSplit2_slanted));

        const t1 = Math.abs(denom1) > 1e-5 ? (uSplit1 - pStart1[0]) / denom1 : 0;
        const t2 = Math.abs(denom2) > 1e-5 ? (uSplit2 - pStart2[0]) / denom2 : 0;

        const nextP1 = [
          uSplit1,
          pStart1[1] + t1 * (pEnd1[1] - pStart1[1]),
          pStart1[2] + t1 * (pEnd1[2] - pStart1[2])
        ] as [number, number, number];

        const nextP2 = [
          uSplit2,
          pStart2[1] + t2 * (pEnd2[1] - pStart2[1]),
          pStart2[2] + t2 * (pEnd2[2] - pStart2[2])
        ] as [number, number, number];

        addQ(lastP1, lastP2, nextP2, nextP1, n);

        lastP1 = nextP1;
        lastP2 = nextP2;
      }

      addQ(lastP1, lastP2, pEnd2, pEnd1, n);
    }
  };

  // Outer Wall: Col 0, Row 0 to 5 (wound outward-facing, split at dBowtie)
  addLongQ(0, 0, 0, 1, [0, -1, 0]);
  addLongQ(0, 1, 0, 2, [0, -1, 0]);
  addLongQ(0, 3, 0, 4, [0, -1, 0]);
  addLongQ(0, 4, 0, 5, [0, -1, 0]);

  // Top Face: Col 1 to 0, Row 5 (wound outward-facing)
  addLongQ(1, 5, 0, 5, [0, 0, 1]);

  // Pocket Wall: Col 1, Row 4 to 5 (wound outward-facing)
  addLongQ(1, 4, 1, 5, [0, 1, 0]);

  // Shelf Lip: Col 2 to 1, Row 4 (wound outward-facing)
  addLongQ(2, 4, 1, 4, [0, 0, 1]);

  // Inner Wall: Col 2, Row 0 to 4 (wound outward-facing, split at dBowtie)
  addLongQ(2, 3, 2, 4, [0, 1, 0]);
  addLongQ(2, 1, 2, 2, [0, 1, 0]);
  addLongQ(2, 0, 2, 1, [0, 1, 0]);

  // Bottom face: Col 0 to 2, Row 0 (we carve bowties here if needed!)
  // bottom face tiling using pre-defined hasBowtieStart and hasBowtieEnd

  // Bottom face: Col 0 to 2, Row 0 (we carve bowties here if needed!)
  // bottom face tiling using pre-defined hasBowtieStart and hasBowtieEnd

  const normalize3D = (v: [number, number, number]): [number, number, number] => {
    const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    return len > 1e-6 ? [v[0]/len, v[1]/len, v[2]/len] : [0, 0, 0];
  };

  if (!hasBowtieStart && !hasBowtieEnd) {
    const bottomContour: [number, number][] = [
      [startPts[0][0][0], startPts[0][0][1]],
      [endPts[0][0][0], endPts[0][0][1]],
      [endPts[1][0][0], endPts[1][0][1]],
      [endPts[2][0][0], endPts[2][0][1]],
      [startPts[2][0][0], startPts[2][0][1]],
      [startPts[1][0][0], startPts[1][0][1]]
    ];
    const hangerOpenings = segmentHangers.map(hanger => (
      getCirclePolygon(hanger.u, hanger.v, hangerDiameter)
    ));
    addPolygonFaceWithHoles(positions, normals, bottomContour, hangerOpenings, 0, [0, 0, -1]);
  } else {
    const u_start = (y: number) => {
      if (startJoint === 'miter' || startJoint === 'miter-bowtie') {
        return u1 + y * miterFactor;
      }
      return u1;
    };

    const u_end = (y: number) => {
      if (endJoint === 'miter' || endJoint === 'miter-bowtie') {
        return u2 - y * miterFactor;
      }
      return u2;
    };

    const getPocketStartBounds = (y: number): { p_L: number; p_R: number; inPocket: boolean } => {
      if (!hasBowtieStart) return { p_L: u_start(y), p_R: u_start(y), inPocket: false };

      if (startJoint === 'flat-bowtie') {
        const y1 = W / 2 - wEnds / 2;
        const y2 = W / 2 - wNeck / 2;
        const y3 = W / 2 + wNeck / 2;
        const y4 = W / 2 + wEnds / 2;
        const uMid = u1 + L_bowtie / 2;

        if (y >= y1 && y <= y4) {
          const p_L = y < y2
            ? u1 + (y - y2) * (uMid - u1) / (y1 - y2)
            : y > y3
              ? u1 + (y - y3) * (uMid - u1) / (y4 - y3)
              : u1;
          const inPocket = y > y1 && y < y4;
          return { p_L, p_R: uMid, inPocket };
        }
      } else if (startJoint === 'miter-bowtie') {
        const C_u = u1 + W / 2;
        const C_y = W / 2;
        const cos45 = 1 / Math.sqrt(2);
        const dx_neck = (wNeck / 2) * cos45;
        const dy_neck = (wNeck / 2) * cos45;
        const dx_ends = (wEnds / 2) * cos45;
        const dy_ends = (wEnds / 2) * cos45;
        const dx_perp = (L_bowtie / 2) * cos45;
        const dy_perp = (L_bowtie / 2) * cos45;

        const c0_y = C_y - dy_neck;
        const c1_y = C_y + dy_neck;
        const c3_y = C_y - dy_perp - dy_ends;
        const c2_y = C_y - dy_perp + dy_ends;

        const c0_x = C_u - dx_neck;
        const c1_x = C_u + dx_neck;
        const c3_x = C_u + dx_perp - dx_ends;
        const c2_x = C_u + dx_perp + dx_ends;

        if (y >= c3_y && y <= c1_y) {
          const p_L = y < c0_y
            ? c3_x + (y - c3_y) * (c0_x - c3_x) / (c0_y - c3_y)
            : u_start(y);
          const p_R = y < c2_y
            ? c3_x + (y - c3_y) * (c2_x - c3_x) / (c2_y - c3_y)
            : c2_x + (y - c2_y) * (c1_x - c2_x) / (c1_y - c2_y);
          const inPocket = y > c3_y && y <= c1_y;
          return { p_L, p_R, inPocket };
        }
      }
      return { p_L: u_start(y), p_R: u_start(y), inPocket: false };
    };

    const getPocketEndBounds = (y: number): { p_L: number; p_R: number; inPocket: boolean } => {
      if (!hasBowtieEnd) return { p_L: u_end(y), p_R: u_end(y), inPocket: false };

      if (endJoint === 'flat-bowtie') {
        const y1 = W / 2 - wEnds / 2;
        const y2 = W / 2 - wNeck / 2;
        const y3 = W / 2 + wNeck / 2;
        const y4 = W / 2 + wEnds / 2;
        const uMid = u2 - L_bowtie / 2;

        if (y >= y1 && y <= y4) {
          const p_R = y < y2
            ? u2 + (y - y2) * (uMid - u2) / (y1 - y2)
            : y > y3
              ? u2 + (y - y3) * (uMid - u2) / (y4 - y3)
              : u2;
          const inPocket = y > y1 && y < y4;
          return { p_L: uMid, p_R, inPocket };
        }
      } else if (endJoint === 'miter-bowtie') {
        const C_u = u2 - W / 2;
        const C_y = W / 2;
        const cos45 = 1 / Math.sqrt(2);
        const dx_neck = (wNeck / 2) * cos45;
        const dy_neck = (wNeck / 2) * cos45;
        const dx_ends = (wEnds / 2) * cos45;
        const dy_ends = (wEnds / 2) * cos45;
        const dx_perp = (L_bowtie / 2) * cos45;
        const dy_perp = (L_bowtie / 2) * cos45;

        const c0_y = C_y - dy_neck;
        const c1_y = C_y + dy_neck;
        const c3_y = C_y - dy_perp - dy_ends;
        const c2_y = C_y - dy_perp + dy_ends;

        const c0_x = C_u + dx_neck;
        const c1_x = C_u - dx_neck;
        const c3_x = C_u - dx_perp + dx_ends;
        const c2_x = C_u - dx_perp - dx_ends;

        if (y >= c3_y && y <= c1_y) {
          const p_L = y < c2_y
            ? c3_x + (y - c3_y) * (c2_x - c3_x) / (c2_y - c3_y)
            : c2_x + (y - c2_y) * (c1_x - c2_x) / (c1_y - c2_y);
          const p_R = y < c0_y
            ? c3_x + (y - c3_y) * (c0_x - c3_x) / (c0_y - c3_y)
            : u_end(y);
          const inPocket = y > c3_y && y <= c1_y;
          return { p_L, p_R, inPocket };
        }
      }
      return { p_L: u_end(y), p_R: u_end(y), inPocket: false };
    };

    const addSolidQuadRaw = (
      uL_low: number, uR_low: number, y_low: number,
      uL_high: number, uR_high: number, y_high: number
    ) => {
      const p00 = [uL_low, y_low, 0] as [number, number, number];
      const p10 = [uR_low, y_low, 0] as [number, number, number];
      const p11 = [uR_high, y_high, 0] as [number, number, number];
      const p01 = [uL_high, y_high, 0] as [number, number, number];

      const lowCollapsed = Math.abs(uL_low - uR_low) < 1e-5;
      const highCollapsed = Math.abs(uL_high - uR_high) < 1e-5;

      if (lowCollapsed && highCollapsed) return;

      if (lowCollapsed) {
        addTri(p00, p11, p01, [0, 0, -1]);
      } else if (highCollapsed) {
        addTri(p00, p10, p01, [0, 0, -1]);
      } else {
        addQ(p00, p10, p11, p01, [0, 0, -1]);
      }
    };

    const addSolidQuad = (
      uL_low: number, uR_low: number, y_low: number,
      uL_high: number, uR_high: number, y_high: number
    ) => {
      if (y_low < tBorder && y_high > tBorder) {
        const t = (tBorder - y_low) / (y_high - y_low);
        const uL_mid = uL_low + t * (uL_high - uL_low);
        const uR_mid = uR_low + t * (uR_high - uR_low);
        addSolidQuad(uL_low, uR_low, y_low, uL_mid, uR_mid, tBorder);
        addSolidQuad(uL_mid, uR_mid, tBorder, uL_high, uR_high, y_high);
        return;
      }

      // Split in U direction at any slanted splits to avoid T-junctions
      for (const split of splitsList) {
        const uSplit_low = split.uAtY(y_low);
        const uSplit_high = split.uAtY(y_high);

        const inLow = uSplit_low > uL_low + 1e-5 && uSplit_low < uR_low - 1e-5;
        const inHigh = uSplit_high > uL_high + 1e-5 && uSplit_high < uR_high - 1e-5;

        if (inLow || inHigh) {
          const splitLow = Math.max(uL_low, Math.min(uR_low, uSplit_low));
          const splitHigh = Math.max(uL_high, Math.min(uR_high, uSplit_high));
          addSolidQuad(uL_low, splitLow, y_low, uL_high, splitHigh, y_high);
          addSolidQuad(splitLow, uR_low, y_low, splitHigh, uR_high, y_high);
          return;
        }
      }

      if (segmentHangers.length === 0) {
        addSolidQuadRaw(uL_low, uR_low, y_low, uL_high, uR_high, y_high);
        return;
      }

      const y_mid = (y_low + y_high) / 2;
      const holeSlices = [] as Array<{
        center: number;
        leftLow: number;
        leftHigh: number;
        rightLow: number;
        rightHigh: number;
      }>;
      for (const hanger of segmentHangers) {
        const polygon = getCirclePolygon(hanger.u, hanger.v, hangerDiameter);
        const minY = Math.min(...polygon.map(point => point[1]));
        const maxY = Math.max(...polygon.map(point => point[1]));
        if (y_mid <= minY || y_mid >= maxY) continue;

        const intersections = [] as Array<{ xMid: number; xLow: number; xHigh: number }>;
        for (let pointIndex = 0; pointIndex < polygon.length; pointIndex++) {
          const p1 = polygon[pointIndex];
          const p2 = polygon[(pointIndex + 1) % polygon.length];
          if (y_mid <= Math.min(p1[1], p2[1]) || y_mid >= Math.max(p1[1], p2[1])) continue;
          const xAt = (y: number) => p1[0] + ((y - p1[1]) * (p2[0] - p1[0])) / (p2[1] - p1[1]);
          intersections.push({ xMid: xAt(y_mid), xLow: xAt(y_low), xHigh: xAt(y_high) });
        }
        intersections.sort((a, b) => a.xMid - b.xMid);
        if (intersections.length !== 2) continue;

        const [left, right] = intersections;
        const tMid = (y_mid - y_low) / (y_high - y_low);
        const regionLeftMid = uL_low + tMid * (uL_high - uL_low);
        const regionRightMid = uR_low + tMid * (uR_high - uR_low);
        const fullyInside = left.xMid >= regionLeftMid - 1e-5
          && right.xMid <= regionRightMid + 1e-5
          && left.xLow >= uL_low - 1e-5
          && right.xLow <= uR_low + 1e-5
          && left.xHigh >= uL_high - 1e-5
          && right.xHigh <= uR_high + 1e-5;
        if (fullyInside) {
          holeSlices.push({
            center: (left.xMid + right.xMid) / 2,
            leftLow: left.xLow,
            leftHigh: left.xHigh,
            rightLow: right.xLow,
            rightHigh: right.xHigh
          });
        }
      }

      if (holeSlices.length === 0) {
        addSolidQuadRaw(uL_low, uR_low, y_low, uL_high, uR_high, y_high);
        return;
      }

      holeSlices.sort((a, b) => a.center - b.center);
      let leftLow = uL_low;
      let leftHigh = uL_high;
      for (const hole of holeSlices) {
        addSolidQuadRaw(leftLow, hole.leftLow, y_low, leftHigh, hole.leftHigh, y_high);
        leftLow = hole.rightLow;
        leftHigh = hole.rightHigh;
      }
      addSolidQuadRaw(leftLow, uR_low, y_low, leftHigh, uR_high, y_high);
    };

    const addPocketCeilingQuad = (uL_low: number, uR_low: number, y_low: number, uL_high: number, uR_high: number, y_high: number) => {
      const p00 = [uL_low, y_low, dBowtie] as [number, number, number];
      const p10 = [uR_low, y_low, dBowtie] as [number, number, number];
      const p11 = [uR_high, y_high, dBowtie] as [number, number, number];
      const p01 = [uL_high, y_high, dBowtie] as [number, number, number];

      const lowCollapsed = Math.abs(uL_low - uR_low) < 1e-5;
      const highCollapsed = Math.abs(uL_high - uR_high) < 1e-5;

      if (lowCollapsed && highCollapsed) return;

      if (lowCollapsed) {
        addTri(p00, p11, p01, [0, 0, -1]);
      } else if (highCollapsed) {
        addTri(p00, p10, p01, [0, 0, -1]);
      } else {
        addQ(p00, p10, p11, p01, [0, 0, -1]);
      }
    };

    const addVerticalWall = (u_low: number, y_low: number, u_high: number, y_high: number, norm: [number, number, number]) => {
      const p00 = [u_low, y_low, 0] as [number, number, number];
      const p10 = [u_high, y_high, 0] as [number, number, number];
      const p11 = [u_high, y_high, dBowtie] as [number, number, number];
      const p01 = [u_low, y_low, dBowtie] as [number, number, number];

      const collapsed = Math.abs(u_low - u_high) < 1e-5 && Math.abs(y_low - y_high) < 1e-5;
      if (collapsed) return;

      addQ(p00, p10, p11, p01, norm);
    };

    for (let i = 0; i < Y_splits.length - 1; i++) {
      const y_low = Y_splits[i];
      const y_high = Y_splits[i+1];
      const y_mid = (y_low + y_high) / 2;

      const u_L_low = u_start(y_low);
      const u_L_high = u_start(y_high);
      const u_R_low = u_end(y_low);
      const u_R_high = u_end(y_high);

      const pStart_low = getPocketStartBounds(y_low);
      const pStart_mid = getPocketStartBounds(y_mid);
      const pStart_high = getPocketStartBounds(y_high);

      const pEnd_low = getPocketEndBounds(y_low);
      const pEnd_mid = getPocketEndBounds(y_mid);
      const pEnd_high = getPocketEndBounds(y_high);

      // 1. Wing 1 (left of start pocket)
      const hasWing1 = pStart_mid.inPocket && (pStart_mid.p_L > u_start(y_mid) + 1e-6);
      if (hasWing1) {
        addSolidQuad(
          u_L_low, pStart_low.p_L, y_low,
          u_L_high, pStart_high.p_L, y_high
        );
      }

      // 2. Middle Region (between start pocket and end pocket)
      const u_mid_low_start = pStart_mid.inPocket ? pStart_low.p_R : u_start(y_low);
      const u_mid_low_end = pEnd_mid.inPocket ? pEnd_low.p_L : u_end(y_low);

      const u_mid_mid_start = pStart_mid.inPocket ? pStart_mid.p_R : u_start(y_mid);
      const u_mid_mid_end = pEnd_mid.inPocket ? pEnd_mid.p_L : u_end(y_mid);

      const u_mid_high_start = pStart_mid.inPocket ? pStart_high.p_R : u_start(y_high);
      const u_mid_high_end = pEnd_mid.inPocket ? pEnd_high.p_L : u_end(y_high);

      const hasMain = u_mid_mid_start < u_mid_mid_end - 1e-6;
      if (hasMain) {
        addSolidQuad(
          u_mid_low_start, u_mid_low_end, y_low,
          u_mid_high_start, u_mid_high_end, y_high
        );
      }

      // 3. Wing 2 (right of end pocket)
      const hasWing2 = pEnd_mid.inPocket && (pEnd_mid.p_R < u_end(y_mid) - 1e-6);
      if (hasWing2) {
        addSolidQuad(
          pEnd_low.p_R, u_R_low, y_low,
          pEnd_high.p_R, u_R_high, y_high
        );
      }

      // 4. Start pocket hollow & walls
      if (hasBowtieStart && pStart_mid.inPocket) {
        // Ceiling
        addPocketCeilingQuad(
          pStart_low.p_L, pStart_low.p_R, y_low,
          pStart_high.p_L, pStart_high.p_R, y_high
        );
        // Left wall
        if (pStart_mid.p_L > u_start(y_mid) + 1e-6) {
          const dx = pStart_high.p_L - pStart_low.p_L;
          const dy = y_high - y_low;
          const norm = normalize3D([dy, -dx, 0]);
          addVerticalWall(pStart_low.p_L, y_low, pStart_high.p_L, y_high, norm);
        }
        // Right wall
        const dx = pStart_high.p_R - pStart_low.p_R;
        const dy = y_high - y_low;
        const norm = normalize3D([-dy, dx, 0]);
        addVerticalWall(pStart_low.p_R, y_low, pStart_high.p_R, y_high, norm);
      }

      // 5. End pocket hollow & walls
      if (hasBowtieEnd && pEnd_mid.inPocket) {
        // Ceiling
        addPocketCeilingQuad(
          pEnd_low.p_L, pEnd_low.p_R, y_low,
          pEnd_high.p_L, pEnd_high.p_R, y_high
        );
        // Left wall
        const dx = pEnd_high.p_L - pEnd_low.p_L;
        const dy = y_high - y_low;
        const norm = normalize3D([dy, -dx, 0]);
        addVerticalWall(pEnd_low.p_L, y_low, pEnd_high.p_L, y_high, norm);
        // Right wall
        if (pEnd_mid.p_R < u_end(y_mid) - 1e-6) {
          const dx = pEnd_high.p_R - pEnd_low.p_R;
          const dy = y_high - y_low;
          const norm = normalize3D([-dy, dx, 0]);
          addVerticalWall(pEnd_low.p_R, y_low, pEnd_high.p_R, y_high, norm);
        }
      }
    }

    if (params.jointType === 'bowtie') {
      const C_y = W / 2;
      const cos45 = 1 / Math.sqrt(2);
      const dy_ends = (wEnds / 2) * cos45;
      const dy_perp = (L_bowtie / 2) * cos45;
      const y1_pocket = C_y - dy_perp - dy_ends;

      if (hasBowtieStart && startJoint === 'miter-bowtie') {
        const pStart_low = getPocketStartBounds(y1_pocket);
        addVerticalWall(pStart_low.p_L, y1_pocket, pStart_low.p_R, y1_pocket, [0, 1, 0]);
      }
      if (hasBowtieEnd && endJoint === 'miter-bowtie') {
        const pEnd_low = getPocketEndBounds(y1_pocket);
        addVerticalWall(pEnd_low.p_L, y1_pocket, pEnd_low.p_R, y1_pocket, [0, 1, 0]);
      }
    }
  }

  // 3. Exposed step faces for half-lap joint
  const addStepFace = (uStartStep: number, uEndStep: number, up: boolean) => {
    const norm: [number, number, number] = up ? [0, 0, 1] : [0, 0, -1];
    addQ([uStartStep, 0, halfLapHeight], [uEndStep, 0, halfLapHeight], [uEndStep, tBorder, halfLapHeight], [uStartStep, tBorder, halfLapHeight], norm);
    addQ([uStartStep, tBorder, halfLapHeight], [uEndStep, tBorder, halfLapHeight], [uEndStep, W, halfLapHeight], [uStartStep, W, halfLapHeight], norm);
  };

  if (startJoint.startsWith('half-lap-')) {
    const isFemale = startJoint === 'half-lap-female';
    const uBottom = isFemale ? (u1 - L_lap / 2) : (u1 + L_lap / 2);
    const uTop = isFemale ? (u1 + L_lap / 2) : (u1 - L_lap / 2);
    if (isFemale) {
      addStepFace(uBottom, uTop, true);
    } else {
      addStepFace(uTop, uBottom, false);
    }
  }

  if (endJoint.startsWith('half-lap-')) {
    const isFemale = endJoint === 'half-lap-female';
    const uBottom = isFemale ? (u2 - L_lap / 2) : (u2 + L_lap / 2);
    const uTop = isFemale ? (u2 + L_lap / 2) : (u2 - L_lap / 2);
    if (isFemale) {
      addStepFace(uBottom, uTop, true);
    } else {
      addStepFace(uTop, uBottom, false);
    }
  }

  // 4. Subtract cylindrical hanger hole if it sits inside this segment
  if (params.hangerEnabled && params.tBorder > 4 && params.height > 4) {
    const depth = Math.min(params.height - 2, 8);
    segmentHangers.forEach(({ u, v }) => {
      addCylindricalHole(positions, normals, u, v, hangerDiameter, depth, 0, true);
    });
  }

  const conformedMesh = conformTriangleMesh(positions, normals);
  const closedMesh = closePlanarBoundaryLoops(conformedMesh.positions, conformedMesh.normals);
  return conformTriangleMesh(closedMesh.positions, closedMesh.normals);
}

// Map local segment positions & normals to global coordinates
function transformLocalToGlobal(
  localPos: number[],
  localNorm: number[],
  side: 'top' | 'bottom' | 'left' | 'right',
  L: number,
  wOut: number,
  lOut: number
): { positions: Float32Array; normals: Float32Array } {
  const positions = new Float32Array(localPos.length);
  const normals = new Float32Array(localNorm.length);
  
  const tx = (u: number, v: number, z: number, nu: number, nv: number, nz: number) => {
    if (side === 'top') {
      return [u - L / 2, lOut / 2 - v, z, nu, -nv, nz];
    }
    if (side === 'bottom') {
      return [L / 2 - u, -lOut / 2 + v, z, -nu, nv, nz];
    }
    if (side === 'left') {
      return [-wOut / 2 + v, u - L / 2, z, nv, nu, nz];
    }
    return [wOut / 2 - v, L / 2 - u, z, -nv, -nu, nz];
  };

  for (let i = 0; i < localPos.length; i += 9) {
    const pt0 = tx(localPos[i], localPos[i+1], localPos[i+2], localNorm[i], localNorm[i+1], localNorm[i+2]);
    const pt1 = tx(localPos[i+3], localPos[i+4], localPos[i+5], localNorm[i+3], localNorm[i+4], localNorm[i+5]);
    const pt2 = tx(localPos[i+6], localPos[i+7], localPos[i+8], localNorm[i+6], localNorm[i+7], localNorm[i+8]);

    // Flip winding (swap pt1 and pt2) to correct for the transformation reflection (det = -1)
    positions[i] = pt0[0];
    positions[i+1] = pt0[1];
    positions[i+2] = pt0[2];
    normals[i] = pt0[3];
    normals[i+1] = pt0[4];
    normals[i+2] = pt0[5];

    positions[i+3] = pt2[0];
    positions[i+4] = pt2[1];
    positions[i+5] = pt2[2];
    normals[i+3] = pt2[3];
    normals[i+4] = pt2[4];
    normals[i+5] = pt2[5];

    positions[i+6] = pt1[0];
    positions[i+7] = pt1[1];
    positions[i+8] = pt1[2];
    normals[i+6] = pt1[3];
    normals[i+7] = pt1[4];
    normals[i+8] = pt1[5];
  }
  
  return { positions, normals };
}
