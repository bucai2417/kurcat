/** Offline review of real deformed meshes; optional, not a WebGL screenshot.
 * Canvas label textures and screen-space FX are unavailable in the test renderer.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { Matrix4, Vector3, Quaternion, Color } from 'three';

export function createNaiwaReview(bytes) {
  const dir = new URL('../../node_modules/.cache/naiwa-live-review/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const jsonLength = bytes.readUInt32LE(12);
  const meta = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const binary = 28 + jsonLength;
  for (const [i, image] of (meta.images ?? []).entries()) {
    const view = meta.bufferViews[image.bufferView];
    const start = binary + (view.byteOffset ?? 0);
    writeFileSync(new URL(`texture-${i}.png`, dir), bytes.subarray(start, start + view.byteLength));
  }
  return (name, scene, camera) => {
    scene.updateMatrixWorld(true);
    const meshes = [], p = new Vector3(), matrix = new Matrix4();
    scene.traverseVisible(m => {
      if (!m.isMesh || !m.geometry.attributes.position) return;
      const g = m.geometry;
      const materials = Array.isArray(m.material) ? m.material : [m.material];
      if (materials.every(mat => mat.transparent && mat.opacity < .05)) return;
      // Screen shadow/label planes require mocked Canvas textures; omit those layers.
      if (materials.every(mat => mat.map?.isCanvasTexture && mat.transparent)) return;
      for (let instance = 0; instance < (m.isInstancedMesh ? m.count : 1); instance++) {
        matrix.copy(m.matrixWorld);
        if (m.isInstancedMesh) {
          const local = new Matrix4(); m.getMatrixAt(instance, local); matrix.multiply(local);
        }
        const positions = [];
        for (let i = 0; i < g.attributes.position.count; i++) {
          m.getVertexPosition(i, p).applyMatrix4(matrix); positions.push(p.x, p.y, p.z);
        }
        const indices = Array.from(g.index?.array ?? Array.from({ length: positions.length / 3 }, (_, i) => i));
        const groups = g.groups.length && Array.isArray(m.material) ? g.groups : [{start: 0, count: indices.length, materialIndex: 0}];
        for (const group of groups) {
          const mat = materials[group.materialIndex];
          const color = mat.color?.clone() ?? new Color('#dedad1');
          if (m.isInstancedMesh && m.instanceColor) { const c = new Color(); m.getColorAt(instance, c); color.multiply(c); }
          const original = meta.materials.find(x => x.name === mat.name);
          meshes.push({ name: m.name || `desk-${meshes.length}`, positions,
            indices: indices.slice(group.start, group.start + group.count),
            uv: Array.from(g.attributes.uv?.array ?? []), color: color.toArray(),
            colors: mat.vertexColors ? Array.from(g.attributes.color?.array ?? []) : [],
            texture: original?.pbrMetallicRoughness?.baseColorTexture?.index ?? null,
            roughness: mat.roughness ?? .65, metallic: mat.metalness ?? 0,
            opacity: mat.transparent ? mat.opacity : 1,
          });
        }
      }
    });
    camera.updateMatrixWorld(true);
    const pos = camera.getWorldPosition(new Vector3()), rot = camera.getWorldQuaternion(new Quaternion());
    writeFileSync(new URL(name + '.json', dir), JSON.stringify({ meshes, meta: { textures: meta.textures },
      camera: { position: pos.toArray(), quaternion: rot.toArray(), ortho: !!camera.isOrthographicCamera,
        height: (camera.top - camera.bottom) / camera.zoom, aspect: camera.aspect ?? (camera.right - camera.left) / (camera.top - camera.bottom), fov: camera.fov },
      contacts: Object.fromEntries(['mouth','gripLeft','gripRight','handL','handR','arm09L','arm09R'].flatMap(name => {
        const o = scene.getObjectByName(name); return o ? [[name, o.getWorldPosition(new Vector3()).toArray()]] : [];
      })),
      limitations: 'Offline Blender rendering of engine geometry. Canvas labels and screen-space effects omitted.',
    }));
  };
}
