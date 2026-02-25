"use strict";

export class TileImageCache {
  constructor() {
    this.variants = new Map();
    this.promises = new Map();
    this.maxProbe = 16;
  }

  async loadImage(path) {
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    return await new Promise((resolve) => {
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = path;
    });
  }

  async loadVariants(tileName) {
    if (this.variants.has(tileName)) return this.variants.get(tileName);
    if (this.promises.has(tileName)) return this.promises.get(tileName);

    const p = (async () => {
      const arr = [];
      let foundAny = false;

      for (let i = 0; i < this.maxProbe; i++) {
        const path = `Tiles/${tileName}_${i}_tile.png`;
        const img = await this.loadImage(path);
        if (img) {
          arr.push(img);
          foundAny = true;
        } else {
          if (foundAny) break;
        }
      }

      if (!foundAny) {
        const legacy = await this.loadImage(`Tiles/${tileName}_0_tile.png`);
        if (legacy) arr.push(legacy);
      }

      this.variants.set(tileName, arr);
      this.promises.delete(tileName);
      return arr;
    })();

    this.promises.set(tileName, p);
    return p;
  }

  getVariant(tileName, idx) {
    const arr = this.variants.get(tileName);
    if (!arr || arr.length === 0) return null;
    const i = ((idx % arr.length) + arr.length) % arr.length;
    return arr[i] || null;
  }

  getVariantCount(tileName) {
    const arr = this.variants.get(tileName);
    return arr ? arr.length : 0;
  }
}
