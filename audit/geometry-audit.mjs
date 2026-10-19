// Run with Node.js >= 24: node audit/geometry-audit.mjs
// Diagnostic only: edge incidence does not detect self-intersections or repair T-junctions.
import { generateFrameGeometry, generateSplitFrameParts, calculateFrameVolume } from '../src/utils/geometry.ts';
import { exportBinarySTL } from '../src/utils/stlExporter.ts';

const defaults = {
  shape: 'rect', wPic: 200, lPic: 200, clearance: 0.2, tBorder: 8,
  height: 12, dPocket: 3, sShelf: 4, cornerRadius: 0,
  hangerEnabled: false, hangerSide: 'top', hangerCount: 1, hangerDiameter: 8,
  splitEnabled: false, maxPartLength: 200, jointType: 'half-lap',
};

function inspect({ positions: p, normals }) {
  const edges = new Map();
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let degenerate = 0, volume = 0, inconsistentNormals = 0;
  const key = v => v.map(x => Math.round(x * 1e4)).join(',');
  for (let i = 0; i < p.length; i += 9) {
    const a = Array.from(p.slice(i, i + 3));
    const b = Array.from(p.slice(i + 3, i + 6));
    const c = Array.from(p.slice(i + 6, i + 9));
    for (const v of [a, b, c]) for (let j = 0; j < 3; j++) {
      min[j] = Math.min(min[j], v[j]); max[j] = Math.max(max[j], v[j]);
    }
    const u = b.map((x, j) => x - a[j]), v = c.map((x, j) => x - a[j]);
    const cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    if (Math.hypot(...cross) < 1e-7) { degenerate++; continue; }
    if (cross.reduce((sum, x, j) => sum + x * normals[i+j], 0) < -1e-5) inconsistentNormals++;
    volume += (a[0]*(b[1]*c[2]-b[2]*c[1]) + a[1]*(b[2]*c[0]-b[0]*c[2]) + a[2]*(b[0]*c[1]-b[1]*c[0])) / 6;
    const keys = [a,b,c].map(key);
    for (let j = 0; j < 3; j++) {
      const edge = [keys[j], keys[(j+1)%3]].sort().join('|');
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  return {
    triangles: p.length / 9, degenerate, inconsistentNormals,
    unmatchedEdges: [...edges.values()].filter(n => n === 1).length,
    overusedEdges: [...edges.values()].filter(n => n > 2).length,
    bounds: max.map((x,j) => +(x-min[j]).toFixed(4)),
    signedVolume: +volume.toFixed(3),
    finite: p.every(Number.isFinite),
  };
}

const results = [];
for (const [name, changes] of [
  ['rectangle', {}], ['rounded', {cornerRadius: 8}],
  ['hexagon', {shape: 'hex'}],
  ['hexagon-wide-shelf', {shape: 'hex', sShelf: 40}],
  ['hexagon-after-short-rectangle', {shape: 'hex', lPic: 50, sShelf: 40}],
  ['hanger', {hangerEnabled: true}],
  ['two-hangers', {hangerEnabled: true, hangerCount: 2}],
]) {
  const params = {...defaults, ...changes};
  results.push({name, ...inspect(generateFrameGeometry(params)), hudVolume: +calculateFrameVolume(params).toFixed(3)});
}
for (const shape of ['rect', 'hex']) for (const jointType of ['half-lap', 'dovetail', 'bowtie']) {
  if (shape === 'hex' && jointType === 'bowtie') continue;
  for (const hangerEnabled of [false, true]) {
    if (shape === 'hex' && hangerEnabled) continue;
    const params = {...defaults, shape, jointType, hangerEnabled, splitEnabled: true, wPic: 180, lPic: 180, maxPartLength: 100};
    const parts = generateSplitFrameParts(params).map(part => ({name: part.name, ...inspect(part)}));
    results.push({name: `${shape}-${jointType}-hanger=${hangerEnabled}`, maxPartLength: 100, parts});
  }
}
let malformedInput;
try {
  exportBinarySTL(new Float32Array([1,2,3]), new Float32Array());
  malformedInput = 'accepted';
} catch (error) {
  malformedInput = error.message;
}
// Vertical ray intersection at a point away from edges; compare lower/upper lap occupancy.
function containsPoint(mesh, point) {
  const p = mesh.positions, hits = [];
  for (let i = 0; i < p.length; i += 9) {
    const a = Array.from(p.slice(i,i+3)), b = Array.from(p.slice(i+3,i+6)), c = Array.from(p.slice(i+6,i+9));
    const det = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    if (Math.abs(det) < 1e-8) continue;
    const u = ((b[1]-c[1])*(point[0]-c[0])+(c[0]-b[0])*(point[1]-c[1]))/det;
    const v = ((c[1]-a[1])*(point[0]-c[0])+(a[0]-c[0])*(point[1]-c[1]))/det;
    if (u < 0 || v < 0 || u+v > 1) continue;
    const z = u*a[2]+v*b[2]+(1-u-v)*c[2];
    if (z > point[2]+1e-6 && !hits.some(h => Math.abs(h-z)<1e-5)) hits.push(z);
  }
  return hits.length % 2 === 1;
}
const lapParts = generateSplitFrameParts({...defaults, wPic:180, lPic:180, maxPartLength:100});
const lapOccupancy = [3,9].map(z => ({point:[0.37,94.03,z], containingParts:lapParts.filter(p => containsPoint(p,[0.37,94.03,z])).map(p=>p.name)}));
console.log(JSON.stringify({ cases: results, lapOccupancy, malformedSTLInput: malformedInput }, null, 2));
