import { KuroCatEngine } from './catEngine';
import type { KuroCatEngine3D } from './catEngine3d';
import { BUILTIN_DESK_SKINS, type DeskSkinConfig } from './deskSkin';
import type { CatSkinConfig } from './catSkins';
import { modelModes, type ModelMode } from './modelPack';

/** One paused renderer per mode, bounded image cache; no animation loop per card. */
export class ModelPreviews {
  private two?: KuroCatEngine;
  private three?: KuroCatEngine3D;
  private cache = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private canvas(): HTMLCanvasElement {
    const container = document.createElement('div');
    container.className = 'model-render-studio'; container.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas'); container.append(canvas); document.body.append(container);
    return canvas;
  }
  image(cat: CatSkinConfig, mode: ModelMode, desk: DeskSkinConfig = BUILTIN_DESK_SKINS[0]): Promise<string> {
    if (!modelModes(cat).includes(mode)) return Promise.reject(Error('此模型不支持 ' + mode.toUpperCase()));
    const key = JSON.stringify([mode, cat, desk]);
    const cached = this.cache.get(key); if (cached) return Promise.resolve(cached);
    const task = this.queue.catch(() => {}).then(async () => {
      // Yield between cards so opening the library does not block input.
      await new Promise<void>(resolve => window.setTimeout(resolve, 0));
      const hit = this.cache.get(key); if (hit) return hit;
      let url: string;
      if (mode === '2d') {
        if (!this.two) {
          const canvas = this.canvas();
          try { this.two = new KuroCatEngine(canvas, { embedded: true, previewOnly: true }); }
          catch (error) { canvas.parentElement?.remove(); throw error; }
        }
        this.two.setDeskSkin(desk);
        url = await this.two.snapshot(cat);
      } else {
        if (!this.three) {
          const { KuroCatEngine3D } = await import('./catEngine3d');
          const canvas = this.canvas();
          try { this.three = new KuroCatEngine3D(canvas, { embedded: true, previewOnly: true }); }
          catch (error) { canvas.parentElement?.remove(); throw error; }
        }
        this.three.setDeskSkin(desk);
        url = await this.three.snapshot(cat);
      }
      if (this.cache.size >= 64) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, url); return url;
    });
    this.queue = task; return task;
  }
}
