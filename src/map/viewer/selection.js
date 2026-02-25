"use strict";

import { pointInPoly } from "../../core/utils.js";
import { SelectionMode } from "../../game/selectionMode.js";

export const selectionMethods = {
  inBounds(r, c) {
    return !!this.map && r >= 0 && c >= 0 && r < this.map.rows && c < this.map.cols;
  },

  keyOf(r, c) {
    return `${r},${c}`;
  },

  refreshShipRange(originKey) {
    if (this._lastShipRangeOrigin === originKey) return;
    const s = this.structureByCenter.get(originKey);
    if (s && s.rangeKeys) {
      this.shipRangeKeys = s.rangeKeys;
      this._lastShipRangeOrigin = originKey;
    }
  },

  clearShipRange(force = false) {
    if (this._lastShipRangeOrigin === null) return;
    if (this._movingShip && !force) {
      this.shipRangeKeys = this._movingShipRangeKeys || new Set();
      this._lastShipRangeOrigin = this._movingShipOldKey;
    } else {
      this.shipRangeKeys = new Set();
      this._lastShipRangeOrigin = null;
    }
  },

  neighborsOf(r, c) {
    const odd = (r % 2) === 1;

    const dirs = [
      { dr: 0, dc: 1 },
      { dr: 0, dc: -1 },
      { dr: -1, dc: odd ? 1 : 0 },
      { dr: -1, dc: odd ? 0 : -1 },
      { dr: 1, dc: odd ? 1 : 0 },
      { dr: 1, dc: odd ? 0 : -1 }
    ];

    const out = [];
    for (const d of dirs) {
      const rr = r + d.dr;
      const cc = c + d.dc;
      if (this.inBounds(rr, cc)) out.push({ r: rr, c: cc });
    }
    return out;
  },

  stepE(r, c) { return { r: r, c: c + 1 }; },
  stepW(r, c) { return { r: r, c: c - 1 }; },

  stepNE(r, c) {
    const odd = (r % 2) === 1;
    return { r: r - 1, c: c + (odd ? 1 : 0) };
  },

  stepNW(r, c) {
    const odd = (r % 2) === 1;
    return { r: r - 1, c: c + (odd ? 0 : -1) };
  },

  stepSE(r, c) {
    const odd = (r % 2) === 1;
    return { r: r + 1, c: c + (odd ? 1 : 0) };
  },

  stepSW(r, c) {
    const odd = (r % 2) === 1;
    return { r: r + 1, c: c + (odd ? 0 : -1) };
  },

  collectLine(r, c, stepNegFn, stepPosFn, len) {
    const half = Math.floor(len / 2);
    const coords = [];

    let cur = { r, c };
    for (let i = 0; i < half; i++) {
      const nxt = stepNegFn.call(this, cur.r, cur.c);
      if (!this.inBounds(nxt.r, nxt.c)) break;
      cur = nxt;
    }

    for (let i = 0; i < len; i++) {
      if (!this.inBounds(cur.r, cur.c)) break;
      coords.push({ r: cur.r, c: cur.c });
      cur = stepPosFn.call(this, cur.r, cur.c);
    }

    return coords;
  },

  selectionCoordsFromCenter(r, c) {
    if (!this.inBounds(r, c)) return [];

    if (this.selectionMode === SelectionMode.POINT) return [{ r, c }];

    if (this.selectionMode === SelectionMode.CIRCLE7) {
      const coords = [{ r, c }];
      const ns = this.neighborsOf(r, c);
      for (const n of ns) coords.push(n);
      return coords;
    }

    if (this.selectionMode === SelectionMode.LINE_H) {
      return this.collectLine(r, c, this.stepW, this.stepE, this.debugLineLen);
    }

    if (this.selectionMode === SelectionMode.LINE_DR) {
      return this.collectLine(r, c, this.stepNW, this.stepSE, this.debugLineLen);
    }

    if (this.selectionMode === SelectionMode.LINE_DL) {
      return this.collectLine(r, c, this.stepNE, this.stepSW, this.debugLineLen);
    }

    return [{ r, c }];
  },

  setHoverCenter(key) {
    if (this.hoverCenterKey === key) return;

    this.hoverCenterKey = key;

    // Every time we move to a new hex, roll a new variant for the preview
    if (this.activeStructure === "outpost" && this.outpostVariants && this.outpostVariants.length > 0) {
      this.currentOutpostVariant = Math.floor(Math.random() * this.outpostVariants.length);
    }
    if (this.activeStructure === "farm" && this.farmVariants && this.farmVariants.length > 0) {
      this.currentFarmVariant = Math.floor(Math.random() * this.farmVariants.length);
    }
    if (this.activeStructure === "factory" && this.factoryVariants && this.factoryVariants.length > 0) {
      this.currentFactoryVariant = Math.floor(Math.random() * this.factoryVariants.length);
    }
    if (this.activeStructure === "ship" && this.shipVariants && this.shipVariants.length > 0 && !this._movingShip) {
      this.currentShipVariant = Math.floor(Math.random() * this.shipVariants.length);
    }
    if (this.activeStructure === "port" && this.portVariants && this.portVariants.length > 0) {
      this.currentPortVariant = Math.floor(Math.random() * this.portVariants.length);
    }
    if (this.activeStructure === "castle" && this.castleVariants && this.castleVariants.length > 0) {
      this.currentCastleVariant = Math.floor(Math.random() * this.castleVariants.length);
    }
    if (this.activeStructure === "mercenary_camp" && this.mercenaryCampVariants && this.mercenaryCampVariants.length > 0) {
      this.currentMercenaryCampVariant = Math.floor(Math.random() * this.mercenaryCampVariants.length);
    }
    if (this.activeStructure === "trade_town" && this.tradeTownVariants && this.tradeTownVariants.length > 0) {
      this.currentTradeTownVariant = Math.floor(Math.random() * this.tradeTownVariants.length);
    }


    // Always rebuild hoverKeys here, otherwise outpost hover never clears correctly
    this.hoverKeys.clear();

    if (this.hoverCenterKey) {
      // If hovering a tile that is an outpost or road center, hover the whole footprint.
      const s = this.structureByCenter.get(this.hoverCenterKey);
      if (s && (s.type === "outpost" || s.type === "road" || s.type === "wall" || s.type === "factory" || s.type === "port" || s.type === "castle" || s.type === "trade_town" || s.type === "bandit_tent" || s.type === "bandit_hq" || s.type === "ruin" || s.type === "ship" || s.type === "sunken_ship") && Array.isArray(s.keys) && s.keys.length) {
        for (const k of s.keys) this.hoverKeys.add(k);

        // Keep number logic centered on the structure center key.
        this.recomputeNumberRadiusMap();
        this.updateHud();
        this.requestNumberIconsInRadius();

        if (s.type === "ship") {
          this.shipRangeKeys = s.rangeKeys || new Set();
          this._lastShipRangeOrigin = s.centerKey;
        } else {
          this.clearShipRange();
        }

        // Show castle exclusion zone radius when hovering a placed castle
        if (s.type === "castle") {
          this._computeCastleRangeKeys(s.centerKey);
        } else {
          this.castleRangeKeys = new Set();
        }

        // Show ruin exclusion zone radius when hovering a ruin
        if (s.type === "ruin") {
          this._computeRuinRangeKeys(s.centerKey);
        } else {
          this.ruinRangeKeys = new Set();
        }
        return;
      }
    }

    this.clearShipRange();

    // Show castle range during placement preview too
    if (this.activeStructure === "castle" && this.hoverCenterKey) {
      this._computeCastleRangeKeys(this.hoverCenterKey);
    } else {
      this.castleRangeKeys = new Set();
    }

    // Show ruin range (never during placement as ruins aren't buildable, but for consistency)
    this.ruinRangeKeys = new Set();

    this.recomputeHoverShape();
    this.recomputeNumberRadiusMap();
    this.updateHud();
    this.requestNumberIconsInRadius();
  },

  recomputeHoverShape() {
    this.hoverKeys.clear();
    if (!this.hoverCenterKey || !this.map) return;

    // Road/Wall Preview Logic
    if (this.selectionMode === SelectionMode.ROAD || this.selectionMode === SelectionMode.WALL) {
      if (this.activeRoadOrigin) {
        const dir = this._getRoadDirectionFromOrigin(this.activeRoadOrigin, this.mouseWorld);
        const keys = this._getRoadTiles(this.activeRoadOrigin, dir);
        for (const k of keys) this.hoverKeys.add(k);
        return;
      }

      // First step: just highlight origin candidate
      this.hoverKeys.add(this.hoverCenterKey);
      return;
    }

    const parts = this.hoverCenterKey.split(",");
    const r = Number(parts[0]);
    const c = Number(parts[1]);

    const coords = this.selectionCoordsFromCenter(r, c);
    for (const p of coords) {
      if (!this.inBounds(p.r, p.c)) continue;
      this.hoverKeys.add(this.keyOf(p.r, p.c));
    }
  },

  updateHoverFromMouse() {
    if (!this.map) return;

    const world = this.camera.screenToWorld(this.mouse.x, this.mouse.y);
    this.mouseWorld.x = world.x;
    this.mouseWorld.y = world.y;

    // O(1) Grid Math instead of O(N) loop
    const s = this.mapScale;
    const stepX = this.map.step_x * s;
    const rowStepY = this.map.row_step_y * s;
    const rowOffX = this.map.row_off_x * s;

    // 1. Find candidate row
    const r = Math.round(world.y / rowStepY);
    if (r < 0 || r >= this.map.rows) {
      this.setHoverCenter(null);
      return;
    }

    // 2. Find candidate column
    const offset = (r % 2 === 1) ? rowOffX : 0;
    const c = Math.round((world.x - offset) / stepX);
    if (c < 0 || c >= this.map.cols) {
      this.setHoverCenter(null);
      return;
    }

    // 3. Since hexes overlap and have irregular shapes, check candidate & neighbors
    const candidates = [{ r, c }, ...this.neighborsOf(r, c)];
    let hit = null;
    let closest = null;
    let minD = Infinity;

    for (const cand of candidates) {
      if (!this.inBounds(cand.r, cand.c)) continue;
      if (!this.tilesByRow[cand.r]) continue; // Safety check
      const t = this.tilesByRow[cand.r][cand.c];
      if (!t) continue;

      // Exact hit
      if (pointInPoly(world.x, world.y, t.footprint)) {
        hit = t;
        break;
      }

      // Check distance for "closest hex" fallback to avoid deadzones
      const dx = world.x - t.cx;
      const dy = world.y - t.cy;
      const d = dx * dx + dy * dy;
      if (d < minD) {
        minD = d;
        closest = t;
      }
    }

    // Fallback to closest if no exact hit (within reasonable threshold)
    if (!hit && closest && minD < (stepX * stepX)) {
      hit = closest;
    }

    if (!hit) {
      this.setHoverCenter(null);
      this.clearShipRange();
    } else {
      const snap = (this.activeStructure !== "road") && (this.activeStructure !== "wall") && (this.activeStructure !== "bandit_tent") && (this.activeStructure !== "ship") && (this.activeStructure !== "port") && (this.activeStructure !== "castle") && (this.activeStructure !== "trade_town");
      let centerKey = (snap && this.structureTileToCenter.get(hit.key)) || hit.key;

      if (this.activeStructure === "ship") {
        if (this._movingShip && this._movingShipOldKey) {
          // Instead of naive clamping, check actual reachability
          if (!this._movingShipReachableCenters || !this._movingShipReachableCenters.has(centerKey)) {
            // Find nearest reachable center
            if (this._movingShipReachableCenters && this._movingShipReachableCenters.size > 0) {
              let minD = Infinity;
              let best = this._movingShipOldKey;
              for (const rk of this._movingShipReachableCenters) {
                const dist = this._hexDistance(centerKey, rk);
                if (dist < minD) {
                  minD = dist;
                  best = rk;
                }
              }
              centerKey = best;
            } else {
              centerKey = this._movingShipOldKey;
            }
          }
        }

        // If ship doesn't fit here, null out hover so it doesn't show invalid preview
        if (!this._isShipFit(centerKey)) {
          this.setHoverCenter(null);
          this.clearShipRange();
          return;
        }
      }

      this.setHoverCenter(centerKey);
    }
  },

  applySelectionFromHover() {
    if (!this.hoverCenterKey) return;

    // If the hovered thing is an outpost or road/wall, selection becomes the whole footprint.
    const s = this.hoverCenterKey ? this.structureByCenter.get(this.hoverCenterKey) : null;
    if (s && (s.type === "outpost" || s.type === "road" || s.type === "wall" || s.type === "port" || s.type === "castle" || s.type === "trade_town" || s.type === "bandit_tent" || s.type === "bandit_hq" || s.type === "ruin" || s.type === "ship" || s.type === "sunken_ship") && Array.isArray(s.keys) && s.keys.length) {
      this.selectedKeys.clear();
      for (const k of s.keys) this.selectedKeys.add(k);

      this.updateHud();

      // If tool active, still allow placement (but it will no-op if already placed)
      if (this.activeStructure === "outpost") this.placeOutpostAt(this.hoverCenterKey);
      if (this.activeStructure === "farm") this.placeFarmAt(this.hoverCenterKey);
      if (this.activeStructure === "factory") this.placeFactoryAt(this.hoverCenterKey);
      if (this.activeStructure === "port") this.placePortAt(this.hoverCenterKey);
      if (this.activeStructure === "castle") this.placeCastleAt(this.hoverCenterKey);
      if (this.activeStructure === "trade_town") this.placeTradeTownAt(this.hoverCenterKey);

      // Pick up bandit tent when clicked with empty cursor
      if (!this.activeStructure && s.type === "bandit_tent") {
        this.removeStructureAt(this.hoverCenterKey);
        this._movingBanditTent = true;
        this.setActiveStructure("bandit_tent");
        this.selectedKeys.clear();
        return;
      }

      // Pick up ship when clicked with empty cursor
      if (!this.activeStructure && s.type === "ship") {
        const cur = this.getCurrentPlayer();
        if (s.playerRgb[0] !== cur.rgb[0] || s.playerRgb[1] !== cur.rgb[1] || s.playerRgb[2] !== cur.rgb[2]) {
          console.warn(`[Selection] Cannot move another player's ship!`);
          return;
        }

        // Determine facing based on movement direction later
        this._movingShip = true;
        this._movingShipOldKey = s.centerKey;
        this._movingShipVariant = s.variantIndex || 0;
        this._movingShipFacingLeft = s.facingLeft || false;
        this._movingShipRangeKeys = s.rangeKeys || new Set();
        this._movingShipReachableCenters = s.reachableCenterKeys || new Set();

        this.removeStructureAt(this.hoverCenterKey);
        this.setActiveStructure("ship");
        this.currentShipVariant = this._movingShipVariant;
        this.selectedKeys.clear();

        // Use the range keys from the ship we just picked up
        this.shipRangeKeys = this._movingShipRangeKeys;
        this._lastShipRangeOrigin = this._movingShipOldKey;
        return;
      }

      // Road placement handles itself below as it's a 2-step process
      const isRoad = this.activeStructure === "road";
      const isWall = this.activeStructure === "wall";
      const isOutpost = this.activeStructure === "outpost";
      const isFarm = this.activeStructure === "farm";
      const isFactory = this.activeStructure === "factory";
      const isPort = this.activeStructure === "port";
      const isTradeTown = this.activeStructure === "trade_town";
      const isMercenaryCamp = this.activeStructure === "mercenary_camp";
      const isCastle = this.activeStructure === "castle";
      const isDelete = this.activeStructure === "delete";

      if (!isRoad && !isWall && !isOutpost && !isFarm && !isFactory && !isPort && !isCastle && !isTradeTown && !isMercenaryCamp && !isDelete) {
        return;
      }

    }

    const parts = this.hoverCenterKey.split(",");
    const r = Number(parts[0]);
    const c = Number(parts[1]);

    const coords = this.selectionCoordsFromCenter(r, c);
    this.selectedKeys.clear();
    for (const p of coords) {
      if (!this.inBounds(p.r, p.c)) continue;
      this.selectedKeys.add(this.keyOf(p.r, p.c));
    }

    // Road/Wall placement
    if (this.activeStructure === "road" || this.activeStructure === "wall") {
      if (!this.activeRoadOrigin) {
        // For walls, we just need centerKey valid; for roads, we have connectivity rules.
        const validOrigin = (this.activeStructure === "wall")
          ? this._isWallPlacementValid(this.hoverCenterKey)
          : this._isRoadOriginValid(this.hoverCenterKey);

        if (validOrigin) {
          this.activeRoadOrigin = this.hoverCenterKey;
          this.recomputeHoverShape();
        }
      } else {
        if (this.activeStructure === "wall") {
          this.placeWallAt(this.activeRoadOrigin, this.mouseWorld);
        } else {
          this.placeRoadAt(this.activeRoadOrigin, this.mouseWorld);
        }
        this.activeRoadOrigin = null;
        this.recomputeHoverShape();
      }
    }

    if (this.activeStructure === "outpost") {
      this.placeOutpostAt(this.hoverCenterKey);
    }

    if (this.activeStructure === "farm") {
      this.placeFarmAt(this.hoverCenterKey);
    }

    if (this.activeStructure === "factory") {
      this.placeFactoryAt(this.hoverCenterKey);
    }

    if (this.activeStructure === "port") {
      this.placePortAt(this.hoverCenterKey);
    }

    if (this.activeStructure === "castle") {
      this.placeCastleAt(this.hoverCenterKey);
    }

    if (this.activeStructure === "trade_town") {
      this.placeTradeTownAt(this.hoverCenterKey);
    }

    if (this.activeStructure === "bandit_tent") {
      this.placeBanditTentAt(this.hoverCenterKey);
      if (this._movingBanditTent) {
        this._movingBanditTent = false;
        this.setActiveStructure(null);
      }
    }

    if (this.activeStructure === "ship") {
      // Determine facing direction when moving
      if (this._movingShip && this._movingShipOldKey) {
        const oldParts = this._movingShipOldKey.split(",");
        const newParts = this.hoverCenterKey.split(",");
        const oldC = Number(oldParts[1]);
        const newC = Number(newParts[1]);
        // Face left if moving left, otherwise face right
        if (newC < oldC) this._movingShipFacingLeft = true;
        else if (newC > oldC) this._movingShipFacingLeft = false;
      }

      this.placeShipAt(this.hoverCenterKey);

      // Update facing on the just-placed structure
      if (this._movingShip) {
        const placed = this.structureByCenter.get(this.hoverCenterKey);
        if (placed && placed.type === "ship") {
          placed.facingLeft = this._movingShipFacingLeft || false;
        }
        this._movingShip = false;
        this._movingShipOldKey = null;
        this._movingShipFacingLeft = false;
        this._movingShipVariant = 0;
        this.setActiveStructure(null);
      }
    }

    if (this.activeStructure === "mercenary_camp") {
      this.placeMercenaryCampAt(this.hoverCenterKey);
    }

    if (this.activeStructure === "delete") {
      this.removeStructureAt(this.hoverCenterKey);
    }


    this.updateHud();
  },

  _computeCastleRangeKeys(centerKey) {
    const result = new Set();
    const rc = this._parseKey(centerKey);
    if (!rc) { this.castleRangeKeys = result; return; }

    // BFS out to radius 8 from center
    const visited = new Set();
    const queue = [{ r: rc.r, c: rc.c, d: 0 }];
    visited.add(centerKey);

    while (queue.length > 0) {
      const cur = queue.shift();
      const key = this.keyOf(cur.r, cur.c);

      // Add to result if within radius (but skip the castle's own 7-tile footprint)
      if (cur.d > 1) {
        result.add(key);
      }

      if (cur.d < 7) {
        const ns = this.neighborsOf(cur.r, cur.c);
        for (const n of ns) {
          const nk = this.keyOf(n.r, n.c);
          if (!visited.has(nk)) {
            visited.add(nk);
            queue.push({ r: n.r, c: n.c, d: cur.d + 1 });
          }
        }
      }
    }

    this.castleRangeKeys = result;
  },

  _computeRuinRangeKeys(centerKey) {
    const result = new Set();
    const rc = this._parseKey(centerKey);
    if (!rc) { this.ruinRangeKeys = result; return; }

    // BFS out to radius 6 from center (same as outpost/castle exclusion rule)
    const visited = new Set();
    const queue = [{ r: rc.r, c: rc.c, d: 0 }];
    visited.add(centerKey);

    while (queue.length > 0) {
      const cur = queue.shift();
      const key = this.keyOf(cur.r, cur.c);

      // Add to result if within radius (but skip the ruin's own tile)
      if (cur.d > 0) {
        result.add(key);
      }

      if (cur.d < 5) {
        const ns = this.neighborsOf(cur.r, cur.c);
        for (const n of ns) {
          const nk = this.keyOf(n.r, n.c);
          if (!visited.has(nk)) {
            visited.add(nk);
            queue.push({ r: n.r, c: n.c, d: cur.d + 1 });
          }
        }
      }
    }

    this.ruinRangeKeys = result;
  }
};
