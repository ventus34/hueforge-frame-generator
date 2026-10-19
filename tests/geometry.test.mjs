import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateFrameVolume,
  generateFrameGeometry,
  generateSplitFrameParts
} from '../src/utils/geometry.ts';
import { DEFAULT_PARAMS, normalizeFrameParams } from '../src/utils/params.ts';

const params = (overrides = {}) => normalizeFrameParams({ ...DEFAULT_PARAMS, ...overrides });

function inspectMesh(mesh) {
  const { positions, normals } = mesh;
  assert.equal(positions.length % 9, 0, 'positions must contain whole triangles');
  assert.equal(normals.length, positions.length, 'each vertex must have a normal');

  const edges = new Map();
  let degenerateTriangles = 0;
  let signedVolume = 0;
  const key = point => Array.from(point, value => Math.round(value * 1e4)).join(',');
  for (let offset = 0; offset < positions.length; offset += 9) {
    const a = positions.slice(offset, offset + 3);
    const b = positions.slice(offset + 3, offset + 6);
    const c = positions.slice(offset + 6, offset + 9);
    assert.ok([...a, ...b, ...c].every(Number.isFinite), 'mesh vertices must be finite');
    const ab = b.map((value, axis) => value - a[axis]);
    const ac = c.map((value, axis) => value - a[axis]);
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0]
    ];
    const area2 = Math.hypot(...cross);
    if (area2 < 1e-7) degenerateTriangles++;
    const normal = normals.slice(offset, offset + 3);
    assert.ok(Math.hypot(...normal) > 0.99, 'facet normals must be normalized');
    assert.ok(cross.reduce((sum, value, axis) => sum + value * normal[axis], 0) >= -1e-5, 'facet normals must agree with winding');
    signedVolume += (
      a[0] * (b[1] * c[2] - b[2] * c[1])
      + a[1] * (b[2] * c[0] - b[0] * c[2])
      + a[2] * (b[0] * c[1] - b[1] * c[0])
    ) / 6;

    const points = [a, b, c].map(key);
    for (let index = 0; index < 3; index++) {
      const edge = [points[index], points[(index + 1) % 3]].sort().join('|');
      const direction = points[index] < points[(index + 1) % 3] ? 1 : -1;
      const edgeInfo = edges.get(edge) ?? { count: 0, direction: 0 };
      edgeInfo.count++;
      edgeInfo.direction += direction;
      edges.set(edge, edgeInfo);
    }
  }
  return {
    degenerateTriangles,
    unmatchedEdges: [...edges.values()].filter(({ count }) => count === 1).length,
    overusedEdges: [...edges.values()].filter(({ count }) => count > 2).length,
    orientationDefects: [...edges.values()].filter(({ count, direction }) => count === 2 && direction !== 0).length,
    signedVolume
  };
}

function assertClosed(mesh, label) {
  const stats = inspectMesh(mesh);
  assert.equal(stats.degenerateTriangles, 0, `${label} must not contain degenerate triangles`);
  assert.equal(stats.unmatchedEdges, 0, `${label} must be a closed manifold`);
  assert.equal(stats.overusedEdges, 0, `${label} must not have non-manifold edges`);
  assert.equal(stats.orientationDefects, 0, `${label} adjacent triangles must traverse shared edges in opposite directions`);
  assert.ok(stats.signedVolume > 0, `${label} must have outward winding`);
  return stats;
}

function splitPartLongitudinalSpan(part, shape) {
  const match = part.name.match(/(?:Side (\d+)|Top|Bottom|Left|Right)/);
  assert.ok(match, `part name identifies its rail: ${part.name}`);
  const positions = part.positions;
  const [axisX, axisY] = shape === 'rect'
    ? part.name.startsWith('Top') || part.name.startsWith('Bottom') ? [1, 0] : [0, 1]
    : (() => {
      const sideIndex = Number(match[1]) - 1;
      const angle = sideIndex * Math.PI / 3 + (2 * Math.PI) / 3;
      return [Math.cos(angle), Math.sin(angle)];
    })();
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let offset = 0; offset < positions.length; offset += 3) {
    const projection = positions[offset] * axisX + positions[offset + 1] * axisY;
    minimum = Math.min(minimum, projection);
    maximum = Math.max(maximum, projection);
  }
  return maximum - minimum;
}

