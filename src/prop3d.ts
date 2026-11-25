import * as THREE from 'three';
import type { PropKind } from './prop';

export interface Prop3DHandle {
  group: THREE.Group;
  mouthAnchor: THREE.Vector3;
  gripAnchor: THREE.Vector3;
  shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  update(level: number): void;
  dispose(): void;
}

/** Real silhouettes at desk scale: a can, an open mug, a sealed tea cup and custard. */
export function createProp3D(kind: PropKind): Prop3DHandle {
  const group = new THREE.Group();
  group.name = 'drink-' + kind;
  const h = kind === 'pudding' ? 0.17 : kind === 'coffee' ? 0.30 : kind === 'energy' ? 0.36 : 0.34;
  const r = kind === 'energy' ? 0.10 : 0.112;
  const material = (color: string, metallic = false) => new THREE.MeshStandardMaterial({
    color, roughness: metallic ? 0.32 : 0.58, metalness: metallic ? 0.65 : 0,
  });
  const add = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  const cylinder = (name: string, top: number, bottom: number, height: number, y: number, mat: THREE.Material, open = false) =>
    add(name, new THREE.CylinderGeometry(top, bottom, height, 32, 1, open), mat, 0, y);
  const ring = (name: string, radius: number, tube: number, y: number, mat: THREE.Material) => {
    const mesh = add(name, new THREE.TorusGeometry(radius, tube, 8, 32), mat, 0, y);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  };
  const silver = material('#ccd2d6', true);
  const cream = material('#f4ece0');
  let liquid: THREE.Mesh | null = null;
  const mouthAnchor = new THREE.Vector3(0, h, -r * 0.75);
  const gripAnchor = new THREE.Vector3(0, h * 0.48, -r * 0.94);

  if (kind === 'cola' || kind === 'energy') {
    const shell = material(kind === 'cola' ? '#bc282d' : '#172620', true);
    cylinder('painted-can', r, r, h - 0.035, h / 2, shell);
    cylinder('top-shoulder', r * 0.88, r, 0.022, h - 0.018, silver);
    cylinder('recessed-lid', r * 0.88, r * 0.88, 0.008, h - 0.004, silver);
    ring('rolled-top-rim', r * 0.90, 0.007, h, silver);
    ring('rolled-base-rim', r * 0.92, 0.006, 0.012, silver);
    const opening = add('drinking-opening', new THREE.SphereGeometry(1, 20, 10), material('#14191a'), 0, h + 0.001, -r * 0.47);
    opening.scale.set(r * 0.32, 0.002, r * 0.23);
    const tab = ring('pull-tab', r * 0.23, 0.006, h + 0.009, silver);
    tab.scale.set(0.70, 1.25, 1);
    tab.position.z = r * 0.12;
    mouthAnchor.set(0, h + 0.008, -r * 0.55);
    // A wrapped print has no fake liquid window on an opaque aluminium can.
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = kind === 'cola' ? '#bc282d' : '#172620'; ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = kind === 'cola' ? '#fff5e4' : '#baff5b';
    ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center';
    for (const x of [64, 192]) {
      ctx.fillText(kind === 'cola' ? 'COLA' : 'ENERGY', x, 65, 112);
      ctx.fillRect(x - 43, 81, 86, 3);
      ctx.font = '11px sans-serif'; ctx.fillText('KURO • 250 ml', x, 101); ctx.font = 'bold 30px sans-serif';
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const print = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.48, metalness: 0.12 });
    cylinder('wrapped-label', r + 0.001, r + 0.001, h * 0.70, h * 0.50, print, true);
  } else if (kind === 'coffee') {
    const profile = [new THREE.Vector2(0, 0.012), new THREE.Vector2(r * 0.78, 0.012),
      new THREE.Vector2(r, h), new THREE.Vector2(r - 0.014, h),
      new THREE.Vector2(r * 0.78 - 0.014, 0.032), new THREE.Vector2(0, 0.032)];
    add('ceramic-mug', new THREE.LatheGeometry(profile, 32), cream);
    ring('ceramic-lip', r - 0.007, 0.008, h, cream);
    const handle = add('mug-handle', new THREE.TorusGeometry(0.069, 0.017, 10, 28), cream, 0, h * 0.56, -r - 0.035);
    handle.rotation.y = Math.PI / 2;
    handle.scale.y = 1.2;
    gripAnchor.set(0, h * 0.56, -r - 0.092);
    liquid = cylinder('coffee-surface', r - 0.018, r - 0.018, 0.006, h * 0.82, material('#422617'));
    ring('coffee-crema', r - 0.021, 0.004, h * 0.82 + 0.004, material('#aa7749'));
    mouthAnchor.set(0, h, r * 0.88); // Sip from the lip opposite the handle.
  } else if (kind === 'boba') {
    const plastic = new THREE.MeshStandardMaterial({ color: '#e4f1ef', transparent: true, opacity: 0.20,
      roughness: 0.24, depthWrite: false, side: THREE.DoubleSide });
    cylinder('clear-tapered-cup', r, r * 0.76, h, h / 2, plastic, true);
    liquid = cylinder('milk-tea', r * 0.94, r * 0.73, h * 0.78, h * 0.40, material('#cba783'));
    for (let i = 0; i < 16; i++) {
      const a = i * 2.39996;
      const rad = r * (0.74 + (i % 2) * 0.03);
      add('tapioca-pearl', new THREE.SphereGeometry(0.016, 10, 8), material('#34221b'),
        Math.cos(a) * rad, 0.026 + (i % 3) * 0.016, Math.sin(a) * rad);
    }
    // Pearls sit in front of the tea near the clear wall and remain visible.
    for (const child of group.children.filter(c => c.name === 'tapioca-pearl')) child.renderOrder = 1;
    cylinder('sealed-lid', r * 1.06, r * 1.06, 0.014, h, cream);
    ring('lid-rim', r * 1.02, 0.005, h + 0.008, silver);
    const straw = cylinder('wide-straw', 0.012, 0.012, 0.25, h + 0.07, material('#a95345'), true);
    straw.position.x = r * 0.27;
    straw.position.z = -r * 0.18;
    mouthAnchor.set(straw.position.x, h + 0.195, straw.position.z);
  } else {
    cylinder('porcelain-plate', r * 1.36, r * 1.23, 0.018, 0.011, cream);
    ring('plate-rim', r * 1.25, 0.008, 0.024, cream);
    liquid = cylinder('custard', r * 0.70, r, h - 0.035, h / 2 + 0.015, material('#efce7c'));
    cylinder('caramel-cap', r * 0.71, r * 0.74, 0.014, h, material('#99502a'));
    mouthAnchor.set(0, h + 0.007, -r * 0.45);
    gripAnchor.set(0, 0.025, -r * 1.20);
  }

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(r * 1.4, 24),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  return {
    group, shadow, mouthAnchor, gripAnchor,
    update(level: number) {
      const fill = THREE.MathUtils.clamp(level, 0, 1);
      if (liquid && kind === 'boba') {
        liquid.scale.y = Math.max(0.04, fill);
        liquid.position.y = 0.012 + h * 0.39 * Math.max(0.04, fill);
      } else if (liquid && kind === 'coffee') {
        liquid.position.y = 0.045 + (h * 0.82 - 0.045) * fill;
        liquid.scale.setScalar(0.80 + 0.20 * fill);
        const crema = group.getObjectByName('coffee-crema')!;
        crema.position.y = liquid.position.y + 0.004;
        crema.scale.setScalar(0.80 + 0.20 * fill);
      }
      shadow.position.set(group.position.x, 0.002, group.position.z);
      shadow.material.opacity = 0.18 * Math.exp(-Math.max(0, group.position.y) * 2.4);
    },
    dispose() {
      const materials = new Set<THREE.Material>();
      group.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        for (const mat of Array.isArray(child.material) ? child.material : [child.material]) materials.add(mat);
      });
      for (const mat of materials) {
        (mat as THREE.MeshStandardMaterial).map?.dispose();
        mat.dispose();
      }
      shadow.geometry.dispose(); shadow.material.dispose();
    },
  };
}
