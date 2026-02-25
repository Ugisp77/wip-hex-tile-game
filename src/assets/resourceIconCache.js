"use strict";

export class ResourceIconCache {
  constructor() {
    this._icons = new Map(); // key -> HTMLImageElement
    this._loading = new Set();
  }

  getIcon(resourceKey) {
    return this._icons.get(resourceKey) || null;
  }

  loadIcon(resourceKey) {
    if (!resourceKey) return null;
    if (this._icons.has(resourceKey)) return this._icons.get(resourceKey);
    if (this._loading.has(resourceKey)) return null;

    this._loading.add(resourceKey);

    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    img.onload = () => {
      this._icons.set(resourceKey, img);
      this._loading.delete(resourceKey);
    };
    img.onerror = () => {
      this._loading.delete(resourceKey);
    };

    img.src = `./Tile_icons/resources/${resourceKey}.png`;
    return null;
  }
}
