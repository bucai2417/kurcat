import * as THREE from 'three';
import type { PropKind } from './prop';

/**
 * A 3D drink cup for the desktop pet.
 *
 * The 2D engine paints its prop with Canvas2D; this is the Three.js counterpart,
 * built from the same palette so both render modes show the same drinks. It lives
 * in world space (next to the keyboard) and exposes a mouth anchor the drink
 * animation lerps toward.
 */

const LOOKS: Record<
  PropKind,
  {
    body: string;
    liquid: string;
    lid: string;
    accent: string;
    height: number;
    radius: number;
    form: 'can' | 'cup' | 'pudding';
  }
> = {
  cola: { body: '#3a2418', liquid: '#5a1f10', lid: '#d94a3a', accent: '#ff6b4a', height: 0.34, radius: 0.105, form: 'can' },
  coffee: { body: '#f2ede4', liquid: '#5a3a22', lid: '#8a5a3a', accent: '#c98a4b', height: 0.30, radius: 0.112, form: 'cup' },
  boba: { body: '#e8d5c4', liquid: '#6b4630', lid: '#3a2a22', accent: '#2a1a12', height: 0.34, radius: 0.112, form: 'cup' },
  energy: { body: '#1a1c24', liquid: '#3a8a3a', lid: '#8ce03a', accent: '#b6ff4a', height: 0.36, radius: 0.100, form: 'can' },
  pudding: { body: '#f5d68a', liquid: '#c98a2a', lid: '#8a5a1a', accent: '#fff0c0', height: 0.17, radius: 0.115, form: 'pudding' },
};

export interface Prop3DHandle {
  group: THREE.Group;
  /** Local anchors transformed by the engine with the rigid cup. */
  mouthAnchor: THREE.Vector3;
  gripAnchor: THREE.Vector3;
  /** A separate ground shadow; it never rides up with the cup. */
  shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  update(level: number): void;
  dispose(): void;
}

export function createProp3D(kind: PropKind): Prop3DHandle {
  const look = LOOKS[kind];
  const group = new THREE.Group();

  const bodyGeo =
    look.form === 'pudding'
      ? new THREE.CylinderGeometry(look.radius * 0.72, look.radius, look.height, 26, 1)
      : new THREE.CylinderGeometry(
          look.radius * (look.form === 'can' ? 0.96 : 1.06),
          look.radius,
          look.height,
          26,
          1,
        );
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: look.body }));
  body.position.y = look.height / 2;
  group.add(body);

  // Liquid band near the rim so the fill level reads at a glance.
  const liquid = new THREE.Mesh(
    new THREE.CylinderGeometry(look.radius * 0.94, look.radius * 0.94, look.height * 0.16, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: look.liquid, transparent: true, opacity: 0.9 }),
  );
  liquid.position.y = look.height * 0.78;
  group.add(liquid);

  const rimR = look.radius * (look.form === 'can' ? 1.0 : 1.08);
  const lid = new THREE.Mesh(
    new THREE.CylinderGeometry(rimR, rimR, look.height * 0.09, 24),
    new THREE.MeshBasicMaterial({ color: look.lid }),
  );
  lid.position.y = look.height + look.height * 0.02;
  group.add(lid);

  const mouthAnchor = new THREE.Vector3(0, look.height + look.radius * 0.74 * 0.55, 0);
  if (look.form === 'pudding') {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(look.radius * 0.74, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: look.accent }),
    );
    cap.scale.y = 0.55;
    cap.position.y = look.height;
    group.add(cap);
  } else {
    // Label band, so the drink is identifiable at pet scale.
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(look.radius * 1.005, look.radius * 1.005, look.height * 0.22, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: look.accent }),
    );
    stripe.position.y = look.height * 0.46;
    group.add(stripe);

    // Straw poking out of the lid, angled toward the cat.
    const straw = new THREE.Mesh(
      new THREE.CylinderGeometry(look.radius * 0.10, look.radius * 0.10, look.height * 0.9, 10),
      new THREE.MeshBasicMaterial({ color: look.accent }),
    );
    straw.position.set(look.radius * 0.28, look.height * 0.95, look.radius * 0.12);
    straw.rotation.z = -0.22;
    group.add(straw);
    mouthAnchor.set(0, look.height * 0.45, 0).applyEuler(straw.rotation).add(straw.position);
  }

  // Soft contact shadow so the cup does not float.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(look.radius * 1.35, 24),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  const liquidBaseY = liquid.position.y;

  return {
    group,
    shadow,
    mouthAnchor,
    gripAnchor: new THREE.Vector3(0, look.height * 0.48, -look.radius * 0.90),
    update(level: number) {
      const fill = Math.max(0.05, level);
      liquid.position.y = liquidBaseY - (1 - fill) * look.height * 0.42;
      liquid.scale.y = Math.max(0.35, fill);
      shadow.position.set(group.position.x, 0.002, group.position.z);
      shadow.material.opacity = 0.18 * Math.exp(-Math.max(0, group.position.y) * 4);
      shadow.visible = shadow.material.opacity > 0.01;
    },
    dispose() {
      shadow.geometry.dispose();
      shadow.material.dispose();
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
    },
  };
}
