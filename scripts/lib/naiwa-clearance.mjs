/** Actual skinned-surface check, independent of the runtime collision envelope.
 * A ray through each sampled arm vertex intersects the torso's front/back triangles.
 * The shared shoulder attachment is intentionally excluded (arm01–arm04 weights).
 */
import { Vector3 } from 'three';
export function createArmClearanceCheck(skin) {
  const geo = skin.geometry, ids = geo.attributes.skinIndex, weights = geo.attributes.skinWeight;
  const trunk = [], arms = [];
  for (let i = 0; i < ids.count; i++) {
    let body = 0, limb = 0;
    for (let j = 0; j < 4; j++) {
      const name = skin.skeleton.bones[ids.getComponent(i,j)].name, weight = weights.getComponent(i,j);
      if (['pelvis','spine','chest','neck','head'].includes(name)) body += weight;
      if (/^(arm(0[5-9]|1[0-4])|hand|finger|thumb)/.test(name)) limb += weight;
    }
    trunk.push(body > .9); if (limb > .96) arms.push(i);
  }
  const triangles = [], index = geo.index;
  for (let i = 0; i < index.count; i += 3) {
    const tri = [index.getX(i),index.getX(i+1),index.getX(i+2)];
    if (tri.every(v => trunk[v])) triangles.push(tri);
  }
  const sample = arms.filter((_, i) => i % Math.max(1, Math.floor(arms.length / 420)) === 0);
  return () => {
    skin.updateWorldMatrix(true,false);
    const world = i => skin.getVertexPosition(i,new Vector3()).applyMatrix4(skin.matrixWorld);
    const points = new Map([...new Set(triangles.flat())].map(i => [i, world(i)]));
    const faces = triangles.map(t => t.map(i => points.get(i))).filter(([a,b,c]) => Math.abs((b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y)) > 1e-10);
    let depth = 0, buried = 0, worst;
    for (const id of sample) {
      const p = world(id), hits = [];
      for (const [a,b,c] of faces) {
        if (p.x < Math.min(a.x,b.x,c.x) || p.x > Math.max(a.x,b.x,c.x) || p.y < Math.min(a.y,b.y,c.y) || p.y > Math.max(a.y,b.y,c.y)) continue;
        const denominator = (b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);
        const u = ((b.y-c.y)*(p.x-c.x)+(c.x-b.x)*(p.y-c.y)) / denominator;
        const v = ((c.y-a.y)*(p.x-c.x)+(a.x-c.x)*(p.y-c.y)) / denominator;
        if (u >= 0 && v >= 0 && u+v <= 1) hits.push(a.z*u+b.z*v+c.z*(1-u-v));
      }
      if (hits.length < 2) continue;
      const inside = Math.min(p.z-Math.min(...hits), Math.max(...hits)-p.z);
      if (inside > .012) buried++;
      if (inside > depth) { depth=inside; worst=p.toArray(); }
    }
    return { depth, buried, samples: sample.length, worst };
  };
}