function containsPointInMesh(point, positions) {
  const direction = [1, Math.sqrt(2) / 7, Math.sqrt(3) / 11];
  const intersections = [];
  for (let offset = 0; offset < positions.length; offset += 9) {
    const a = positions.slice(offset, offset + 3);
    const b = positions.slice(offset + 3, offset + 6);
    const c = positions.slice(offset + 6, offset + 9);
    const edge1 = b.map((value, axis) => value - a[axis]);
    const edge2 = c.map((value, axis) => value - a[axis]);
    const h = [
      direction[1] * edge2[2] - direction[2] * edge2[1],
      direction[2] * edge2[0] - direction[0] * edge2[2],
      direction[0] * edge2[1] - direction[1] * edge2[0]
    ];
    const determinant = edge1.reduce((sum, value, axis) => sum + value * h[axis], 0);
    if (Math.abs(determinant) < 1e-10) continue;
    const inverseDeterminant = 1 / determinant;
    const fromA = point.map((value, axis) => value - a[axis]);
    const u = fromA.reduce((sum, value, axis) => sum + value * h[axis], 0) * inverseDeterminant;
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    const q = [
      fromA[1] * edge1[2] - fromA[2] * edge1[1],
      fromA[2] * edge1[0] - fromA[0] * edge1[2],
      fromA[0] * edge1[1] - fromA[1] * edge1[0]
    ];
    const v = q.reduce((sum, value, axis) => sum + value * direction[axis], 0) * inverseDeterminant;
    if (v < -1e-9 || u + v > 1 + 1e-9) continue;
    const distance = edge2.reduce((sum, value, axis) => sum + value * q[axis], 0) * inverseDeterminant;
    if (distance > 1e-7) intersections.push(distance);
  }

  intersections.sort((first, second) => first - second);
  const uniqueIntersections = intersections.filter((distance, index) => (
    index === 0 || Math.abs(distance - intersections[index - 1]) > 1e-5
  ));
  return uniqueIntersections.length % 2 === 1;
}

test('full rectangular, rounded, and hexagonal frames are watertight and match reported volume', () => {
  for (const overrides of [
    {},
    { cornerRadius: 8 },
    { shape: 'hex' },
    { shape: 'hex', lPic: 50, sShelf: 40 }
  ]) {
    const frameParams = params(overrides);
    const mesh = generateFrameGeometry(frameParams);
    const stats = assertClosed(mesh, `full ${frameParams.shape} frame`);
    assert.ok(Math.abs(stats.signedVolume - calculateFrameVolume(frameParams)) < 0.05);
  }
});

test('full-frame blind mounting recesses are closed for both counts and every supported rail', () => {
  for (const hangerSide of ['top', 'bottom', 'left', 'right']) {
    for (const hangerCount of [1, 2]) {
      const frameParams = params({ hangerEnabled: true, hangerSide, hangerCount });
      assertClosed(generateFrameGeometry(frameParams), `${hangerSide} ${hangerCount}-recess frame`);
    }
  }
});

test('split rails remain closed around all supported joints and hanger seams stay clear', () => {
  for (const jointType of ['half-lap', 'dovetail', 'bowtie']) {
    for (const hangerEnabled of [false, true]) {
      const frameParams = params({
        splitEnabled: true,
        jointType,
        hangerEnabled,
        wPic: 180,
        lPic: 180,
        maxPartLength: 100
      });
      const parts = generateSplitFrameParts(frameParams);
      assert.ok(parts.length > 4, 'long rails should split into printable pieces');
      for (const part of parts) {
        assertClosed(part, `${part.name} (${jointType})`);
        assert.ok(
          splitPartLongitudinalSpan(part, frameParams.shape) <= frameParams.maxPartLength + 1e-3,
          `${part.name} must include its joint extents in the maximum length`
        );
      }
    }
  }
});

