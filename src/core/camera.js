"use strict";

import { clamp } from "./utils.js";

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.scale = 1;
    this.targetScale = 1;
    this.zoomOriginX = 0;
    this.zoomOriginY = 0;
    this.minScale = 0.05;
    this.maxScale = 5.0;
  }

  screenToWorld(sx, sy) {
    return { x: (sx - this.x) / this.scale, y: (sy - this.y) / this.scale };
  }

  zoomAt(screenX, screenY, scaleFactor) {
    const before = this.screenToWorld(screenX, screenY);
    this.scale = clamp(this.scale * scaleFactor, this.minScale, this.maxScale);
    const after = this.screenToWorld(screenX, screenY);
    this.x += (after.x - before.x) * this.scale;
    this.y += (after.y - before.y) * this.scale;
  }

  resetTo(centerX, centerY, viewW, viewH) {
    this.scale = 1;
    this.targetScale = 1;
    this.x = viewW * 0.5 - centerX * this.scale;
    this.y = viewH * 0.35 - centerY * this.scale;
  }
}
