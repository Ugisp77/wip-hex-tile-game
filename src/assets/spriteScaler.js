"use strict";

// Scales pixel art by an integer scale using nearest-neighbor.
// Returns a cached canvas so scaling happens only once per (img, scale).

export class SpriteScaler {
  constructor() {
    this._cache = new Map();
  }

  getScaled(img, scale) {
    if (!img || scale <= 0) return null;

    const iw = img.naturalWidth || img.width || 0;
    const ih = img.naturalHeight || img.height || 0;
    if (iw <= 0 || ih <= 0) return null;

    const s = Math.max(1, Math.round(scale));
    const key = `${img.src || "canvas"}|${iw}x${ih}|${s}`;

    const cached = this._cache.get(key);
    if (cached) return cached;

    const out = document.createElement("canvas");
    out.width = iw * s;
    out.height = ih * s;

    const ctx = out.getContext("2d", { alpha: true });
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, out.width, out.height);
    ctx.drawImage(img, 0, 0, out.width, out.height);

    this._cache.set(key, out);
    return out;
  }
}
