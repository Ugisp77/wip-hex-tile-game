"use strict";

export function numberTintColor(n) {
  const R = [255, 48, 33];
  const Y = [255, 155, 61];
  const YW = [255, 218, 107];
  const W = [255, 255, 255];

  let rgb = W;
  if (n === 3 || n === 11 || n === 2 || n === 12) rgb = W;
  else if (n === 4 || n === 10) rgb = YW;
  else if (n === 5 || n === 9) rgb = Y;
  else if (n === 6 || n === 8 || n === 7) rgb = R;

  return rgb;
}

export class TileIconCache {
  constructor() {
    this.images = new Map();
    this.promises = new Map();
    this.tinted = new Map();
  }

  loadIcon(key) {
    const k = String(key);

    if (this.images.has(k)) return Promise.resolve(this.images.get(k));
    if (this.promises.has(k)) return this.promises.get(k);

    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    const path = `Tile_icons/${k}.png`;

    const p = new Promise((resolve) => {
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = path;
    }).then((loaded) => {
      this.images.set(k, loaded);
      this.promises.delete(k);
      return loaded;
    });

    this.promises.set(k, p);
    return p;
  }

  getIcon(key) {
    return this.images.get(String(key)) || null;
  }

  getTintedWhiteOnlyCanvas(key, tintRgb) {
    const k = String(key);
    const cacheKey = `${k}|${tintRgb[0]},${tintRgb[1]},${tintRgb[2]}`;
    if (this.tinted.has(cacheKey)) return this.tinted.get(cacheKey);

    const icon = this.getIcon(k);
    if (!icon) return null;

    const iw = (icon.naturalWidth && icon.naturalWidth > 0) ? icon.naturalWidth : icon.width;
    const ih = (icon.naturalHeight && icon.naturalHeight > 0) ? icon.naturalHeight : icon.height;

    const off = document.createElement("canvas");
    off.width = Math.max(1, iw);
    off.height = Math.max(1, ih);

    const octx = off.getContext("2d", { alpha: true, willReadFrequently: true });
    octx.imageSmoothingEnabled = false;

    octx.clearRect(0, 0, off.width, off.height);
    octx.drawImage(icon, 0, 0, off.width, off.height);

    const imgData = octx.getImageData(0, 0, off.width, off.height);
    const data = imgData.data;

    const thr = 235;
    const tr = tintRgb[0], tg = tintRgb[1], tb = tintRgb[2];

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 0) continue;

      const r = data[i + 0];
      const g = data[i + 1];
      const b = data[i + 2];

      if (r >= thr && g >= thr && b >= thr) {
        const intensity = (r + g + b) / (3 * 255);
        data[i + 0] = Math.round(tr * intensity);
        data[i + 1] = Math.round(tg * intensity);
        data[i + 2] = Math.round(tb * intensity);
      }
    }

    octx.putImageData(imgData, 0, 0);
    this.tinted.set(cacheKey, off);
    return off;
  }
}
