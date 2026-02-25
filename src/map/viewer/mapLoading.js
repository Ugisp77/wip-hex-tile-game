"use strict";

import { canvas, statusEl, autosaveModalEl } from "../../core/dom.js";

import {
  clamp,
  xmur3,
  mulberry32
} from "../../core/utils.js";
import { tileNameToColor } from "./colors.js";

export const mapLoadingMethods = {
  async loadMap(path = "./maps/map.json") {
    statusEl.textContent = `Loading ${path}...`;
    const resp = await fetch(path, { cache: "no-store" });
    if (!resp.ok) throw new Error(`map.json fetch failed: ${resp.status}`);
    const map = await resp.json();
    this.map = map;

    this.baseSeed = (typeof map.seed === "number" && isFinite(map.seed)) ? map.seed : 1;

    statusEl.textContent = "Discovering tile variants...";
    const unique = new Set();
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) unique.add(map.tiles[r][c]);
    }
    const uniqueList = Array.from(unique).sort();

    const variantLists = await Promise.all(uniqueList.map((t) => this.cache.loadVariants(t)));
    const failed = [];
    for (let i = 0; i < uniqueList.length; i++) {
      if (!variantLists[i] || variantLists[i].length === 0) failed.push(uniqueList[i]);
    }

    // Reset world state (structures, caches, etc.) before initializing new map
    if (typeof this.resetWorldState === "function") {
      this.resetWorldState();
    }

    this.buildTileInstances();
    this.computeNumberFadeRadiiWorld();

    // Synchronize WebGL state if renderer is active
    if (this.webglReady && this.webglRenderer) {
      this.buildWebGLAtlas();
      this.webglRenderer.updateInstanceData(this.tiles);
    }

    // Clear stale state from previous map
    this.hoverCenterKey = null;
    this.hoverKeys.clear();
    this.selectedKeys.clear();
    this.shipRangeKeys.clear();
    this.castleRangeKeys.clear();
    this.ruinRangeKeys = new Set();
    if (this.animatingTiles) this.animatingTiles.clear();
    if (this.promotedTiles) this.promotedTiles.clear();

    if (failed.length > 0) {
      statusEl.textContent = `Loaded map with issues: Missing tile variants for ${failed.length} types.`;
      console.warn("Missing tile variants for:", failed);
    } else {
      statusEl.textContent = "Loaded.";
    }

    this.resetView();
    // Recompute number logic after view is stable
    this.recomputeNumberRadiusMap();
    this.requestNumberIconsInRadius();

    // Spawn Bandits (HQ and Tents)
    if (typeof this._spawnBandits === "function") {
      this._spawnBandits();
    }

    // Recompute all settlement resources to ensure UI bubbles have fresh data
    if (typeof this.recomputeAllSettlementResources === "function") {
      this.recomputeAllSettlementResources();
    }

    // Spawn ruins (2 per player) on land tiles
    if (typeof this._spawnRuins === "function") {
      this._spawnRuins();
    }

    // Pre-calculate ship ranges for any ships that were spawned/loaded
    if (typeof this.recomputeAllShipRanges === "function") {
      this.recomputeAllShipRanges();
    }

    // Build minimap after all structures are placed
    if (typeof this.buildMinimapCanvas === "function") {
      this.buildMinimapCanvas();
    }

    // Check for autosave
    const autosave = this.getAutoSave();
    if (autosave && autosaveModalEl) {
      autosaveModalEl.style.display = "flex";
    }
  },




  chooseVariantIndex(tileName, r, c) {
    const sm = xmur3(`${this.baseSeed}|${tileName}|${r},${c}`);
    const rng = mulberry32(sm());
    const count = this.cache.getVariantCount(tileName);
    if (!count || count <= 0) return 0;
    return Math.floor(rng() * count);
  },

  buildTileInstances() {
    const map = this.map;
    const s = this.mapScale;

    const tw = map.tile_width * s;
    const th = map.tile_height * s;
    const stepX = map.step_x * s;
    const rowOffX = map.row_off_x * s;
    const rowStepY = map.row_step_y * s;

    this.tiles = [];
    this.tilesByRow = Array.from({ length: map.rows }, () => []);
    this.tileByKey = new Map();

    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const name = map.tiles[r][c];

        const dyBase = (map.dy && map.dy[r] && typeof map.dy[r][c] === "number") ? map.dy[r][c] : 0;
        const dy = dyBase * s;

        const numBase = (map.numbers && map.numbers[r] && typeof map.numbers[r][c] === "number")
          ? map.numbers[r][c]
          : null;

        const x = c * stepX + ((r % 2) ? rowOffX : 0);
        const y = r * rowStepY;

        const key = `${r},${c}`;
        const footprint = this.makeHexFootprint(x, y + dy, tw, th);

        const variantIndex = this.chooseVariantIndex(name, r, c);

        const tile = {
          r,
          c,
          key,
          name,
          variantIndex: variantIndex,
          number: numBase,
          baseX: x,
          baseY: y,
          dy: dy,
          width: tw,
          height: th,
          cx: x + tw * 0.5,
          cy: (y + dy) + th * 0.52,
          footprint: footprint,
          lift: 0,
          glow: 0,
          bright: 0,
          isWater: name.toLowerCase().includes("water"),
          // Precompute axial (q, r) and cube (x, y, z) coordinates for O(1) distance checks
          q: c - Math.floor((r - (r & 1)) / 2),
          r: r,
          hx: c - Math.floor((r - (r & 1)) / 2),
          hy: r,
          hz: -(c - Math.floor((r - (r & 1)) / 2)) - r,
          globalIndex: this.tiles.length,
          rgbColor: tileNameToColor(name),
          neighborKeys: [], // Filled below
          footprintKeys: [] // Filled below
        };

        this.tiles.push(tile);
        this.tilesByRow[r].push(tile);
        this.tileByKey.set(key, tile);
      }
    }

    // Second pass: fill neighborKeys and footprintKeys to avoid allocations later
    for (const t of this.tiles) {
      const parts = t.key.split(",");
      const r = parseInt(parts[0]);
      const c = parseInt(parts[1]);

      const ns = this.neighborsOf(r, c);
      t.neighborKeys = ns.map(n => `${n.r},${n.c}`);
      t.footprintKeys = [t.key, ...t.neighborKeys];
    }
  },

  makeHexFootprint(x, y, tw, th) {
    return [
      { x: x + tw * 0.50, y: y + th * 0.02 },
      { x: x + tw * 0.95, y: y + th * 0.26 },
      { x: x + tw * 0.95, y: y + th * 0.74 },
      { x: x + tw * 0.50, y: y + th * 0.98 },
      { x: x + tw * 0.05, y: y + th * 0.74 },
      { x: x + tw * 0.05, y: y + th * 0.26 }
    ];
  },

  resetView() {
    if (!this.map) return;
    const rect = canvas.getBoundingClientRect();
    const viewW = rect.width;
    const viewH = rect.height;

    const bounds = this.computeWorldBounds();
    const cx = (bounds.minX + bounds.maxX) * 0.5;
    const cy = (bounds.minY + bounds.maxY) * 0.5;

    this.camera.resetTo(cx, cy, viewW, viewH);
    this.updateHud();
  },

  computeWorldBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const t of this.tiles) {
      const x0 = t.baseX;
      const y0 = t.baseY + t.dy;
      minX = Math.min(minX, x0);
      minY = Math.min(minY, y0);
      maxX = Math.max(maxX, x0 + t.width);
      maxY = Math.max(maxY, y0 + t.height);
    }

    if (!isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 0;
      maxY = 0;
    }

    return { minX, minY, maxX, maxY };
  }
};
