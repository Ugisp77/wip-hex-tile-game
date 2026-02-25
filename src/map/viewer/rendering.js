"use strict";

import { canvas, ctx } from "../../core/dom.js";

import {
  clamp,
  lerp,
  expLerpFactor,
  nowSec,
  rgbToCss
} from "../../core/utils.js";

import { webglCanvas } from "../../core/dom.js";
import { WebGLTileRenderer } from "./webglRenderer.js";
import { loadShaderSource } from "./shaderLoader.js";
import { numberTintColor } from "../../assets/tileIconCache.js";
import { tileNameToColor } from "./colors.js";

const statusEl = document.getElementById("status");
const fpsEl = document.getElementById("fps");

export const renderingMethods = {
  getWorldViewRect() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    const left = (0 - this.camera.x) / this.camera.scale;
    const top = (0 - this.camera.y) / this.camera.scale;
    const right = (w - this.camera.x) / this.camera.scale;
    const bottom = (h - this.camera.y) / this.camera.scale;

    const padWorld = this.cullPadScreenPx / this.camera.scale;

    return { left: left - padWorld, top: top - padWorld, right: right + padWorld, bottom: bottom + padWorld };
  },

  handleKeyboardInput(dt) {
    let moved = false;
    const panSpeed = 600 / this.camera.scale; // pixels per second, scaled by zoom
    const zoomSpeed = 1.0; // zoom factor per second

    if (this.keys["ArrowLeft"]) {
      this.camera.x += panSpeed * dt * this.camera.scale;
      moved = true;
    }
    if (this.keys["ArrowRight"]) {
      this.camera.x -= panSpeed * dt * this.camera.scale;
      moved = true;
    }
    if (this.keys["ArrowUp"]) {
      this.camera.y += panSpeed * dt * this.camera.scale;
      moved = true;
    }
    if (this.keys["ArrowDown"]) {
      this.camera.y -= panSpeed * dt * this.camera.scale;
      moved = true;
    }

    if (this.keys["."] || this.keys[","]) {
      const rect = canvas.getBoundingClientRect();
      const zoomFactor = this.keys["."] ? 1 + zoomSpeed * dt : 1 / (1 + zoomSpeed * dt);
      this.camera.zoomAt(rect.width / 2, rect.height / 2, zoomFactor);
      // Sync targetScale so mouse wheel zoom starts from here
      this.camera.targetScale = this.camera.scale;
      moved = true;
    }

    // Smooth zoom interpolation for mouse wheel
    const zoomK = expLerpFactor(dt, 12);
    if (Math.abs(this.camera.scale - this.camera.targetScale) > 0.001) {
      const nextScale = lerp(this.camera.scale, this.camera.targetScale, zoomK);
      const factor = nextScale / this.camera.scale;
      this.camera.zoomAt(this.camera.zoomOriginX, this.camera.zoomOriginY, factor);
      moved = true;
    } else if (this.camera.scale !== this.camera.targetScale) {
      // Snap to target if very close
      const factor = this.camera.targetScale / this.camera.scale;
      this.camera.zoomAt(this.camera.zoomOriginX, this.camera.zoomOriginY, factor);
      this.camera.scale = this.camera.targetScale;
      moved = true;
    }

    if (moved) {
      this.updateHud();
      this.mouseWorld = this.camera.screenToWorld(this.mouse.x, this.mouse.y);
      this.updateHoverFromMouse();
    }
  },

  getVisibleGridRange(view) {
    const s = this.mapScale;
    const stepX = this.map.step_x * s;
    const rowStepY = this.map.row_step_y * s;
    const rowOffX = this.map.row_off_x * s;

    // Approximate row ranges
    // y = r * rowStepY => r = y / rowStepY
    let r0 = Math.floor(view.top / rowStepY) - 1;
    let r1 = Math.ceil(view.bottom / rowStepY) + 1;

    // Clamp to map bounds
    r0 = Math.max(0, r0);
    r1 = Math.min(this.map.rows - 1, r1);

    // Approximate col ranges
    // x = c * stepX + offset => c = (x - offset) / stepX
    // Use max possible offset (rowOffX) to be safe
    let c0 = Math.floor((view.left - rowOffX) / stepX) - 1;
    let c1 = Math.ceil((view.right + rowOffX) / stepX) + 1;

    c0 = Math.max(0, c0);
    c1 = Math.min(this.map.cols - 1, c1);

    return { r0, r1, c0, c1 };
  },

  tileIntersectsView(tile, view) {
    const x = tile.baseX;
    const y = tile.baseY + tile.dy - tile.lift;
    const r = x + tile.width;
    const b = y + tile.height;

    if (r < view.left) return false;
    if (x > view.right) return false;
    if (b < view.top) return false;
    if (y > view.bottom) return false;
    return true;
  },

  async initWebGL() {
    try {
      const vertSrc = await loadShaderSource("./src/map/viewer/shaders/tile.vert");
      const fragSrc = await loadShaderSource("./src/map/viewer/shaders/tile.frag");

      this.webglRenderer = new WebGLTileRenderer(webglCanvas);
      await this.webglRenderer.init(vertSrc, fragSrc);

      // Build texture atlas from loaded tile images
      this.buildWebGLAtlas();

      this.webglReady = true;
      console.log("WebGL renderer initialized");

      // Initial buffer upload for all tiles
      if (this.tiles && this.tiles.length > 0) {
        this.webglRenderer.updateInstanceData(this.tiles);
      }

      if (typeof this.computeNumberFadeRadiiWorld === "function") {
        this.computeNumberFadeRadiiWorld();
      }
    } catch (error) {
      console.error("Failed to initialize WebGL renderer:", error);
      this.webglReady = false;
    }
  },

  buildWebGLAtlas() {
    // Gather all unique tile images
    const tileImages = [];
    const tileIndexMap = new Map();

    for (const tile of this.tiles) {
      const img = this.cache.getVariant(tile.name, tile.variantIndex);
      if (!img) {
        tile.atlasIndex = 0;
        continue;
      }

      if (!tileIndexMap.has(img)) {
        tileIndexMap.set(img, tileImages.length);
        tileImages.push(img);
      }

      tile.atlasIndex = tileIndexMap.get(img);
    }

    if (tileImages.length === 0) {
      console.warn("No tile images found for WebGL atlas");
      return;
    }

    // Use first tile dimensions (assuming all tiles are same size)
    const tileWidth = tileImages[0].naturalWidth || tileImages[0].width;
    const tileHeight = tileImages[0].naturalHeight || tileImages[0].height;

    this.atlasInfo = this.webglRenderer.createAtlas(tileImages, tileWidth, tileHeight);
    console.log(`Built WebGL atlas: ${tileImages.length} tiles, ${this.atlasInfo.width}x${this.atlasInfo.height}`);
  },

  tick() {
    const t = nowSec();
    const dt = Math.min(0.05, Math.max(0.001, t - this.lastFrameT || t));
    this.lastFrameT = t;

    // FPS Counter
    this.frameCount = (this.frameCount || 0) + 1;
    this.lastFpsUpdate = this.lastFpsUpdate || t;
    if (t - this.lastFpsUpdate > 0.5) {
      if (fpsEl) {
        const fps = Math.round(this.frameCount / (t - this.lastFpsUpdate));
        fpsEl.textContent = `FPS: ${fps}`;
      }
      this.frameCount = 0;
      this.lastFpsUpdate = t;
    }

    const liftK = expLerpFactor(dt, this.liftSpeed);
    const glowK = expLerpFactor(dt, this.glowSpeed);
    const brightK = expLerpFactor(dt, this.brightSpeed);

    this.handleKeyboardInput(dt);

    // Update promoted tiles cache for draw()
    this.promotedTiles.clear();
    for (const k of this.hoverKeys) {
      this.promotedTiles.add(k);
      const tile = this.tileByKey.get(k);
      if (tile) this.animatingTiles.add(tile);
    }
    for (const k of this.selectedKeys) {
      this.promotedTiles.add(k);
      const tile = this.tileByKey.get(k);
      if (tile) this.animatingTiles.add(tile);
    }

    // Only add ship range tiles that actually need to animate
    for (const k of this.shipRangeKeys) {
      const tile = this.tileByKey.get(k);
      if (tile) {
        const targetGlow = 0.4;
        const targetBright = 0.2;
        if (Math.abs(tile.glow - targetGlow) > 0.01 || Math.abs(tile.bright - targetBright) > 0.01) {
          this.animatingTiles.add(tile);
        }
      }
    }

    // Castle exclusion zone range tiles
    for (const k of this.castleRangeKeys) {
      const tile = this.tileByKey.get(k);
      if (tile) {
        const targetGlow = 0.3;
        const targetBright = 0.15;
        if (Math.abs(tile.glow - targetGlow) > 0.01 || Math.abs(tile.bright - targetBright) > 0.01) {
          this.animatingTiles.add(tile);
        }
      }
    }

    // Ruin visual range tiles
    for (const k of this.ruinRangeKeys) {
      const tile = this.tileByKey.get(k);
      if (tile) {
        const targetGlow = 0.35; // Slightly brighter than castle range to distinguish
        const targetBright = 0.18;
        if (Math.abs(tile.glow - targetGlow) > 0.01 || Math.abs(tile.bright - targetBright) > 0.01) {
          this.animatingTiles.add(tile);
        }
      }
    }

    if (this.animatingTiles.size > 0) {
      const changedIndices = [];
      const done = [];

      for (const tile of this.animatingTiles) {
        const isHover = this.hoverKeys.has(tile.key);
        const isSelected = this.selectedKeys.has(tile.key);
        const inShipRange = this.shipRangeKeys.has(tile.key);
        const inCastleRange = this.castleRangeKeys.has(tile.key);
        const inRuinRange = this.ruinRangeKeys.has(tile.key);

        const hoverLift = isHover ? this.liftMax : 0;
        const selectedLift = isSelected ? this.liftMax * 0.6 : 0;
        const targetLift = Math.max(hoverLift, selectedLift);
        const targetGlow = isHover ? 1.0 : (isSelected ? 0.65 : (inShipRange ? 0.4 : (inCastleRange ? 0.3 : (inRuinRange ? 0.35 : 0))));
        const targetBright = isSelected ? 1 : (inShipRange ? 0.2 : (inCastleRange ? 0.15 : (inRuinRange ? 0.18 : 0)));

        const oldLift = tile.lift;
        const oldGlow = tile.glow;
        const oldBright = tile.bright;

        tile.lift = lerp(tile.lift, targetLift, liftK);
        tile.glow = lerp(tile.glow, targetGlow, glowK);
        tile.bright = lerp(tile.bright, targetBright, brightK);

        const epsilon = 0.001;
        const changed = Math.abs(tile.lift - oldLift) > epsilon ||
          Math.abs(tile.glow - oldGlow) > epsilon ||
          Math.abs(tile.bright - oldBright) > epsilon;

        if (changed) {
          if (this.webglReady && this.webglRenderer) {
            this.webglRenderer.writeTileData(tile.globalIndex, tile);
            changedIndices.push(tile.globalIndex);
          }
        }

        const atTarget = Math.abs(tile.lift - targetLift) < 0.1 &&
          Math.abs(tile.glow - targetGlow) < 0.01 &&
          Math.abs(tile.bright - targetBright) < 0.01;

        if (atTarget && !isHover && !isSelected && !inShipRange && !inCastleRange && !inRuinRange) {
          tile.lift = targetLift;
          tile.glow = targetGlow;
          tile.bright = targetBright;
          done.push(tile);
        }
      }

      for (const tile of done) {
        this.animatingTiles.delete(tile);
      }

      // Smart upload
      if (changedIndices.length > 0 && this.webglReady && this.webglRenderer) {
        changedIndices.sort((a, b) => a - b);
        const minIdx = changedIndices[0];
        const maxIdx = changedIndices[changedIndices.length - 1];
        const range = (maxIdx - minIdx) + 1;

        if (range < 50 || changedIndices.length > range * 0.5) {
          this.webglRenderer.updateInstanceRange(minIdx, range);
        } else {
          for (const idx of changedIndices) {
            this.webglRenderer.updateInstanceRange(idx, 1);
          }
        }
      }
    }

    this.draw();
    requestAnimationFrame(() => this.tick());
  },

  draw() {
    if (!this.map) return;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.camera.x, this.camera.y);
    ctx.scale(this.camera.scale, this.camera.scale);

    ctx.imageSmoothingEnabled = false;

    const view = this.getWorldViewRect();

    // Render tiles using WebGL if available
    if (this.webglReady && this.webglRenderer && this.atlasInfo) {
      // Resize WebGL canvas to match
      const dpr = window.devicePixelRatio || 1;
      const wgl = Math.floor(w * dpr);
      const hgl = Math.floor(h * dpr);
      if (webglCanvas.width !== wgl || webglCanvas.height !== hgl) {
        this.webglRenderer.resize(wgl, hgl);
      }

      // Render all tiles in single GPU call (instance data already updated in tick())
      const useFlatColor = this.camera.scale < 0.15 ? 1.0 : 0.0;
      this.webglRenderer.render(
        this.camera,
        [1.0, 1.0, 1.0], // Tint color (white - no tint for now)
        0.0, // Tint strength
        [0.5, 0.8, 1.0], // Glow color
        this.atlasInfo,
        useFlatColor
      );

      // Pass 1.5: Draw promoted tiles on 2D canvas so they are on top of other tiles
      // and correctly handle "lift" layering.
      const sortedPromoted = Array.from(this.promotedTiles).map(k => this.tileByKey.get(k)).filter(t => t);
      sortedPromoted.sort((a, b) => a.cy - b.cy);

      for (const tile of sortedPromoted) {
        if (this.tileIntersectsView(tile, view)) {
          this.drawTile(tile);
        }
      }
    } else {
      // Fallback to 2D canvas rendering - use spatial culling
      const range = this.getVisibleGridRange(view);
      const useFlatColor = this.camera.scale < 0.3;

      for (let r = range.r0; r <= range.r1; r++) {
        const rowTiles = this.tilesByRow[r];
        if (!rowTiles || rowTiles.length === 0) continue;

        for (let i = range.c0; i <= range.c1; i++) {
          const tile = rowTiles[i];
          if (!tile) continue;
          if (this.promotedTiles.has(tile.key)) continue;
          if (!this.tileIntersectsView(tile, view)) continue;
          this.drawTile(tile, useFlatColor);
        }

        for (let i = range.c0; i <= range.c1; i++) {
          const tile = rowTiles[i];
          if (!tile) continue;
          if (!this.promotedTiles.has(tile.key)) continue;
          if (!this.tileIntersectsView(tile, view)) continue;
          this.drawTile(tile, useFlatColor);
        }
      }
    }

    // Pass 2: structure sprites (bottom layer of structures)
    this.drawStructuresSprites(view);

    // Pass 3: numbers (on top of sprites, below overlays)
    if (this.showNumbers && this.camera.scale > 0.08) {
      this.drawNumbersPass(view);
    }

    // Pass 4: structure overlays (UI on top of everything)
    this.drawStructuresOverlays(view);

    ctx.restore();

    // Minimap overlay (drawn in screen space)
    if (typeof this.drawMinimap === "function") {
      this.drawMinimap();
    }
  },

  drawTile(t, forceFlat = false) {
    const x = t.baseX;
    const y = t.baseY + t.dy - t.lift;

    if (forceFlat) {
      const rgb = t.rgbColor || [68, 68, 68];
      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

      // Draw a simple hexagon using path or just a rect if we want maximum speed
      // But let's do a proper hex path to match the user's request
      ctx.beginPath();
      const hw = t.width * 0.5;
      const hh = t.height * 0.5;
      const qh = t.height * 0.25;
      const cx = x + hw;
      const cy = y + hh;
      ctx.moveTo(cx, cy - hh);
      ctx.lineTo(cx + hw, cy - qh);
      ctx.lineTo(cx + hw, cy + qh);
      ctx.lineTo(cx, cy + hh);
      ctx.lineTo(cx - hw, cy + qh);
      ctx.lineTo(cx - hw, cy - qh);
      ctx.closePath();
      ctx.fill();
      return;
    }

    const img = this.cache.getVariant(t.name, t.variantIndex);

    if (img) {
      const doGlow = t.glow > 0.001;
      const doBright = t.bright > 0.001;

      // Easy knob: 0 = no tint, 1 = full player tint
      const tintStrength = (typeof this.tintStrength === "number")
        ? clamp(this.tintStrength, 0, 1)
        : 0.5;

      const prgb = this.getCurrentPlayer().rgb;
      const shadowCol = rgbToCss(prgb, 0.70);

      if (!this._tileTintCache) this._tileTintCache = new Map();
      if (!this._tileTintWorkCanvas) this._tileTintWorkCanvas = document.createElement("canvas");
      if (!this._tileTintWorkCtx) this._tileTintWorkCtx = this._tileTintWorkCanvas.getContext("2d", { alpha: true });

      let tinted = null;

      if (tintStrength > 0.001) {
        const srcKey = (img && img.src) ? img.src : "";
        const rr = clamp(Math.round(prgb[0]), 0, 255);
        const gg = clamp(Math.round(prgb[1]), 0, 255);
        const bb = clamp(Math.round(prgb[2]), 0, 255);

        // Cache key includes tintStrength so you can tweak live
        const ts = Math.round(tintStrength * 1000);
        const tintKey = `${srcKey}|${t.width}x${t.height}|${rr},${gg},${bb}|${ts}`;

        tinted = this._tileTintCache.get(tintKey) || null;
        if (!tinted) {
          const wc = this._tileTintWorkCanvas;
          const wctx = this._tileTintWorkCtx;

          wc.width = Math.max(1, t.width);
          wc.height = Math.max(1, t.height);

          wctx.setTransform(1, 0, 0, 1, 0, 0);
          wctx.clearRect(0, 0, wc.width, wc.height);
          wctx.imageSmoothingEnabled = false;

          // Base: original tile
          wctx.globalCompositeOperation = "source-over";
          wctx.drawImage(img, 0, 0, wc.width, wc.height);

          // Build a player-colored version using alpha mask
          const c = document.createElement("canvas");
          c.width = wc.width;
          c.height = wc.height;
          const cctx = c.getContext("2d", { alpha: true });
          if (cctx) {
            cctx.imageSmoothingEnabled = false;
            cctx.clearRect(0, 0, c.width, c.height);
            cctx.globalCompositeOperation = "source-over";
            cctx.drawImage(img, 0, 0, c.width, c.height);
            cctx.globalCompositeOperation = "source-in";
            cctx.fillStyle = `rgb(${rr}, ${gg}, ${bb})`;
            cctx.fillRect(0, 0, c.width, c.height);
            cctx.globalCompositeOperation = "source-over";

            // Mix colored tile on top with tintStrength
            wctx.globalAlpha = tintStrength;
            wctx.globalCompositeOperation = "source-over";
            wctx.drawImage(c, 0, 0);
            wctx.globalAlpha = 1.0;
          }

          tinted = document.createElement("canvas");
          tinted.width = wc.width;
          tinted.height = wc.height;
          const tctx = tinted.getContext("2d", { alpha: true });
          if (tctx) {
            tctx.imageSmoothingEnabled = false;
            tctx.drawImage(wc, 0, 0);
            this._tileTintCache.set(tintKey, tinted);
          } else {
            tinted = null;
          }
        }
      }

      if (doGlow) {
        ctx.save();
        ctx.shadowColor = shadowCol;
        ctx.shadowBlur = 16 * t.glow;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.drawImage(img, x, y, t.width, t.height);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = this.highlightAlpha * t.glow;
        ctx.globalCompositeOperation = "screen";
        if (tinted) ctx.drawImage(tinted, x, y, t.width, t.height);
        else ctx.drawImage(img, x, y, t.width, t.height);
        ctx.restore();
      } else {
        ctx.drawImage(img, x, y, t.width, t.height);
      }

      if (doBright) {
        ctx.save();
        ctx.globalAlpha = 0.28 * t.bright;
        ctx.globalCompositeOperation = "screen";
        if (tinted) ctx.drawImage(tinted, x, y, t.width, t.height);
        else ctx.drawImage(img, x, y, t.width, t.height);
        ctx.restore();
      }
    }
  }
};
