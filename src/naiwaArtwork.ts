/** Bundled artwork extracted from the user's turnaround. No runtime/network assets. */
import bodyUrl from './assets/naiwa/body.png';
import bellyUrl from './assets/naiwa/belly-mask.png';
import handUrl from './assets/naiwa/hand.png';
import footUrl from './assets/naiwa/foot.png';
export type NaiwaArtPart = 'body' | 'hand' | 'foot';
type RGB = [number, number, number];
export interface NaiwaArtPalette { body: RGB; shade: RGB; outline: RGB; belly: RGB; arm: RGB; paw: RGB; pawOutline: RGB }
const defaults: NaiwaArtPalette = { body: [255,211,56], shade: [230,160,24], outline: [149,112,33],
  belly: [255,240,211], arm: [247,195,44], paw: [104,99,68], pawOutline: [73,74,49] };
const urls = { body: bodyUrl, belly: bellyUrl, hand: handUrl, foot: footUrl };
let images: Record<keyof typeof urls, HTMLImageElement> | undefined;
function sources() {
  if (!images) images = Object.fromEntries(Object.entries(urls).map(([key, url]) => {
    const img = new Image(); img.src = url; return [key, img];
  })) as NonNullable<typeof images>;
  return images;
}
export async function readyNaiwaArtwork(): Promise<void> {
  // Rejected decode must propagate: gallery must not cache an incomplete thumbnail.
  await Promise.all(Object.values(sources()).map(image => image.decode()));
}
const cache = new Map<string, Partial<Record<NaiwaArtPart, CanvasImageSource>>>();
const clamp = (n: number) => Math.max(0, Math.min(1, n));
/** Recolor only when a skin actually changes, preserving the source lighting. */
export function naiwaArtwork(part: NaiwaArtPart, p: NaiwaArtPalette): CanvasImageSource | null {
  const src = sources(), image = src[part];
  if (!image.complete || !image.naturalWidth) return null;
  const zones = part === 'body' ? ['body','shade','outline','belly'] as const
    : ['paw','pawOutline'] as const;
  if (zones.every(k => p[k].every((v,i) => v === defaults[k][i]))) return image;
  if (part === 'body' && (!src.belly.complete || !src.belly.naturalWidth)) return image;
  const key = JSON.stringify(zones.map(k => p[k]));
  let entry = cache.get(key);
  if (!entry) { entry = {}; cache.set(key, entry); if (cache.size > 12) cache.delete(cache.keys().next().value!); }
  if (entry[part]) return entry[part]!;
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image,0,0);
  const pixels = ctx.getImageData(0,0,canvas.width,canvas.height);
  let belly: Uint8ClampedArray | undefined;
  if (part === 'body') {
    ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(src.belly,0,0);
    belly = ctx.getImageData(0,0,canvas.width,canvas.height).data;
  }
  for (let i=0; i<pixels.data.length; i+=4) {
    if (!pixels.data[i+3]) continue;
    const red = pixels.data[i], green = pixels.data[i+1];
    const weights: Partial<Record<keyof NaiwaArtPalette, number>> = {};
    if (part === 'body') {
      const bib = (belly?.[i] ?? 0)/255, dark = clamp((221-green)/80);
      weights.belly = bib; weights.body = (1-bib)*(1-dark); weights.shade = (1-bib)*dark*.85;
      weights.outline = (1-bib)*dark*.15;

    } else {
      weights.pawOutline = clamp((115-red)/60); weights.paw = 1-weights.pawOutline;
    }
    for (let c=0;c<3;c++) {
      let delta = 0;
      for (const k of Object.keys(weights) as Array<keyof NaiwaArtPalette>)
        delta += (p[k][c]-defaults[k][c])*weights[k]!;
      pixels.data[i+c] += delta;
    }
  }
  ctx.putImageData(pixels,0,0); entry[part] = canvas; return canvas;
}
