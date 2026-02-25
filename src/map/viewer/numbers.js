"use strict";

import { ctx } from "../../core/dom.js";
import { clamp, smoothstep } from "../../core/utils.js";
import { numberTintColor } from "../../assets/tileIconCache.js";

export const numbersMethods = {
  computeNumberFadeRadiiWorld() {
    let neighborD = 0;

    const map = this.map;
    if (map && this.tiles && this.tiles.length > 0) {
      const samples = [];
      const r0 = Math.floor(map.rows * 0.5);
      const c0 = Math.floor(map.cols * 0.5);

      const addSample = (r, c) => {
        const k = this.keyOf(r, c);
        const t = this.tileByKey.get(k);
        if (t) samples.push(t);
      };

      addSample(r0, c0);
      addSample(clamp(r0 - 3, 0, map.rows - 1), c0);
      addSample(clamp(r0 + 3, 0, map.rows - 1), c0);
      addSample(r0, clamp(c0 - 3, 0, map.cols - 1));
      addSample(r0, clamp(c0 + 3, 0, map.cols - 1));

      const dsAll = [];
      for (const s of samples) {
        const ns = this.neighborsOf(s.r, s.c);
        for (const n of ns) {
          const tt = this.tileByKey.get(this.keyOf(n.r, n.c));
          if (!tt) continue;
          const dx = tt.cx - s.cx;
          const dy = tt.cy - s.cy;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (isFinite(d) && d > 0.0001) dsAll.push(d);
        }
      }

      if (dsAll.length > 0) {
        dsAll.sort((a, b) => a - b);
        neighborD = dsAll[Math.floor(dsAll.length * 0.5)];
      }
    }

    if (!(neighborD > 0)) {
      const s = this.mapScale;
      const stepX = this.map.step_x * s;
      const stepY = this.map.row_step_y * s;
      neighborD = Math.min(stepX, stepY);
      if (!(neighborD > 0)) neighborD = 64;
    }

    const fadeTileRadius = Math.max(1, this.numberRadius - 3);
    const outer = fadeTileRadius * neighborD;
    const inner = outer * 0.6;

    this.numberFadeOuterWorld = Math.max(1, outer);
    this.numberFadeInnerWorld = Math.max(1, inner);
  },

  drawNumbersPass(view) {
    if (!this.showNumbers) return;

    const range = this.getVisibleGridRange(view);
    for (let r = range.r0; r <= range.r1; r++) {
      const rowTiles = this.tilesByRow[r];
      if (!rowTiles) continue;
      for (let i = range.c0; i <= range.c1; i++) {
        const t = rowTiles[i];
        if (!t) continue;
        if (!this.tileIntersectsView(t, view)) continue;

        // Always hide numbers on tiles under outposts
        if (this.structureTileToCenter && this.structureTileToCenter.has(t.key)) continue;

        if (typeof t.number !== "number") continue;

        const x = t.baseX;
        const y = t.baseY + t.dy - t.lift;
        this.drawTileNumberIcon(t, x, y);
      }
    }
  },

  recomputeNumberRadiusMap() {
    this.numberDistByKey.clear();

    if (!this.hoverCenterKey) return;

    const parts = this.hoverCenterKey.split(",");
    const sr = Number(parts[0]);
    const sc = Number(parts[1]);
    if (!this.inBounds(sr, sc)) return;

    const radius = this.numberRadius;

    const q = [];
    q.push({ r: sr, c: sc, d: 0 });
    this.numberDistByKey.set(this.keyOf(sr, sc), 0);

    for (let qi = 0; qi < q.length; qi++) {
      const cur = q[qi];
      if (cur.d >= radius) continue;

      const ns = this.neighborsOf(cur.r, cur.c);
      for (const n of ns) {
        const k = this.keyOf(n.r, n.c);
        if (this.numberDistByKey.has(k)) continue;
        const nd = cur.d + 1;
        if (nd > radius) continue;
        this.numberDistByKey.set(k, nd);
        q.push({ r: n.r, c: n.c, d: nd });
      }
    }
  },

  requestNumberIconsInRadius() {
    if (!this.showNumbers) return;
    if (!this.hoverCenterKey) return;

    for (const k of this.numberDistByKey.keys()) {
      const t = this.tileByKey.get(k);
      if (!t) continue;

      // Always hide numbers on tiles under outposts
      if (this.structureTileToCenter && this.structureTileToCenter.has(t.key)) continue;

      if (typeof t.number !== "number" || !isFinite(t.number) || t.number === 0) continue;
      if (!this.iconCache.getIcon(t.number)) this.iconCache.loadIcon(t.number);
    }
  },

  drawTileNumberIcon(t, x, y) {
    const n = t.number;
    if (!isFinite(n) || n === 0) return;

    const ringDist = this.numberDistByKey.get(t.key);
    if (ringDist === undefined) return;

    const baseIcon = this.iconCache.getIcon(n);
    if (!baseIcon) {
      this.iconCache.loadIcon(n);
      return;
    }

    const dx = t.cx - this.mouseWorld.x;
    const dy = t.cy - this.mouseWorld.y;
    const d = Math.sqrt(dx * dx + dy * dy);

    const inner = this.numberFadeInnerWorld;
    const outer = this.numberFadeOuterWorld;

    let a = 1.0;
    if (d <= inner) {
      a = 1.0;
    } else if (d >= outer) {
      a = 0.0;
    } else {
      const t01 = smoothstep(inner, outer, d);
      const eased = Math.pow(t01, 2.2);
      a = 1.0 - eased;
    }

    if (a <= 0.02) return;

    const tintRgb = numberTintColor(n);
    const tintedCanvas = this.iconCache.getTintedWhiteOnlyCanvas(n, tintRgb);
    if (!tintedCanvas) return;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = a;
    ctx.drawImage(tintedCanvas, x, y, t.width, t.height);
    ctx.restore();
  }
};
