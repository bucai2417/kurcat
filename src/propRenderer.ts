import type { PropKind } from './prop';

interface PropLook {
  body: string;
  bodyDark: string;
  accent: string;
  liquid: string;
  liquidDark: string;
  label: string;
  width: number;
  height: number;
}

const LOOKS: Record<PropKind, PropLook> = {
  cola: {
    body: '#c0392b',
    bodyDark: '#8e2820',
    accent: '#ffffff',
    liquid: '#5a1a12',
    liquidDark: '#3a0f0a',
    label: 'COLA',
    width: 22,
    height: 40,
  },
  coffee: {
    body: '#f4efe6',
    bodyDark: '#d8cfc0',
    accent: '#6f4a2f',
    liquid: '#5a3520',
    liquidDark: '#38200f',
    label: '',
    width: 24,
    height: 32,
  },
  boba: {
    body: 'rgba(246, 240, 232, 0.92)',
    bodyDark: '#d3c7b6',
    accent: '#a9714b',
    liquid: '#c9a887',
    liquidDark: '#8a6a4a',
    label: '',
    width: 22,
    height: 42,
  },
  energy: {
    body: '#1f6f4a',
    bodyDark: '#144a31',
    accent: '#c9ff4d',
    liquid: '#0e3b24',
    liquidDark: '#072216',
    label: '⚡',
    width: 20,
    height: 42,
  },
  pudding: {
    body: '#f6e2b3',
    bodyDark: '#d9bf83',
    accent: '#b3541e',
    liquid: '#e8b96a',
    liquidDark: '#b8873a',
    label: '',
    width: 30,
    height: 24,
  },
};

export interface PropRenderState {
  kind: PropKind;
  level: number;
  /** 0..1 tilt amount while sipping (leaned toward the cat). */
  tilt: number;
  /** Which side of the cat the prop sits on. */
  side: 'left' | 'right';
  /** Bubbles rising after drinking cola. */
  fizz: number;
  time: number;
}

export function propLook(kind: PropKind): PropLook {
  return LOOKS[kind];
}

/** Contact in the same local coordinates used to draw the prop. */
export function propMouthContact(kind: PropKind): { x: number; y: number } {
  const look = LOOKS[kind];
  return kind === 'boba'
    ? { x: look.width * 0.1 + 1.55, y: -look.height - 11 }
    : { x: 0, y: -look.height };
}

/**
 * Draws the drink prop. Origin is the prop's base centre, +Y is down.
 *
 * Hand-drawn per kind rather than one generic cup so each reads instantly at
 * the ~30px size the pet renders at.
 */
export function drawProp(ctx: CanvasRenderingContext2D, st: PropRenderState): void {
  const look = LOOKS[st.kind];
  const lean = st.side === 'right' ? -1 : 1;

  ctx.save();
  ctx.translate(0, 0);
  ctx.rotate((lean * st.tilt * 16 * Math.PI) / 180);

  // Contact shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 2, look.width * 0.56, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  switch (st.kind) {
    case 'pudding':
      drawPudding(ctx, look, st);
      break;
    case 'boba':
      drawBoba(ctx, look, st);
      break;
    case 'coffee':
      drawCoffee(ctx, look, st);
      break;
    default:
      drawCan(ctx, look, st);
      break;
  }

  if (st.fizz > 0.01) drawFizz(ctx, look, st);

  ctx.restore();
}

