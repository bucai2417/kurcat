import * as THREE from 'three';

/** Project visible meshes, including handles/straws, into the rendered canvas. */
export function modelHitArea(root: THREE.Object3D, camera: THREE.Camera,
  width: number, height: number, padding = 9): { cx: number; cy: number; rx: number; ry: number } | null {
  root.updateWorldMatrix(true, true);
  camera.updateWorldMatrix(true, false);
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const point = new THREE.Vector3();
  root.traverseVisible((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geometry = obj.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = obj instanceof THREE.SkinnedMesh ? obj.boundingBox ?? geometry.boundingBox : geometry.boundingBox;
    if (!box) return;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        point.set(x, y, z).applyMatrix4(obj.matrixWorld).project(camera);
        if (!Number.isFinite(point.x + point.y) || point.z < -1 || point.z > 1) continue;
        const px = (point.x + 1) * width / 2, py = (1 - point.y) * height / 2;
        left = Math.min(left, px); right = Math.max(right, px);
        top = Math.min(top, py); bottom = Math.max(bottom, py);
      }
  });
  if (left === Infinity || width < 2 || height < 2) return null;
  left = Math.max(0, left - padding); right = Math.min(width, right + padding);
  top = Math.max(0, top - padding); bottom = Math.min(height, bottom + padding);
  if (right <= left || bottom <= top) return null;
  return { cx: (left + right) / (2 * width), cy: (top + bottom) / (2 * height),
    rx: (right - left) / (2 * width), ry: (bottom - top) / (2 * height) };
}
