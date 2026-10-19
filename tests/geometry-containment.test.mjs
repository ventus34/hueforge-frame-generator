import assert from 'node:assert/strict';
import test from 'node:test';
import { generateFrameGeometry, generateSplitFrameParts } from '../src/utils/geometry.ts';
import { DEFAULT_PARAMS, normalizeFrameParams } from '../src/utils/params.ts';

const rayDirections = [
  [1, 0.3713906763541037, 0.5291502622129182],
  [0.4193139346887673, 1, 0.2718281828459045],
  [0.6180339887498948, 0.4142135623730951, 1]
];

function prepareTriangles(positions) {
  const triangles = [];
  for (let offset = 0; offset < positions.length; offset += 9) {
    const a = [positions[offset], positions[offset + 1], positions[offset + 2]];
    const b = [positions[offset + 3], positions[offset + 4], positions[offset + 5]];
    const c = [positions[offset + 6], positions[offset + 7], positions[offset + 8]];
    const edge1 = b.map((value, axis) => value - a[axis]);
    const edge2 = c.map((value, axis) => value - a[axis]);
    triangles.push({ a, edge1, edge2 });
  }
  return triangles;
}

function rayHitCount(point, direction, triangles) {
  const hits = [];
  for (const { a, edge1, edge2 } of triangles) {
    const h = [
      direction[1] * edge2[2] - direction[2] * edge2[1],
      direction[2] * edge2[0] - direction[0] * edge2[2],
      direction[0] * edge2[1] - direction[1] * edge2[0]
    ];
    const determinant = edge1[0] * h[0] + edge1[1] * h[1] + edge1[2] * h[2];
    if (Math.abs(determinant) < 1e-10) continue;

    const inverse = 1 / determinant;
    const fromA = point.map((value, axis) => value - a[axis]);
    const u = (fromA[0] * h[0] + fromA[1] * h[1] + fromA[2] * h[2]) * inverse;
    if (u < -1e-9 || u > 1 + 1e-9) continue;

    const q = [
      fromA[1] * edge1[2] - fromA[2] * edge1[1],
      fromA[2] * edge1[0] - fromA[0] * edge1[2],
      fromA[0] * edge1[1] - fromA[1] * edge1[0]
    ];
    const v = (direction[0] * q[0] + direction[1] * q[1] + direction[2] * q[2]) * inverse;
    if (v < -1e-9 || u + v > 1 + 1e-9) continue;

    const distance = (edge2[0] * q[0] + edge2[1] * q[1] + edge2[2] * q[2]) * inverse;
    if (distance > 1e-8) hits.push(distance);
  }

  // A ray through the diagonal shared by two triangles on the same planar face
  // must count as one surface crossing, not two.
  hits.sort((first, second) => first - second);
  let uniqueHits = 0;
  let previousHit = Number.NEGATIVE_INFINITY;
  for (const hit of hits) {
    if (Math.abs(hit - previousHit) > 1e-7) {
      uniqueHits++;
      previousHit = hit;
    }
  }
  return uniqueHits;
}

function containsPoint(point, triangles) {
  const insideVotes = rayDirections.filter(direction => (
    rayHitCount(point, direction, triangles) % 2 === 1
  )).length;
  return insideVotes >= 2;
}

function checkProbes(paramsInput, probes, label) {
  const params = normalizeFrameParams({ ...DEFAULT_PARAMS, ...paramsInput, splitEnabled: true });
  const full = prepareTriangles(generateFrameGeometry(params).positions);
  const parts = generateSplitFrameParts(params).map(part => ({
    name: part.name,
    triangles: prepareTriangles(part.positions)
  }));

  for (const { point, expectedInside } of probes) {
    const fullContains = containsPoint(point, full);
    const containingParts = parts.filter(({ triangles }) => containsPoint(point, triangles));
    assert.equal(
      fullContains,
      expectedInside,
      `${label}: full frame occupancy at ${point.join(',')}`
    );
    assert.ok(
      containingParts.length <= 1,
      `${label}: parts overlap at ${point.join(',')}: ${containingParts.map(part => part.name).join(', ')}`
    );
    assert.equal(
      containingParts.length > 0,
      expectedInside,
      `${label}: split occupancy differs from full frame at ${point.join(',')}; parts: ${containingParts.map(part => part.name).join(', ') || 'none'}`
    );
  }
}

test('deep split half-lap profile preserves the pocket around the shelf-height seam', () => {
  checkProbes({
    shape: 'rect', jointType: 'half-lap', wPic: 50, lPic: 160, maxPartLength: 100,
    height: 40, dPocket: 38, tBorder: 3, sShelf: 1
  }, [
    // Lower ring material, the empty pocket just above the shelf, and the upper rail.
    { point: [24.5, 0.37, 1.5], expectedInside: true },
    { point: [24.5, 0.37, 2.25], expectedInside: false },
    { point: [25.6, 0.37, 2.75], expectedInside: true },
    // Outside the lap extension, the pocket must remain empty as well.
    { point: [24.5, 9.37, 2.25], expectedInside: false }
  ], 'deep half-lap');
});

test('ordinary half-lap and bowtie seams preserve full-frame occupancy without overlaps', () => {
  const common = {
    shape: 'rect', wPic: 180, lPic: 250, maxPartLength: 100,
    height: 12, dPocket: 3, tBorder: 8, sShelf: 4
  };
  checkProbes({ ...common, jointType: 'half-lap' }, [
    { point: [87.2, 0.37, 8.5], expectedInside: true },
    { point: [87.2, 0.37, 9.5], expectedInside: false },
    { point: [92.2, 0.37, 9.5], expectedInside: true }
  ], 'ordinary half-lap');

  checkProbes({ ...common, jointType: 'bowtie' }, [
    // The probes sit inside a rail, away from the mortises and the keyed seams.
    { point: [95, 0.37, 11], expectedInside: true },
    { point: [87.2, 0.37, 11], expectedInside: false }
  ], 'ordinary bowtie');
});