function drawCan(ctx: CanvasRenderingContext2D, look: PropLook, st: PropRenderState): void {
  const w = look.width;
  const h = look.height;
  const top = -h;

  // Body
  const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  grad.addColorStop(0, look.bodyDark);
  grad.addColorStop(0.34, look.body);
  grad.addColorStop(0.72, look.body);
  grad.addColorStop(1, look.bodyDark);
  ctx.fillStyle = grad;
  roundRect(ctx, -w / 2, top, w, h, w * 0.18);
  ctx.fill();

  // Top rim + lid
  ctx.fillStyle = '#c8ccd2';
  ctx.beginPath();
  ctx.ellipse(0, top, w * 0.5, w * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9aa0a8';
  ctx.beginPath();
  ctx.ellipse(0, top + 0.6, w * 0.34, w * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Recessed aluminium lid, drinking opening and ring pull.
  ctx.fillStyle = '#353b3f';
  ctx.beginPath(); ctx.ellipse(0, top + 1, w * 0.15, 1.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#eef3f6'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0, top + 3.3, w * 0.13, 1.6, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(238,244,248,0.65)';
  ctx.beginPath(); ctx.ellipse(0, -1.5, w * 0.45, 2, 0, 0, Math.PI); ctx.stroke();
  // Printed sweep on the opaque can; remaining volume is shown in the prop settings.
  ctx.strokeStyle = look.accent; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-w * 0.4, top + h * 0.72);
  ctx.bezierCurveTo(-w * 0.1, top + h * 0.83, w * 0.1, top + h * 0.64, w * 0.4, top + h * 0.72); ctx.stroke();

  // Label band
  if (look.label) {
    ctx.fillStyle = look.accent;
    ctx.font = `800 ${Math.max(5, w * 0.36)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(look.label, 0, top + h * 0.45);
  }

  // Outline
  ctx.strokeStyle = 'rgba(20, 22, 26, 0.55)';
  ctx.lineWidth = 1;
  roundRect(ctx, -w / 2, top, w, h, w * 0.18);
  ctx.stroke();
}

function drawBoba(ctx: CanvasRenderingContext2D, look: PropLook, st: PropRenderState): void {
  const w = look.width, h = look.height, top = -h;
  const outline = () => {
    ctx.beginPath(); ctx.moveTo(-w / 2, top + 3); ctx.lineTo(w / 2, top + 3);
    ctx.lineTo(w * 0.36, 0); ctx.quadraticCurveTo(0, 3, -w * 0.36, 0); ctx.closePath();
  };
  ctx.save(); outline(); ctx.clip();
  ctx.fillStyle = 'rgba(216,233,230,0.28)'; ctx.fillRect(-w / 2, top, w, h + 3);
  const fillTop = -3 - (h - 9) * Math.max(0, Math.min(1, st.level));
  const tea = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  tea.addColorStop(0, '#a77f59'); tea.addColorStop(0.45, '#d8b58f'); tea.addColorStop(1, '#b28a64');
  ctx.fillStyle = tea; ctx.fillRect(-w / 2, fillTop, w, -fillTop + 2);
  ctx.fillStyle = '#e2c5a3'; ctx.beginPath(); ctx.ellipse(0, fillTop, w * 0.45, 2, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 9; i++) {
    const x = ((i * 7) % 17 - 8) * 0.72, y = -3 - Math.floor(i / 3) * 3.6;
    ctx.fillStyle = '#332019'; ctx.beginPath(); ctx.arc(x, y, 1.65, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,211,0.3)'; ctx.beginPath(); ctx.arc(x - 0.45, y - 0.6, 0.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.fillRect(-w * 0.31, top + 6, 1.4, h - 10);
  ctx.restore(); outline(); ctx.strokeStyle = 'rgba(201,217,213,0.85)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#f2eadc'; roundRect(ctx, -w / 2 - 1, top, w + 2, 4, 1.5); ctx.fill();
  ctx.fillStyle = '#a95345'; ctx.fillRect(w * 0.1, top - 11, 3.1, 14);
  ctx.fillStyle = '#512c29'; ctx.beginPath(); ctx.ellipse(w * 0.1 + 1.55, top - 11, 1.55, 0.7, 0, 0, Math.PI * 2); ctx.fill();
}

function drawCoffee(ctx: CanvasRenderingContext2D, look: PropLook, st: PropRenderState): void {
  const w = look.width;
  const h = look.height;
  const top = -h;

  // Saucer
  ctx.fillStyle = look.bodyDark;
  ctx.beginPath();
  ctx.ellipse(0, -1.5, w * 0.62, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cup body (trapezoid)
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, top + h * 0.18);
  ctx.lineTo(w * 0.42, top + h * 0.18);
  ctx.lineTo(w * 0.3, -2.4);
  ctx.lineTo(-w * 0.3, -2.4);
  ctx.closePath();
  const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  grad.addColorStop(0, look.bodyDark);
  grad.addColorStop(0.4, look.body);
  grad.addColorStop(1, look.bodyDark);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(40, 34, 28, 0.45)';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  // Handle
  ctx.beginPath();
  ctx.arc(w * 0.44, top + h * 0.42, w * 0.16, -Math.PI * 0.55, Math.PI * 0.55);
  ctx.strokeStyle = look.bodyDark;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Coffee surface with remaining level
  const lvl = Math.max(0, Math.min(1, st.level));
  ctx.beginPath();
  ctx.ellipse(0, top + h * 0.2, w * 0.4, w * 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = look.liquidDark;
  ctx.fill();
  if (lvl > 0.05) {
    ctx.beginPath();
    ctx.ellipse(0, top + h * 0.2, w * 0.4 * lvl, w * 0.12 * lvl, 0, 0, Math.PI * 2);
    ctx.fillStyle = look.liquid;
    ctx.fill();
  }

  // Steam, only while there is coffee left
  if (lvl > 0.15) {
    ctx.save();
    ctx.strokeStyle = 'rgba(240, 240, 245, 0.34)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      const phase = st.time * 1.4 + i * 1.9;
      ctx.beginPath();
      for (let s = 0; s <= 6; s++) {
        const t = s / 6;
        const x = (i - 0.5) * w * 0.28 + Math.sin(phase + t * 2.6) * 1.6;
        const y = top + h * 0.08 - t * h * 0.42;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPudding(ctx: CanvasRenderingContext2D, look: PropLook, st: PropRenderState): void {
  const w = look.width;
  const h = look.height;

  // Plate
  ctx.fillStyle = '#e8e4dc';
  ctx.beginPath();
  ctx.ellipse(0, -1, w * 0.62, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pudding body: rounded dome that shrinks as it is eaten
  const lvl = Math.max(0.12, Math.min(1, st.level));
  const bodyH = h * lvl;
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, -2);
  ctx.quadraticCurveTo(-w * 0.44, -bodyH, 0, -bodyH);
  ctx.quadraticCurveTo(w * 0.44, -bodyH, w * 0.42, -2);
  ctx.closePath();
  const grad = ctx.createLinearGradient(-w / 2, -bodyH, w / 2, 0);
  grad.addColorStop(0, look.bodyDark);
  grad.addColorStop(0.45, look.body);
  grad.addColorStop(1, look.bodyDark);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 84, 30, 0.45)';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  // Caramel top
  ctx.beginPath();
  ctx.ellipse(0, -bodyH + 1, w * 0.2, 2.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = look.accent;
  ctx.fill();

  // Cherry
  ctx.beginPath();
  ctx.arc(0, -bodyH - 1.2, 2.2, 0, Math.PI * 2);
  ctx.fillStyle = '#d1345b';
  ctx.fill();
}

function drawFizz(ctx: CanvasRenderingContext2D, look: PropLook, st: PropRenderState): void {
  const alpha = Math.min(1, st.fizz);
  ctx.save();
  ctx.globalAlpha = alpha * 0.85;
  for (let i = 0; i < 7; i++) {
    const seed = i * 1.7;
    const rise = ((st.time * 26 + seed * 9) % 34) / 34;
    const x = Math.sin(seed * 3.1 + st.time * 2) * look.width * 0.42;
    const y = -look.height * 0.62 - rise * look.height * 0.7;
    const r = 0.9 + (i % 3) * 0.55;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${(1 - rise) * 0.75})`;
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
