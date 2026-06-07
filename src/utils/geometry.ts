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
  positions.push(...v0, ...v1, ...v2);
  normals.push(...normal, ...normal, ...normal);
  
  positions.push(...v0, ...v2, ...v3);
  normals.push(...normal, ...normal, ...normal);
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
  positions.push(...v0, ...v1, ...v2);
  normals.push(...normal, ...normal, ...normal);
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
  S: number, // Square box size
  D: number, // Cylinder diameter
  depth: number,
  zOpen: number,
  goesUp: boolean = false
) {
  const zMin = goesUp ? zOpen : zOpen - depth;
  const zMax = goesUp ? zOpen + depth : zOpen;
  const M = 12; // Dodecagon for smooth cylinder
  const points: [number, number][] = [];

  for (let i = 0; i < M; i++) {
    const theta = (i * 2 * Math.PI) / M;
    points.push([
      cx + (D / 2) * Math.cos(theta),
      cy + (D / 2) * Math.sin(theta)
    ]);
  }

  // 1. Cylindrical Wall (normals point inwards — same for both directions)
  for (let i = 0; i < M; i++) {
    const next = (i + 1) % M;
    const theta = (i * 2 * Math.PI) / M;
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

  // 2. Ceiling face (blind end of the hole).
  //    goesDown: ceiling at zMin facing +Z toward opening.
  //    goesUp:   ceiling at zMax facing -Z toward opening.
  const zCeil = goesUp ? zMax : zMin;
  const ceilNz: [number, number, number] = goesUp ? [0, 0, -1] : [0, 0, 1];
  for (let i = 0; i < M; i++) {
    const next = (i + 1) % M;
    if (goesUp) {
      // CCW from below (-Z view) = reversed order
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

  // 3. Opening/Transition Face (Square outer to Circle inner at hole opening Z)
  const zFace = goesUp ? zMin : zMax;
  const faceNz: [number, number, number] = goesUp ? [0, 0, -1] : [0, 0, 1];

  const TR: [number, number] = [cx + S/2, cy + S/2];
  const TL: [number, number] = [cx - S/2, cy + S/2];
  const BL: [number, number] = [cx - S/2, cy - S/2];
  const BR: [number, number] = [cx + S/2, cy - S/2];

  const addQuadTriangle = (corner: [number, number], p1: [number, number], p2: [number, number]) => {
    if (goesUp) {
      // Reversed winding for -Z normal (bottom/back face)
      addTriangleFace(positions, normals,
        [corner[0], corner[1], zFace],
        [p1[0], p1[1], zFace],
        [p2[0], p2[1], zFace],
        faceNz
      );
    } else {
      addTriangleFace(positions, normals,
        [corner[0], corner[1], zFace],
        [p2[0], p2[1], zFace],
        [p1[0], p1[1], zFace],
        faceNz
      );
    }
  };

  // Quadrant 1: TR to indices 0,1,2,3
  addQuadTriangle(TR, points[0], points[1]);
  addQuadTriangle(TR, points[1], points[2]);
  addQuadTriangle(TR, points[2], points[3]);

  // Quadrant 2: TL to indices 3,4,5,6
  addQuadTriangle(TL, points[3], points[4]);
  addQuadTriangle(TL, points[4], points[5]);
  addQuadTriangle(TL, points[5], points[6]);

  // Quadrant 3: BL to indices 6,7,8,9
  addQuadTriangle(BL, points[6], points[7]);
  addQuadTriangle(BL, points[7], points[8]);
  addQuadTriangle(BL, points[8], points[9]);

  // Quadrant 4: BR to indices 9,10,11,0
  addQuadTriangle(BR, points[9], points[10]);
  addQuadTriangle(BR, points[10], points[11]);
  addQuadTriangle(BR, points[11], points[0]);

  // 4. Fill gaps between quadrants
  if (goesUp) {
    // Reversed winding for -Z normal
    addTriangleFace(positions, normals, [TR[0], TR[1], zFace], [points[3][0], points[3][1], zFace], [TL[0], TL[1], zFace], faceNz);
    addTriangleFace(positions, normals, [TL[0], TL[1], zFace], [points[6][0], points[6][1], zFace], [BL[0], BL[1], zFace], faceNz);
    addTriangleFace(positions, normals, [BL[0], BL[1], zFace], [points[9][0], points[9][1], zFace], [BR[0], BR[1], zFace], faceNz);
    addTriangleFace(positions, normals, [BR[0], BR[1], zFace], [points[0][0], points[0][1], zFace], [TR[0], TR[1], zFace], faceNz);
  } else {
    addTriangleFace(positions, normals, [TR[0], TR[1], zFace], [TL[0], TL[1], zFace], [points[3][0], points[3][1], zFace], faceNz);
    addTriangleFace(positions, normals, [TL[0], TL[1], zFace], [BL[0], BL[1], zFace], [points[6][0], points[6][1], zFace], faceNz);
    addTriangleFace(positions, normals, [BL[0], BL[1], zFace], [BR[0], BR[1], zFace], [points[9][0], points[9][1], zFace], faceNz);
    addTriangleFace(positions, normals, [BR[0], BR[1], zFace], [TR[0], TR[1], zFace], [points[0][0], points[0][1], zFace], faceNz);
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

/**
 * Generates the frame geometry as unindexed position and normal arrays.
 */
export function generateFrameGeometry(params: FrameParams): {
  positions: Float32Array;
  normals: Float32Array;
} {
  const positions: number[] = [];
  const normals: number[] = [];

  const {
    shape,
    wPic,
    lPic,
    clearance,
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
  const wPocket = wPic + 2 * clearance;
  const lPocket = lPic + 2 * clearance;
  const wOut = wPocket + 2 * tBorder;
  const lOut = lPocket + 2 * tBorder;
  
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

  // addHangerSegment: fills a ring face segment with rectangular slots for the hanger holes.
  // zLevel = Z of the face; nz = +1 for top face (normal +Z) or -1 for bottom face (normal -Z).
  const addHangerSegment = (
    p1: [number, number],
    p2: [number, number],
    c1: [number, number],
    c2: [number, number],
    side: 'top' | 'bottom' | 'left' | 'right',
    zLevel: number,
    nz: number
  ) => {
    const S = Math.min(hangerDiameter, tBorder - 2);
    const M = centers.length;
    const faceN: [number, number, number] = [0, 0, nz];
    const z = zLevel;

    // Winding-correct face helpers based on nz direction
    const rf = (
      v0: [number,number,number], v1: [number,number,number],
      v2: [number,number,number], v3: [number,number,number]
    ) => {
      if (nz > 0) addFace(positions, normals, v0, v1, v2, v3, faceN);
      else         addFace(positions, normals, v0, v3, v2, v1, faceN);
    };
    const rt = (
      v0: [number,number,number], v1: [number,number,number], v2: [number,number,number]
    ) => {
      if (nz > 0) addTriangleFace(positions, normals, v0, v1, v2, faceN);
      else         addTriangleFace(positions, normals, v0, v2, v1, faceN);
    };

    // 1. Generate hole corner coordinates for all holes
    const oStarts: [number, number][] = [];
    const oEnds: [number, number][] = [];
    const iEnds: [number, number][] = [];
    const iStarts: [number, number][] = [];

    for (let k = 0; k < M; k++) {
      const cx_val = centers[k].cx;
      const cy_val = centers[k].cy;

      if (side === 'top') {
        oStarts.push([cx_val + S/2, cy_val + S/2]);
        oEnds.push([cx_val - S/2, cy_val + S/2]);
        iEnds.push([cx_val - S/2, cy_val - S/2]);
        iStarts.push([cx_val + S/2, cy_val - S/2]);
      } else if (side === 'bottom') {
        oStarts.push([cx_val - S/2, cy_val - S/2]);
        oEnds.push([cx_val + S/2, cy_val - S/2]);
        iEnds.push([cx_val + S/2, cy_val + S/2]);
        iStarts.push([cx_val - S/2, cy_val + S/2]);
      } else if (side === 'left') {
        oStarts.push([cx_val - S/2, cy_val + S/2]);
        oEnds.push([cx_val - S/2, cy_val - S/2]);
        iEnds.push([cx_val + S/2, cy_val - S/2]);
        iStarts.push([cx_val + S/2, cy_val + S/2]);
      } else { // right
        oStarts.push([cx_val + S/2, cy_val - S/2]);
        oEnds.push([cx_val + S/2, cy_val + S/2]);
        iEnds.push([cx_val - S/2, cy_val + S/2]);
        iStarts.push([cx_val - S/2, cy_val - S/2]);
      }
    }

    // 2. Right/Start Region
    rf(
      [p1[0], p1[1], z],
      [oStarts[0][0], oStarts[0][1], z],
      [iStarts[0][0], iStarts[0][1], z],
      [c1[0], c1[1], z]
    );

    // 3. Left/End Region
    rf(
      [oEnds[M-1][0], oEnds[M-1][1], z],
      [p2[0], p2[1], z],
      [c2[0], c2[1], z],
      [iEnds[M-1][0], iEnds[M-1][1], z]
    );

    // 4. Outer/Top Region
    const outerPts: [number, number][] = [];
    for (let k = 0; k < M; k++) {
      outerPts.push(oStarts[k], oEnds[k]);
    }
    for (let k = 0; k < 2 * M - 1; k++) {
      rt(
        [p1[0], p1[1], z],
        [outerPts[k+1][0], outerPts[k+1][1], z],
        [outerPts[k][0], outerPts[k][1], z]
      );
    }
    rt(
      [p1[0], p1[1], z],
      [p2[0], p2[1], z],
      [outerPts[2 * M - 1][0], outerPts[2 * M - 1][1], z]
    );

    // 5. Inner/Bottom Region
    const innerPts: [number, number][] = [];
    for (let k = 0; k < M; k++) {
      innerPts.push(iStarts[k], iEnds[k]);
    }
    for (let k = 0; k < 2 * M - 1; k++) {
      rt(
        [c1[0], c1[1], z],
        [innerPts[k][0], innerPts[k][1], z],
        [innerPts[k+1][0], innerPts[k+1][1], z]
      );
    }
    rt(
      [c1[0], c1[1], z],
      [innerPts[2 * M - 1][0], innerPts[2 * M - 1][1], z],
      [c2[0], c2[1], z]
    );

    // 6. Middle Region between holes (if M > 1)
    for (let k = 0; k < M - 1; k++) {
      rf(
        [oEnds[k][0], oEnds[k][1], z],
        [oStarts[k+1][0], oStarts[k+1][1], z],
        [iStarts[k+1][0], iStarts[k+1][1], z],
        [iEnds[k][0], iEnds[k][1], z]
      );
    }
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
        addCylindricalHole(positions, normals, c.cx, c.cy, S, D, depth, z0, true);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals)
  };
}

/**
 * Calculates the exact volume of the frame mesh in cubic millimeters (mm³).
 */
export function calculateFrameVolume(params: FrameParams): number {
  const {
    shape,
    wPic,
    lPic,
    clearance,
    tBorder,
    height,
    dPocket,
    sShelf,
    cornerRadius,
    hangerEnabled,
    hangerCount,
    hangerDiameter
  } = params;

  const wPocket = wPic + 2 * clearance;
  const lPocket = lPic + 2 * clearance;
  const wOut = wPocket + 2 * tBorder;
  const lOut = lPocket + 2 * tBorder;
  
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
    // Rectangular frame area = Width * Length - (4 - pi) * R^2
    const roundedFactor = 4 - Math.PI;
    const r = Math.min(cornerRadius, wOut / 2, lOut / 2);
    const outerArea = wOut * lOut - roundedFactor * r * r;

    outerVolume = outerArea * height;
    pocketVolume = wPocket * lPocket * dPocket;
    holeVolume = wHole * lHole * hShelf;
  }

  let totalVolume = outerVolume - pocketVolume - holeVolume;

  // Subtract hanger hole cylinder volumes if enabled
  if (hangerEnabled && tBorder > 4 && height > 4) {
    const S = Math.min(hangerDiameter, tBorder - 2);
    const depth = Math.min(height - 2, 8);
    const singleHoleVolume = Math.PI * (S / 2) * (S / 2) * depth;
    totalVolume -= hangerCount * singleHoleVolume;
  }

  return Math.max(0, totalVolume);
}
