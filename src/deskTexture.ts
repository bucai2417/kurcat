import type { DeskMaterial, DeskPattern } from './deskSkin';

/**
 * Deterministic procedural surface patterns.
 *
 * Every pattern is drawn with plain canvas ops into the caller's current clip,
 * so it stays crisp at any scale and needs no external image assets.
 */
export function paintPattern(
  ctx: CanvasRenderingContext2D,
  pattern: DeskPattern,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
    scale: number;
    alpha: number;
  },
): void {
  const { x, y, w, h, color, scale, alpha } = opts;
  if (pattern === 'solid' || alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  switch (pattern) {
    case 'carbon': {
      const step = Math.max(3, 4.5 * scale);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.6, 0.9 * scale);
      for (let i = -h; i < w + h; i += step) {
        ctx.beginPath();
        ctx.moveTo(x + i, y);
        ctx.lineTo(x + i + h, y + h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + i, y + h);
        ctx.lineTo(x + i + h, y);
        ctx.stroke();
      }
      break;
    }
    case 'wood': {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.5, 0.8 * scale);
      const lines = Math.max(3, Math.round(9 * scale));
      for (let i = 0; i < lines; i++) {
        const t = (i + 0.5) / lines;
        const yy = y + h * t;
        ctx.beginPath();
        ctx.moveTo(x, yy);
        for (let px = 0; px <= w; px += 8) {
          const wave =
            Math.sin((px / w) * Math.PI * 2.2 + i * 1.7) * h * 0.022 +
            Math.sin((px / w) * Math.PI * 5.1 + i) * h * 0.008;
          ctx.lineTo(x + px, yy + wave);
        }
        ctx.stroke();
      }
      break;
    }
    case 'marble': {
      ctx.strokeStyle = color;
      const veins = Math.max(2, Math.round(5 * scale));
      for (let i = 0; i < veins; i++) {
        ctx.lineWidth = Math.max(0.5, (0.7 + (i % 3) * 0.6) * scale);
        ctx.globalAlpha = alpha * (0.5 + (i % 3) * 0.2);
        ctx.beginPath();
        const startY = y + (h / veins) * i;
        ctx.moveTo(x, startY);
        for (let px = 0; px <= w; px += 10) {
          const t = px / w;
          const wobble = Math.sin(t * Math.PI * 3 + i * 2.1) * h * 0.08;
          ctx.lineTo(x + px, startY + wobble + t * h * 0.16);
        }
        ctx.stroke();
      }
      break;
    }
    case 'grid': {
      const step = Math.max(5, 9 * scale);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.5, 0.7 * scale);
      for (let gx = x; gx <= x + w; gx += step) {
        ctx.beginPath();
        ctx.moveTo(gx, y);
        ctx.lineTo(gx, y + h);
        ctx.stroke();
      }
      for (let gy = y; gy <= y + h; gy += step) {
        ctx.beginPath();
        ctx.moveTo(x, gy);
        ctx.lineTo(x + w, gy);
        ctx.stroke();
      }
      break;
    }
    case 'hologram': {
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, color);
      grad.addColorStop(0.35, 'transparent');
      grad.addColorStop(0.6, color);
      grad.addColorStop(1, 'transparent');
      ctx.globalAlpha = alpha * 0.55;
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
      break;
    }
    default:
      break;
  }

  ctx.restore();
}

/** Extra sheen/edge treatment for a given material, drawn on top of the base fill. */
export function paintMaterialSheen(
  ctx: CanvasRenderingContext2D,
  material: DeskMaterial,
  opts: { x: number; y: number; w: number; h: number; radius: number },
): void {
  const { x, y, w, h, radius } = opts;
  ctx.save();
  switch (material) {
    case 'metal': {
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, 'rgba(255,255,255,0.16)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.03)');
      grad.addColorStop(1, 'rgba(0,0,0,0.20)');
      ctx.fillStyle = grad;
      roundRectPath(ctx, x, y, w, h, radius);
      ctx.fill();
      break;
    }
    case 'glass': {
      const grad = ctx.createLinearGradient(x, y, x + w * 0.6, y + h);
      grad.addColorStop(0, 'rgba(255,255,255,0.22)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.02)');
      grad.addColorStop(1, 'rgba(255,255,255,0.10)');
      ctx.fillStyle = grad;
      roundRectPath(ctx, x, y, w, h, radius);
      ctx.fill();
      break;
    }
    case 'fabric': {
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#000';
      const step = 2.5;
      for (let gy = y; gy < y + h; gy += step) {
        for (let gx = x; gx < x + w; gx += step) {
          if (((gx + gy) / step) % 2 < 1) ctx.fillRect(gx, gy, 1, 1);
        }
      }
      break;
    }
    case 'wood': {
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, 'rgba(255,255,255,0.10)');
      grad.addColorStop(1, 'rgba(0,0,0,0.16)');
      ctx.fillStyle = grad;
      roundRectPath(ctx, x, y, w, h, radius);
      ctx.fill();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

export function roundRectPath(
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
