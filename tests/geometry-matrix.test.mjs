import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSplitFrameParts, generateFrameGeometry } from '../src/utils/geometry.ts';
import { normalizeFrameParams,validateFrameParams, DEFAULT_PARAMS } from '../src/utils/params.ts';
import { exportBinarySTL } from '../src/utils/stlExporter.ts';
function inspectTopology(p) {
  let deg=0;const edges=new Map();const directed=new Map();
  const key=v=>v.map(x=>Math.round(x*1e4)).join(',');
  for(let i=0;i<p.length;i+=9){
    const a=Array.from(p.slice(i,i+3)),b=Array.from(p.slice(i+3,i+6)),c=Array.from(p.slice(i+6,i+9));
    const u=b.map((x,j)=>x-a[j]),v=c.map((x,j)=>x-a[j]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if(Math.hypot(...n)<1e-7){deg++;continue;}
    const k=[a,b,c].map(key);for(let j=0;j<3;j++){const e=[k[j],k[(j+1)%3]].sort().join('|');edges.set(e,(edges.get(e)??0)+1);directed.set(e,(directed.get(e)??0)+(k[j]<k[(j+1)%3]?1:-1));}
  }
  return {orientation:[...directed.entries()].filter(([e,n])=>edges.get(e)===2&&n!==0).length,deg,open:[...edges.values()].filter(n=>n===1).length,over:[...edges.values()].filter(n=>n>2).length};
}
test('valid parameter matrix yields consistently oriented closed meshes or an explicit infeasible-seam error', (t) => {
const failures = [];
let configs = 0;
let meshes = 0;
let infeasible = 0;
for(const shape of ['rect','hex'])for(const jointType of ['half-lap','dovetail','bowtie'])for(const d of [
  {wPic:180,lPic:180,maxPartLength:100},
  {wPic:200,lPic:300,maxPartLength:200,height:4,dPocket:2},
  {wPic:50,lPic:80,maxPartLength:100,height:40,dPocket:38,tBorder:3,sShelf:1},
  {wPic:50,lPic:160,maxPartLength:100,height:40,dPocket:38,tBorder:3,sShelf:1},
  {wPic:80,lPic:1000,maxPartLength:100,height:40,dPocket:1,tBorder:30,sShelf:23},
  {wPic:50,lPic:50,maxPartLength:100,tBorder:30,sShelf:23},
  {wPic:320,lPic:450,maxPartLength:200,height:12,dPocket:10},
])for(const hangerEnabled of [false,true])for(const splitEnabled of [false,true]){
  if(shape==='hex' && (jointType==='bowtie'||hangerEnabled))continue;
  const params=normalizeFrameParams({...DEFAULT_PARAMS,...d,shape,jointType,hangerEnabled,splitEnabled});
  if(validateFrameParams(params).length)continue;
  configs++;
  const tag={shape,jointType,hangerEnabled,splitEnabled,...d};
  try {
    const parts=splitEnabled?generateSplitFrameParts(params):[{name:'full',...generateFrameGeometry(params)}];
    for(const m of parts){meshes++;const s=inspectTopology(m.positions);if(s.deg||s.open||s.over||s.orientation)failures.push({params:tag,name:m.name,...s});exportBinarySTL(m.positions,m.normals);}
  }catch(e){if (/hanger clearance and bowtie corner joints leave no safe split seam/i.test(e.message)) infeasible++; else failures.push({params:tag,error:e.message});}
}
assert.ok(configs >= 80);
assert.ok(meshes >= 450);
assert.ok(infeasible <= 1);
assert.deepEqual(failures, [], JSON.stringify(failures.slice(0, 5), null, 2));
t.diagnostic(`${configs} configurations, ${meshes} meshes; ${infeasible} generation-time rejections.`);
});