test('split hexagon parts respect maximum length and ignore the inactive rectangle length', () => {
  const first = params({ shape: 'hex', lPic: 200, splitEnabled: true, maxPartLength: 100, jointType: 'dovetail' });
  const second = params({ shape: 'hex', lPic: 1000, splitEnabled: true, maxPartLength: 100, jointType: 'dovetail' });
  const firstParts = generateSplitFrameParts(first);
  const secondParts = generateSplitFrameParts(second);
  assert.equal(secondParts.length, firstParts.length);
  for (let index = 0; index < firstParts.length; index++) {
    assert.equal(secondParts[index].name, firstParts[index].name);
    assert.deepEqual(secondParts[index].positions, firstParts[index].positions);
    assertClosed(secondParts[index], secondParts[index].name);
    assert.ok(splitPartLongitudinalSpan(secondParts[index], 'hex') <= second.maxPartLength + 1e-3);
  }
});

test('deep and shallow valid pockets work in full and split rectangular frames', () => {
  for (const [height, dPocket] of [[4, 2], [12, 10], [40, 1]]) {
    for (const jointType of ['half-lap', 'dovetail']) {
      const frameParams = params({ height, dPocket, jointType, wPic: 180, lPic: 240, splitEnabled: false });
      assertClosed(generateFrameGeometry(frameParams), `full height ${height} depth ${dPocket}`);
      const splitParams = { ...frameParams, splitEnabled: true, maxPartLength: 100 };
      for (const part of generateSplitFrameParts(splitParams)) {
        assertClosed(part, `${part.name} height ${height} depth ${dPocket}`);
      }
    }
  }
});

test('deep half-lap split seams stay outside the frame pocket above the shelf', () => {
  const frameParams = params({
    wPic: 50,
    lPic: 160,
    height: 40,
    dPocket: 38,
    tBorder: 3,
    sShelf: 1,
    splitEnabled: true,
    maxPartLength: 100,
    jointType: 'half-lap'
  });
  const point = [24.5, 0, 2.25];
  const fullMesh = generateFrameGeometry({ ...frameParams, splitEnabled: false });
  assert.equal(containsPointInMesh(point, fullMesh.positions), false, 'the reference full frame has a pocket at this point');

  const rightParts = generateSplitFrameParts(frameParams).filter(part => part.name.startsWith('Right'));
  assert.equal(rightParts.length, 2);
  for (const part of rightParts) {
    assert.equal(containsPointInMesh(point, part.positions), false, `${part.name} must not fill the pocket above the shelf`);
  }
});

test('split rectangular frames reject rounded corners instead of silently changing shape', () => {
  assert.throws(
    () => generateSplitFrameParts({ ...DEFAULT_PARAMS, splitEnabled: true, cornerRadius: 8 }),
    /corner radius/i
  );
});

test('split bowtie rails reject seams blocked by hanger clearance and corner joints', () => {
  const frameParams = params({
    splitEnabled: true,
    jointType: 'bowtie',
    hangerEnabled: true,
    wPic: 50,
    lPic: 50,
    tBorder: 30,
    sShelf: 23,
    maxPartLength: 100
  });
  assert.throws(
    () => generateSplitFrameParts(frameParams),
    /hanger.*no safe split seam/i
  );
});

test('direct geometry calls reject invalid hanger geometry and non-finite dimensions', () => {
  assert.throws(
    () => generateFrameGeometry({ ...DEFAULT_PARAMS, hangerEnabled: true, tBorder: 4 }),
    /border thickness/i
  );
  assert.throws(
    () => generateSplitFrameParts({ ...DEFAULT_PARAMS, splitEnabled: true, maxPartLength: Number.NaN }),
    /finite/i
  );
});
