"use strict";

import { ctx, structureOutpostBtn, statusEl } from "../../core/dom.js";
import { clamp, rgbToCss } from "../../core/utils.js";
import { SelectionMode } from "../../game/selectionMode.js";
import { buildOutlinedSpriteCanvas4 } from "../../assets/pixelOutline.js";
import { tileNameToResource } from "../../game/resources.js";
import { showResourceChoice, showResourceChoiceMulti } from "../../ui/resourceChoice.js";
import { showRuinClaimedPrompt } from "../../ui/turnEvents.js";

export const structuresMethods = {
  // ----------------------------
  // Utilities
  // ----------------------------

  resetWorldState() {
    console.log("[Structures] Resetting world state...");
    this.structures = [];
    this.structureByCenter.clear();
    this.structureTileToCenter.clear();
    this.structureSpatialIndex.clear();

    // Clear spawning caches
    this._landTiles = [];
    this._sandTiles = [];
    this._tile7 = null;

    // Clear reachability caches
    if (this._shipReachableCache) this._shipReachableCache.clear();
    if (this._castleReachableCache) this._castleReachableCache.clear();
    this.ruinRangeKeys = new Set();
  },

  _parseKey(key) {
    const parts = String(key).split(",");
    const r = Number(parts[0]);
    const c = Number(parts[1]);
    if (!isFinite(r) || !isFinite(c)) return null;
    return { r: r | 0, c: c | 0 };
  },

  _hexDistance(key1, key2) {
    const t1 = (typeof key1 === "object" && key1 !== null && "hx" in key1) ? key1 : this.tileByKey.get(key1);
    const t2 = (typeof key2 === "object" && key2 !== null && "hx" in key2) ? key2 : this.tileByKey.get(key2);

    if (t1 && t2 && "hx" in t1 && "hx" in t2) {
      return Math.max(Math.abs(t1.hx - t2.hx), Math.abs(t1.hy - t2.hy), Math.abs(t1.hz - t2.hz));
    }

    const rc1 = t1 ? t1 : this._parseKey(key1);
    const rc2 = t2 ? t2 : this._parseKey(key2);
    if (!rc1 || !rc2) return Infinity;

    const q1 = rc1.c - Math.floor((rc1.r - (rc1.r & 1)) / 2);
    const r1 = rc1.r;
    const q2 = rc2.c - Math.floor((rc2.r - (rc2.r & 1)) / 2);
    const r2 = rc2.r;

    const x1 = q1, y1 = r1, z1 = -q1 - r1;
    const x2 = q2, y2 = r2, z2 = -q2 - r2;

    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
  },

  _getSpatialGridKey(r, c) {
    return `${Math.floor(r / 15)},${Math.floor(c / 15)}`;
  },

  _updateSpatialIndex(s, remove = false) {
    if (!s || !s.centerKey) return;
    const rc = this._parseKey(s.centerKey);
    if (!rc) return;

    const gk = this._getSpatialGridKey(rc.r, rc.c);
    if (remove) {
      const set = this.structureSpatialIndex.get(gk);
      if (set) set.delete(s);
    } else {
      if (!this.structureSpatialIndex.has(gk)) {
        this.structureSpatialIndex.set(gk, new Set());
      }
      this.structureSpatialIndex.get(gk).add(s);
    }
  },

  _getNearbyStructures(centerKey, radius) {
    const t = (typeof centerKey === "object" && centerKey !== null) ? centerKey : this.tileByKey.get(centerKey);
    if (!t) return [];

    const gr = Math.floor(t.r / 15);
    const gc = Math.floor(t.c / 15);

    const out = [];
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const set = this.structureSpatialIndex.get(`${gr + i},${gc + j}`);
        if (set) {
          for (const s of set) {
            if (this._hexDistance(t, s.centerKey) <= radius) {
              out.push(s);
            }
          }
        }
      }
    }
    return out;
  },

  _getClampedHexKey(originKey, targetKey, maxDist) {
    const rc1 = this._parseKey(originKey);
    const rc2 = this._parseKey(targetKey);
    if (!rc1 || !rc2) return targetKey;

    const q1 = rc1.c - Math.floor((rc1.r - (rc1.r & 1)) / 2);
    const r1 = rc1.r;
    const q2 = rc2.c - Math.floor((rc2.r - (rc2.r & 1)) / 2);
    const r2 = rc2.r;

    const x1 = q1, y1 = r1, z1 = -q1 - r1;
    const x2 = q2, y2 = r2, z2 = -q2 - r2;

    const dist = Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
    if (dist <= maxDist) return targetKey;

    // Line interpolation
    const ratio = maxDist / dist;
    const nx = x1 + (x2 - x1) * ratio;
    const ny = y1 + (y2 - y1) * ratio;
    const nz = z1 + (z2 - z1) * ratio;

    // Hex rounding
    let rx = Math.round(nx);
    let ry = Math.round(ny);
    let rz = Math.round(nz);

    const xDiff = Math.abs(rx - nx);
    const yDiff = Math.abs(ry - ny);
    const zDiff = Math.abs(rz - nz);

    if (xDiff > yDiff && xDiff > zDiff) {
      rx = -ry - rz;
    } else if (yDiff > zDiff) {
      ry = -rx - rz;
    } else {
      rz = -rx - ry;
    }

    // Convert back to offset (odd-r)
    // Axial q = x, r = y
    // Offset col = q + (r - (r & 1)) / 2
    const finalR = ry;
    const finalC = rx + Math.floor((ry - (ry & 1)) / 2);

    return `${finalR},${finalC}`;
  },

  getShipReachableTiles(originKey, maxDist) {
    if (!originKey) return new Set();

    // 1. Permanent Caching
    if (!this._shipReachableCache) this._shipReachableCache = new Map();
    const cacheKey = `${originKey}|${maxDist}`;
    if (this._shipReachableCache.has(cacheKey)) {
      return this._shipReachableCache.get(cacheKey);
    }

    const reachableCenters = new Map(); // centerKey -> distance
    const queue = [{ k: originKey, d: 0 }];
    reachableCenters.set(originKey, 0);

    const visualRange = maxDist; // Limit centers to maxDist

    // BFS to find ALL valid center positions
    let head = 0;
    while (head < queue.length) {
      const { k, d } = queue[head++];
      if (d >= visualRange) continue;

      const rc = this._parseKey(k);
      if (!rc) continue;

      const r = rc.r, c = rc.c, odd = (r % 2) === 1;
      const drs = [0, 0, -1, -1, 1, 1], dcs = [1, -1, odd ? 1 : 0, odd ? 0 : -1, odd ? 1 : 0, odd ? 0 : -1];

      for (let i = 0; i < 6; i++) {
        const nr = r + drs[i], nc = c + dcs[i];
        if (nr >= 0 && nr < this.map.rows && nc >= 0 && nc < this.map.cols) {
          const nk = `${nr},${nc}`;
          if (!reachableCenters.has(nk)) {
            // Ship must fit in the target tile (all 7 footprint tiles must be water)
            if (this._isShipFit(nk)) {
              reachableCenters.set(nk, d + 1);
              queue.push({ k: nk, d: d + 1 });
            }
          }
        }
      }
    }

    // 2. Compute union of all reachable footprints
    const allReachableTiles = new Set();
    for (const cKey of reachableCenters.keys()) {
      const keys = this._getOutpostKeys(cKey);
      for (const k of keys) allReachableTiles.add(k);
    }

    // 3. Extract boundary of the union
    const boundary = new Set();
    for (const k of allReachableTiles) {
      const rc = this._parseKey(k);
      const odd = (rc.r % 2) === 1;
      const drs = [0, 0, -1, -1, 1, 1], dcs = [1, -1, odd ? 1 : 0, odd ? 0 : -1, odd ? 1 : 0, odd ? 0 : -1];

      let isEdge = false;
      for (let i = 0; i < 6; i++) {
        const nr = rc.r + drs[i], nc = rc.c + dcs[i];
        const nk = `${nr},${nc}`;
        if (!allReachableTiles.has(nk)) {
          isEdge = true;
          break;
        }
      }
      if (isEdge) boundary.add(k);
    }

    const result = {
      boundary: boundary,
      centers: new Set(reachableCenters.keys())
    };
    this._shipReachableCache.set(cacheKey, result);
    return result;
  },

  _isWaterTile(key) {
    const t = this.tileByKey.get(key);
    return t && t.isWater;
  },

  _isShipFit(centerKey) {
    const rc = this._parseKey(centerKey);
    if (!rc) return false;

    const r = rc.r, c = rc.c, odd = (r % 2) === 1;
    const targets = [
      { r, c },
      { r, c: c + 1 },
      { r, c: c - 1 },
      { r: r - 1, c: c + (odd ? 1 : 0) },
      { r: r - 1, c: c + (odd ? 0 : -1) },
      { r: r + 1, c: c + (odd ? 1 : 0) },
      { r: r + 1, c: c + (odd ? 0 : -1) }
    ];

    for (const p of targets) {
      if (!this.inBounds(p.r, p.c)) return false;
      const t = this.tileByKey.get(`${p.r},${p.c}`);
      if (!t || !t.isWater) return false;
    }
    return true;
  },

  recomputeAllShipRanges() {
    console.log("[Structures] Pre-calculating all ship ranges...");
    for (const s of this.structures) {
      if (s.type === "ship") {
        const res = this.getShipReachableTiles(s.centerKey, 6);
        s.rangeKeys = res.boundary;
        s.reachableCenterKeys = res.centers;
      }
    }
  },

  _getTileNumberForKey(key) {
    const t = this.tileByKey.get(key);
    if (!t) return 0;

    // This is the same source used by numbers.js to draw tile numbers.
    const n = (typeof t.number === "number" && isFinite(t.number)) ? (t.number | 0) : 0;
    return n;
  },

  _getOutpostKeys(centerKeyOrTile) {
    const t = (typeof centerKeyOrTile === "object" && centerKeyOrTile !== null) ? centerKeyOrTile : this.tileByKey.get(centerKeyOrTile);
    if (t && t.footprintKeys && t.footprintKeys.length === 7) return t.footprintKeys;

    const centerKey = t ? t.key : centerKeyOrTile;

    // Prefer any existing selection list on the viewer.
    if (this.hoverCenterKey === centerKey) {
      const candidates = [
        this.hoverKeys,
        this.hoverTileKeys,
        this.hoverSelectionKeys,
        this.currentHoverKeys
      ];

      for (const v of candidates) {
        if (Array.isArray(v) && v.length > 0) return v.slice();
      }
    }

    // Fallback: center plus its 6 neighbors (7 total)
    const rc = t || this._parseKey(centerKey);
    if (!rc || typeof rc.r !== "number" || typeof rc.c !== "number") return [];

    if (!this.inBounds(rc.r, rc.c)) return [];

    const out = [];
    out.push(this.keyOf(rc.r, rc.c));

    const ns = this.neighborsOf(rc.r, rc.c);
    for (const n of ns) out.push(this.keyOf(n.r, n.c));

    return out;
  },

  _computeModeNumberFromSnapshot(nums) {
    // Ignore 0. Count everything else including 7, then resolve.
    const counts = new Map();

    for (const raw of nums) {
      const n = (typeof raw === "number" && isFinite(raw)) ? (raw | 0) : 0;
      if (n === 0) continue;
      counts.set(n, (counts.get(n) || 0) + 1);
    }

    if (counts.size === 0) return 0;

    let bestFreq = -1;
    for (const v of counts.values()) bestFreq = Math.max(bestFreq, v);

    const modes = [];
    for (const [n, f] of counts.entries()) {
      if (f === bestFreq) modes.push(n);
    }

    const pickLessFavorable = (arr) => {
      // Less favorable = further from 7. Deterministic tie break: smaller number.
      let best = arr[0];
      let bestDist = Math.abs(best - 7);

      for (let i = 1; i < arr.length; i++) {
        const n = arr[i];
        const d = Math.abs(n - 7);
        if (d > bestDist) {
          best = n;
          bestDist = d;
        } else if (d === bestDist) {
          if (n < best) best = n;
        }
      }
      return best;
    };

    let mode = (modes.length === 1) ? modes[0] : pickLessFavorable(modes);

    // If mode lands on 7, round to 6 or 8 based on which appears more in snapshot.
    // If tie or neither appear, choose 6.
    if (mode === 7) {
      const c6 = counts.get(6) || 0;
      const c8 = counts.get(8) || 0;
      mode = (c8 > c6) ? 8 : 6;
    }

    return clamp(mode, 2, 12);
  },

  _getWhiteDigitCanvas(d) {
    const icon = this.iconCache.getIcon(d);
    if (!icon) return null;

    const white = [255, 255, 255];
    if (typeof this.iconCache.getTintedWhiteOnlyCanvas === "function") {
      const c = this.iconCache.getTintedWhiteOnlyCanvas(d, white);
      return c || icon;
    }

    return icon;
  },

  _getXGlyphImage() {
    // Digits come from iconCache. Numeric 10 is often used as 'x' in some tile number sets,
    // but here we might need to load it explicitly or use afallback.
    // If icon cache doesn't have it, we'll try to load it.
    const icon = this.iconCache.getIcon("x");
    if (!icon) {
      if (typeof this.iconCache.loadIcon === "function") this.iconCache.loadIcon("x");
      return null;
    }
    return icon;
  },

  // ----------------------------
  // Structure placement and state
  // ----------------------------



  computeOutpostResourceCounts(keys) {
    const resourceData = Object.create(null);

    for (const k of keys) {
      const t = this.tileByKey.get(k);
      if (!t) continue;

      const res = tileNameToResource(t.name);
      if (!res) continue;

      if (!resourceData[res]) {
        resourceData[res] = { count: 0, numbers: new Set() };
      }

      resourceData[res].count++;
      if (t.number !== null && typeof t.number === "number") {
        resourceData[res].numbers.add(t.number);
      }
    }

    // Check for adjacent bandit tents
    let suppressedByBandits = false;
    for (const k of keys) {
      const rc = this._parseKey(k);
      if (!rc) continue;
      const neighbors = this.neighborsOf(rc.r, rc.c);
      for (const n of neighbors) {
        const nk = this.keyOf(n.r, n.c);
        const center = this.structureTileToCenter.get(nk);
        if (center) {
          const s = this.structureByCenter.get(center);
          if (s && s.type === "bandit_tent") {
            suppressedByBandits = true;
            break;
          }
        }
      }
      if (suppressedByBandits) break;
    }

    return { resourceData, isSuppressed: suppressedByBandits };
  },

  _getLegacyCounts(resourceData) {
    const counts = Object.create(null);
    for (const res in resourceData) {
      counts[res] = resourceData[res].count;
    }
    return counts;
  },

  computeResourceTieOptions(resourceCounts) {
    const entries = Object.entries(resourceCounts);
    if (entries.length === 0) return { maxCount: 0, options: [] };

    let best = 0;
    for (const [, v] of entries) best = Math.max(best, v | 0);

    const options = entries
      .filter(([, v]) => (v | 0) === best)
      .map(([k]) => k)
      .sort();

    return { maxCount: best, options };
  },

  computeFarmResourceTieOptions(resourceCounts) {
    const entries = Object.entries(resourceCounts);
    if (entries.length === 0) return { rank1: [], rank2: [] };

    // Group by count
    const byCount = new Map();
    for (const [res, count] of entries) {
      if (!byCount.has(count)) byCount.set(count, []);
      byCount.get(count).push(res);
    }

    // Sort counts descending
    const sortedCounts = [...byCount.keys()].sort((a, b) => b - a);

    const rank1 = byCount.get(sortedCounts[0]).sort();
    let rank2 = [];

    if (sortedCounts.length > 1) {
      rank2 = byCount.get(sortedCounts[1]).sort();
    }

    return { rank1, rank2 };
  },

  recomputeAllSettlementResources() {
    console.log(`[Structures] Recomputing resources for ${this.structures.length} settlements...`);
    for (const s of this.structures) {
      if (s.type === "outpost" || s.type === "farm") {
        const { resourceData, isSuppressed } = this.computeOutpostResourceCounts(s.keys);
        s.resourceData = resourceData;
        s.resourceCounts = this._getLegacyCounts(resourceData);
        s.isSuppressed = isSuppressed;

        // Keep yieldCount in sync for outposts (used by calculateResourcesForRoll)
        if (s.type === "outpost" && s.yieldResource && s.resourceCounts[s.yieldResource] != null) {
          s.yieldCount = s.resourceCounts[s.yieldResource] | 0;
        }
      } else if (s.type === "factory") {
        const { isSuppressed } = this.computeOutpostResourceCounts(s.keys);
        s.isSuppressed = isSuppressed;
      }
    }
  },




  _finalizePlaceOutpost(centerKey, keys, numberSnapshot, outpostNumber, resourceCounts, yieldResource, playerRgb, variantIndex = 0, isSuppressed = false, resourceData = null) {
    const yieldCount = (yieldResource && resourceCounts && resourceCounts[yieldResource]) ? (resourceCounts[yieldResource] | 0) : 0;

    const s = {
      type: "outpost",
      centerKey: centerKey,
      keys: keys.slice(),
      numberSnapshot: numberSnapshot.slice(),
      number: outpostNumber | 0,

      variantIndex: variantIndex,

      resourceCounts: resourceCounts,
      resourceData: resourceData,
      isSuppressed: isSuppressed,
      yieldResource: yieldResource || null,
      yieldCount: yieldCount | 0,

      playerRgb: [playerRgb[0], playerRgb[1], playerRgb[2]]
    };

    console.log(`[Placement] Finalized outpost at ${centerKey}. Type: ${s.type}, Variant: ${s.variantIndex}, Player: ${s.playerRgb}`);


    this.structures.push(s);
    this.structureByCenter.set(centerKey, s);

    for (const k of keys) {
      this.structureTileToCenter.set(k, centerKey);
    }

    this._updateSpatialIndex(s); // Maintain spatial index

    // Preload icons so drawing never triggers repeated loads.
    if (yieldResource && !this.resourceIconCache.getIcon(yieldResource)) this.resourceIconCache.loadIcon(yieldResource);
    if (!this.iconCache.getIcon(s.number)) this.iconCache.loadIcon(s.number);

    this._checkRuinClaims(keys, playerRgb);
    if (typeof this.updateMinimapStructures === "function") this.updateMinimapStructures();
  },

  _finalizePlaceFarm(centerKey, keys, numberSnapshot, farmNumber, resourceCounts, yieldResources, playerRgb, variantIndex = 0, isSuppressed = false, resourceData = null) {
    const s = {
      type: "farm",
      centerKey: centerKey,
      keys: keys.slice(),
      numberSnapshot: numberSnapshot.slice(),
      number: farmNumber | 0,
      variantIndex: variantIndex,
      resourceCounts: resourceCounts,
      resourceData: resourceData,
      isSuppressed: isSuppressed,
      yieldResources: yieldResources.slice(), // Array of resources
      playerRgb: [playerRgb[0], playerRgb[1], playerRgb[2]]
    };

    console.log(`[Placement] Finalized farm at ${centerKey}. Type: ${s.type}, Yield: ${s.yieldResources}`);

    this.structures.push(s);
    this.structureByCenter.set(centerKey, s);
    for (const k of keys) {
      this.structureTileToCenter.set(k, centerKey);
    }
    this._updateSpatialIndex(s); // Maintain spatial index

    for (const res of yieldResources) {
      if (!this.resourceIconCache.getIcon(res)) this.resourceIconCache.loadIcon(res);
    }
    if (!this.iconCache.getIcon(s.number)) this.iconCache.loadIcon(s.number);

    this._checkRuinClaims(keys, playerRgb);
    if (typeof this.updateMinimapStructures === "function") this.updateMinimapStructures();
  },

  _getRoadDirectionFromOrigin(originKey, mouseWorld) {
    const t = this.tileByKey.get(originKey);
    if (!t) return null;

    const dx = mouseWorld.x - t.cx;
    const dy = mouseWorld.y - t.cy;
    const angle = Math.atan2(dy, dx); // -PI to PI

    // Hex directions in odd-r grid:
    // E: 0, W: PI
    // NE: -PI/3, NW: -2PI/3
    // SE: PI/3, SW: 2PI/3 (approx, because of vertical compression)

    // Snapping to 3 axes:
    // Horizontal: 0, PI
    // DL (Diagonal Left \): PI/3, -2PI/3
    // DR (Diagonal Right /): -PI/3, 2PI/3

    const d_h = Math.min(Math.abs(angle), Math.abs(angle - Math.PI), Math.abs(angle + Math.PI));
    const d_dl = Math.min(Math.abs(angle - Math.PI / 3), Math.abs(angle + (2 * Math.PI) / 3));
    const d_dr = Math.min(Math.abs(angle + Math.PI / 3), Math.abs(angle - (2 * Math.PI) / 3));

    if (d_h <= d_dl && d_h <= d_dr) return "h";
    if (d_dl <= d_h && d_dl <= d_dr) return "dl";
    return "dr";
  },

  _getRoadTiles(originKey, direction) {
    const rc = this._parseKey(originKey);
    if (!rc) return [];

    const t = this.tileByKey.get(originKey);
    if (!t) return [];

    // Direction vector depends on mouse relative to origin
    const world = this.mouseWorld;
    const dx = world.x - t.cx;
    const dy = world.y - t.cy;

    let stepPos, stepNeg;
    if (direction === "h") {
      if (dx >= 0) { stepPos = this.stepE; stepNeg = this.stepW; }
      else { stepPos = this.stepW; stepNeg = this.stepE; }
    } else if (direction === "dl") {
      // \ direction (NW or SE)
      if (dy >= 0) { stepPos = this.stepSE; stepNeg = this.stepNW; }
      else { stepPos = this.stepNW; stepNeg = this.stepSE; }
    } else {
      // / direction (NE or SW)
      if (dy >= 0) { stepPos = this.stepSW; stepNeg = this.stepNE; }
      else { stepPos = this.stepNE; stepNeg = this.stepSW; }
    }

    const t0 = rc;
    const t1 = stepPos.call(this, t0.r, t0.c);
    const t2 = stepPos.call(this, t1.r, t1.c);

    if (!this.inBounds(t1.r, t1.c) || !this.inBounds(t2.r, t2.c)) return [originKey];

    return [this.keyOf(t0.r, t0.c), this.keyOf(t1.r, t1.c), this.keyOf(t2.r, t2.c)];
  },

  _isRoadOriginValid(key) {
    if (!key) return false;
    const cur = this.getCurrentPlayer();
    if (!cur) return false;

    const isMine = (s) => {
      if (!s || !s.playerRgb) return false;
      return s.playerRgb[0] === cur.rgb[0] &&
        s.playerRgb[1] === cur.rgb[1] &&
        s.playerRgb[2] === cur.rgb[2];
    };

    // Check tile itself (must be empty!)
    if (this.structureTileToCenter.has(key)) return false;

    // Neighbors must contain a settlement or road tile
    const parts = key.split(",");
    const r = Number(parts[0]);
    const c = Number(parts[1]);
    const ns = this.neighborsOf(r, c);

    for (const n of ns) {
      const nk = `${n.r},${n.c}`;
      const nc = this.structureTileToCenter.get(nk);
      if (nc) {
        const parent = this.structureByCenter.get(nc);
        if (parent && (parent.type === "outpost" || parent.type === "farm" || parent.type === "factory" || parent.type === "port" || parent.type === "castle" || parent.type === "mercenary_camp" || parent.type === "trade_town" || parent.type === "road") && isMine(parent)) return true;
        // Claimed ruins owned by current player also allow road building
        if (parent && parent.type === "ruin" && parent.claimed && parent.claimedByRgb &&
          parent.claimedByRgb[0] === cur.rgb[0] &&
          parent.claimedByRgb[1] === cur.rgb[1] &&
          parent.claimedByRgb[2] === cur.rgb[2]) return true;
      }
    }

    return false;
  },

  _isWaterTile(key) {
    const t = this.tileByKey.get(key);
    if (!t || !t.name) return false;
    const name = t.name.toLowerCase();
    return name.includes("water") || name.includes("river");
  },

  _isSnowTile(key) {
    const t = this.tileByKey.get(key);
    if (!t || !t.name) return false;
    const name = t.name.toLowerCase();
    return name.includes("snow");
  },

  _isTaigaTile(key) {
    const t = this.tileByKey.get(key);
    if (!t || !t.name) return false;
    const name = t.name.toLowerCase();
    return name.includes("taiga");
  },

  _isDesertTile(key) {
    const t = this.tileByKey.get(key);
    if (!t || !t.name) return false;
    const name = t.name.toLowerCase();
    return name.includes("sand") || name.includes("dune");
  },

  _isWallPlacementValid(centerKey) {
    if (!centerKey) return false;
    // Walls can't be on water
    if (this._isWaterTile(centerKey)) return false;
    // Walls can't be on existing structures
    if (this.structureTileToCenter.has(centerKey)) return false;
    return true;
  },

  _isWallPathClear(keys) {
    for (const k of keys) {
      if (this._isWaterTile(k)) return false;
      if (this.structureTileToCenter.has(k)) return false;
    }

    // Castle exclusion zone: walls can't be placed within 6 tiles of another player's castle
    if (!this._checkCastleExclusionZone(keys[1])) return false;

    // RULE: walls can't be placed within 6 tiles of a ruin (min distance 7)
    // Same as settlements (outposts/farms)
    const nearbyRuins = this._getNearbyStructures(keys[1], 10);
    for (const s of nearbyRuins) {
      if (s.type === "ruin") {
        const dist = this._hexDistance(keys[1], s.centerKey);
        if (dist <= 6) {
          console.log(`[Placement] Blocked: wall path too close to ruin at ${s.centerKey} (dist: ${dist}, min: 7).`);
          return false;
        }
      }
    }

    return true;
  },


  _getRuinRewards(centerKey) {
    const isCold = this._isSnowTile(centerKey) || this._isTaigaTile(centerKey);

    // Resource keys and counts for the map overlay
    const resources = [
      { res: "spices", count: 1 },
      { res: isCold ? "furs" : "herbs", count: 2 }
    ];

    // Formatted rewards for the popup
    const popupRewards = [
      { iconSrc: "./Tile_icons/resources/spices.png", label: "Spices", amount: "+1" },
      { iconSrc: `./Tile_icons/resources/${isCold ? "furs" : "herbs"}.png`, label: isCold ? "Furs" : "Herbs", amount: "+2" },
      { iconEmoji: "⭐", label: "Victory Point", amount: "+1" }
    ];

    return { resources, popupRewards };
  },

  _isRoadPathClear(keys, originKey) {
    for (const k of keys) {
      if (this._isWaterTile(k)) return false;

      // Every tile in the proposed road MUST be empty.
      if (this.structureTileToCenter.has(k)) return false;
    }

    // Castle exclusion zone: roads can't be placed within 6 tiles of another player's castle
    if (!this._checkCastleExclusionZone(keys[1])) return false;

    return true;
  },

  placeRoadAt(originKey, mouseWorld) {
    const dir = this._getRoadDirectionFromOrigin(originKey, mouseWorld);
    if (!dir) return;

    const keys = this._getRoadTiles(originKey, dir);
    if (keys.length !== 3) return;

    if (!this._isRoadPathClear(keys, originKey)) return;

    const cur = this.getCurrentPlayer();
    const s = {
      type: "road",
      centerKey: keys[1], // Centered on middle tile
      originKey: originKey,
      keys: keys,
      direction: dir,
      playerRgb: cur.rgb.slice()
    };

    this.structures.push(s);
    this.structureByCenter.set(s.centerKey, s);
    for (const k of keys) {
      this.structureTileToCenter.set(k, s.centerKey);
    }
    this._updateSpatialIndex(s); // Maintain spatial index

    this._checkRuinClaims(keys, cur.rgb);
    if (typeof this.updateMinimapStructures === "function") this.updateMinimapStructures();
  },

  placeWallAt(originKey, mouseWorld) {
    const dir = this._getRoadDirectionFromOrigin(originKey, mouseWorld);
    if (!dir) return;

    const keys = this._getRoadTiles(originKey, dir);
    if (keys.length !== 3) return;

    if (!this._isWallPathClear(keys)) return;

    const cur = this.getCurrentPlayer();
    const s = {
      type: "wall",
      centerKey: keys[1],
      originKey: originKey,
      keys: keys,
      direction: dir,
      playerRgb: cur.rgb.slice()
    };

    this.structures.push(s);
    this.structureByCenter.set(s.centerKey, s);
    for (const k of keys) {
      this.structureTileToCenter.set(k, s.centerKey);
    }
    this._updateSpatialIndex(s); // Maintain spatial index

    this._checkRuinClaims(keys, cur.rgb);
    if (typeof this.updateMinimapStructures === "function") this.updateMinimapStructures();
  },

  _isOutpostPlacementValid(centerKeyOrTile, skipDistance = false) {
    if (!centerKeyOrTile) return false;

    const keys = this._getOutpostKeys(centerKeyOrTile);
    if (keys.length !== 7) {
      console.warn(`[Placement] Invalid footprint size: ${keys.length} (expected 7). Near map edge?`);
      return false;
    }

    // Radius 1 footprint must be completely empty and non-water
    for (const k of keys) {
      if (this._isWaterTile(k)) {
        console.log(`[Placement] Blocked: tile ${k} is water.`);
        return false;
      }
      if (this.structureTileToCenter.has(k)) {
        console.log(`[Placement] Blocked: tile ${k} already has a structure.`);
        return false;
      }
    }

    if (skipDistance) return true;

    // RULE: settlements (outposts, farms, bandit HQs) can't be within 5 tiles of each other
    // RULE: settlements can't be within 6 tiles of a ruin (prevents easy capture)
    // Use spatial index for O(1) distance checks instead of O(Structures)
    const nearby = this._getNearbyStructures(centerKeyOrTile, 10);
    for (const s of nearby) {
      if (!s || !s.type || !s.centerKey) continue;
      if (s.type === "outpost" || s.type === "farm" || s.type === "bandit_hq" || s.type === "factory" || s.type === "mercenary_camp" || s.type === "trade_town") {
        const dist = this._hexDistance(centerKeyOrTile, s.centerKey);
        if (dist <= 5) {
          console.log(`[Placement] Blocked: too close to existing ${s.type} at ${s.centerKey} (dist: ${dist}, min: 6).`);
          return false;
        }
      }
      if (s.type === "ruin") {
        const dist = this._hexDistance(centerKeyOrTile, s.centerKey);
        if (dist <= 6) {
          // Claimed ruins only let the owning player build nearby
          const cur = this.getCurrentPlayer();
          const curKey = JSON.stringify(cur.rgb);
          const ownerKey = s.claimed ? JSON.stringify(s.claimedByRgb) : null;
          if (!s.claimed || curKey !== ownerKey) {
            console.log(`[Placement] Blocked: too close to ruin at ${s.centerKey} (dist: ${dist}, min: 7).`);
            return false;
          }
        }
      }
    }
    // Castle exclusion zone: can't build structures within 6 tiles of another player's castle
    if (!this._checkCastleExclusionZone(centerKeyOrTile)) return false;

    return true;
  },

  /**
   * Check if centrKey is within a castle exclusion zone owned by another player.
   * Returns true if placement is allowed, false if blocked.
   */
  _checkCastleExclusionZone(centerKey) {
    if (!centerKey) return true;
    const cur = this.getCurrentPlayer();
    const curKey = JSON.stringify(cur.rgb);

    const nearby = this._getNearbyStructures(centerKey, 9);
    for (const s of nearby) {
      if (s.type !== "castle") continue;
      const ownerKey = JSON.stringify(s.playerRgb);
      if (ownerKey === curKey) continue; // Owner can build in their own zone
      const dist = this._hexDistance(centerKey, s.centerKey);
      if (dist <= 8) {
        console.log(`[Placement] Blocked: within castle exclusion zone at ${s.centerKey} (dist: ${dist}).`);
        return false;
      }
    }
    return true;
  },

  _isFactoryPlacementValid(centerKey) {
    if (!centerKey) return false;

    // Must be on Snow
    if (!this._isSnowTile(centerKey)) {
      return false;
    }

    const valid = this._isOutpostPlacementValid(centerKey);
    return valid;
  },

  _isBanditTentPlacementValid(centerKey) {
    if (!centerKey) return false;
    if (this._isWaterTile(centerKey)) return false;
    if (this.structureTileToCenter.has(centerKey)) return false;

    // Castle exclusion zone: bandit tents can't be placed within 6 tiles of another player's castle
    if (!this._checkCastleExclusionZone(centerKey)) return false;

    return true;
  },

  _isCastlePlacementValid(centerKey) {
    if (!centerKey) return false;
    // Only validate footprint (land, no overlap) — castles can be placed
    // near other players' structures. The exclusion zone only prevents
    // future building after placement.
    if (!this._isOutpostPlacementValid(centerKey, true)) return false;

    // But castles can't be placed within range of ANY other castle (any player)
    const nearby = this._getNearbyStructures(centerKey, 10);
    for (const s of nearby) {
      if (s.type === "castle") {
        const dist = this._hexDistance(centerKey, s.centerKey);
        if (dist <= 8) {
          console.log(`[Placement] Blocked: too close to existing castle at ${s.centerKey} (dist: ${dist}).`);
          return false;
        }
      }
      // Radius 6 is the "no build" zone
      if (s.type === "ruin") {
        const dist = this._hexDistance(centerKey, s.centerKey);
        if (dist <= 6) {
          console.log(`[Placement] Blocked: too close to ruin at ${s.centerKey} (dist: ${dist}, min: 7).`);
          return false;
        }
      }
    }
    return true;
  },

  _isPortPlacementValid(centerKey) {
    if (!centerKey) return false;

    // Radius 1 footprint must be completely empty and non-water (same as outpost/farm)
    // BUT we skip the distance-from-other-settlements check for ports.
    const validLand = this._isOutpostPlacementValid(centerKey, true);
    if (!validLand) return false;

    // BUT it must ALSO be adjacent to at least one water tile
    const keys = this._getOutpostKeys(centerKey);
    let touchesWater = false;
    for (const k of keys) {
      const rc = this._parseKey(k);
      const ns = this.neighborsOf(rc.r, rc.c);
      for (const n of ns) {
        if (this._isWaterTile(this.keyOf(n.r, n.c))) {
          touchesWater = true;
          break;
        }
      }
      if (touchesWater) break;
    }

    if (!touchesWater) {
      console.log(`[Placement] Blocked: Port must be adjacent to water.`);
      return false;
    }

    // Castle exclusion zone: ports can't be placed within 6 tiles of another player's castle
    if (!this._checkCastleExclusionZone(centerKey)) return false;

    // RULE: ports can't be placed within 6 tiles of a ruin (distance 6, same as outposts)
    const nearby = this._getNearbyStructures(centerKey, 10);
    for (const s of nearby) {
      if (s.type === "ruin") {
        const dist = this._hexDistance(centerKey, s.centerKey);
        if (dist <= 6) {
          console.log(`[Placement] Blocked: too close to ruin at ${s.centerKey} (dist: ${dist}, min: 7).`);
          return false;
        }
      }
    }

    return true;
  },

  _isMercenaryCampPlacementValid(centerKey) {
    if (!centerKey) return false;

    // Entire 7-tile footprint must be on Desert (Sand or Dune)
    const keys = this._getOutpostKeys(centerKey);
    for (const k of keys) {
      if (!this._isDesertTile(k)) {
        console.log(`[Placement] Blocked: Mercenary Camp footprint at ${k} is not a desert tile.`);
        return false;
      }
    }

    // Reuse outpost validation for distance checks (already checking footprint emptiness)
    return this._isOutpostPlacementValid(centerKey);
  },




  placeOutpostAt(centerKey) {
    if (!this._isOutpostPlacementValid(centerKey)) return;
    if (this._pendingOutpostChoice) return;

    const keys = this._getOutpostKeys(centerKey);
    if (keys.length !== 7) return;

    // Snapshot numbers first. This is the only data used for outpost number.
    const numberSnapshot = [];
    for (const k of keys) numberSnapshot.push(this._getTileNumberForKey(k));

    const outpostNumber = this._computeModeNumberFromSnapshot(numberSnapshot);

    const cur = this.getCurrentPlayer();
    const { resourceData, isSuppressed } = this.computeOutpostResourceCounts(keys);
    const resourceCounts = this._getLegacyCounts(resourceData);
    const tie = this.computeResourceTieOptions(resourceCounts);

    // Always roll a fresh random variant for every placement
    if (this.outpostVariants && this.outpostVariants.length > 0) {
      this.currentOutpostVariant = Math.floor(Math.random() * this.outpostVariants.length);
    }
    const variantIndex = this.currentOutpostVariant || 0;
    console.log(`[Placement] Final random roll for new outpost: ${variantIndex}`);

    if (tie.options.length === 0) {
      this._finalizePlaceOutpost(centerKey, keys, numberSnapshot, outpostNumber, resourceCounts, null, cur.rgb, variantIndex, isSuppressed);
      return;
    }

    if (tie.options.length === 1) {
      this._finalizePlaceOutpost(centerKey, keys, numberSnapshot, outpostNumber, resourceCounts, tie.options[0], cur.rgb, variantIndex, isSuppressed);
      return;
    }

    // Tie: let player pick. While tie exists, show both icons on overlay.
    this._pendingOutpostChoice = {
      centerKey,
      keys: keys.slice(),
      numberSnapshot: numberSnapshot.slice(),
      outpostNumber: outpostNumber | 0,
      variantIndex: variantIndex,
      resourceCounts: resourceCounts,
      isSuppressed: isSuppressed,
      options: tie.options.slice(),
      playerRgb: [cur.rgb[0], cur.rgb[1], cur.rgb[2]]
    };

    for (const res of tie.options) {
      if (!this.resourceIconCache.getIcon(res)) this.resourceIconCache.loadIcon(res);
    }
    if (!this.iconCache.getIcon(outpostNumber)) this.iconCache.loadIcon(outpostNumber);

    showResourceChoice(
      tie.options,
      this.resourceIconCache,
      resourceCounts,
      () => { },
      (picked) => {
        const p = this._pendingOutpostChoice;
        if (!p) return;

        this._finalizePlaceOutpost(
          p.centerKey,
          p.keys,
          p.numberSnapshot,
          p.outpostNumber,
          p.resourceCounts,
          picked,
          p.playerRgb,
          p.variantIndex,
          p.isSuppressed
        );

        this._pendingOutpostChoice = null;
        this.updateHud();
      }
    );
  },

  placePortAt(centerKey) {
    if (!this._isPortPlacementValid(centerKey)) return;

    const keys = this._getOutpostKeys(centerKey);
    if (keys.length !== 7) return;

    const cur = this.getCurrentPlayer();

    // Roll random variant
    if (this.portVariants && this.portVariants.length > 0) {
      this.currentPortVariant = Math.floor(Math.random() * this.portVariants.length);
    }
    const variantIndex = this.currentPortVariant || 0;

    this._finalizePlacePort(centerKey, keys, cur.rgb, variantIndex);
  },

  _finalizePlacePort(centerKey, keys, playerRgb, variantIndex = 0) {
    const s = {
      type: "port",
      centerKey: centerKey,
      keys: keys.slice(),
      variantIndex: variantIndex,
      playerRgb: [playerRgb[0], playerRgb[1], playerRgb[2]]
    };

    console.log(`[Placement] Finalized port at ${centerKey}. Variant: ${variantIndex}`);

    this.structures.push(s);
    this.structureByCenter.set(centerKey, s);
    for (const k of keys) {
      this.structureTileToCenter.set(k, centerKey);
    }
    this._updateSpatialIndex(s); // Maintain spatial index

    this._checkRuinClaims(keys, playerRgb);
    if (typeof this.updateMinimapStructures === "function") this.updateMinimapStructures();
  },

  placeCastleAt(centerKey) {
    if (!this._isCastlePlacementValid(centerKey)) return;

    const keys = this._getOutpostKeys(centerKey);
    if (keys.length !== 7) return;

    const cur = this.getCurrentPlayer();

    // Roll random variant
    if (this.castleVariants && this.castleVariants.length > 0) {
      this.currentCastleVariant = Math.floor(Math.random() * this.castleVariants.length);
    }
    const variantIndex = this.currentCastleVariant || 0;

    this._finalizePlaceCastle(centerKey, keys, cur.rgb, variantIndex);

    // Award +1 VP to the placing player
    const p = this.players.find(pl => pl.rgb && pl.rgb[0] === cur.rgb[0] && pl.rgb[1] === cur.rgb[1] && pl.rgb[2] === cur.rgb[2]);
    if (p) {
      p.victoryPoints = (p.victoryPoints || 0) + 1;
      console.log(`[Castle] ${p.name} placed castle at ${centerKey}. VP: ${p.victoryPoints}`);
    }
    this.updateGameUi();
  },

  _finalizePlaceCastle(centerKey, keys, playerRgb, variantIndex = 0) {
    const s = {
      type: "castle",
      centerKey: centerKey,
      keys: keys.slice(),
      variantIndex: variantIndex,
      playerRgb: [playerRgb[0], playerRgb[1], playerRgb[2]]
    };

    console.log(`[Placement] Finalized castle at ${centerKey}. Variant: ${variantIndex}`);

    this.structures.push(s);
    this.structureByCenter.set(centerKey, s);
    for (const k of keys) {
      this.structureTileToCenter.set(k, centerKey);
    }
    this._updateSpatialIndex(s);

    this._checkRuinClaims(keys, playerRgb);
    if (typeof this.updateMinimapStructures === "function") this.updateMinimapStructures();
  },

  // ----------------------------
  // Trade Town
  // ----------------------------

  _isTradeTownPlacementValid(centerKey) {
    // Same rules as port: valid land + adjacent to water + castle exclusion
    return this._isPortPlacementValid(centerKey);
  },

  placeTradeTownAt(centerKey) {
    if (!this._isTradeTownPlacementValid(centerKey)) return;

    const keys = this._getOutpostKeys(centerKey);
    if (keys.length !== 7) return;

    const cur = this.getCurrentPlayer();

    // Determine most common resource under footprint
    const { resourceData } = this.computeOutpostResourceCounts(keys);
    const counts = this._getLegacyCounts(resourceData);

    let bestRes = null;
    let bestCount = 0;
    for (const [res, cnt] of Object.entries(counts)) {
      if (cnt > bestCount) {
        bestCount = cnt;
        bestRes = res;
      }
    }

    if (!bestRes) {
      console.warn(`[TradeTown] No resources found under footprint at ${centerKey}`);
      return;
    }

    // Trade ratio based on tile count of most common resource
    // 1-4 tiles = 3:1, 5-6 tiles = 2:1, 7 tiles = 1:1
    let tradeRatio;
    if (bestCount >= 7) tradeRatio = 1;
    else if (bestCount >= 5) tradeRatio = 2;
    else tradeRatio = 3;

    console.log(`[TradeTown] ${bestRes} x${bestCount} → trade ratio ${tradeRatio}:1`);

    // Roll random variant
    if (this.tradeTownVariants && this.tradeTownVariants.length > 0) {
      this.currentTradeTownVariant = Math.floor(Math.random() * this.tradeTownVariants.length);
    }
    const variantIndex = this.currentTradeTownVariant || 0;

    const playerRgb = [cur.rgb[0], cur.rgb[1], cur.rgb[2]];
    this._finalizePlaceTradeTown(centerKey, keys, playerRgb, variantIndex, tradeRatio, bestRes);
  },

  _finalizePlaceTradeTown(centerKey, keys, playerRgb, variantIndex, tradeRatio, tradeResource) {
    const s = {
      type: "trade_town",
      centerKey: centerKey,
      keys: keys.slice(),
      variantIndex: variantIndex,
      playerRgb: [playerRgb[0], playerRgb[1], playerRgb[2]],
      tradeRatio: tradeRatio,
      tradeResource: tradeResource
    };

    console.log(`[Placement] Finalized trade town at ${centerKey}. Variant: ${variantIndex}, Ratio: ${tradeRatio}:1 ${tradeResource}`);

    // Pre-load the resource icon
    if (tradeResource && !this.resourceIconCache.getIcon(tradeResource)) {
      this.resourceIconCache.loadIcon(tradeResource);
    }

    this.structures.push(s);
    this.structureByCenter.set(centerKey, s);
    for (const k of keys) {
      this.structureTileToCenter.set(k, centerKey);
    }
    this._updateSpatialIndex(s);

    this._checkRuinClaims(keys, playerRgb);
    if (typeof this.updateMinimapStructures === "function") this.updateMinimapStructures();
  },

  placeBanditTentAt(centerKey) {
    if (!this._isBanditTentPlacementValid(centerKey)) return;
    const cur = this.getCurrentPlayer();
    this._finalizePlaceBanditTent(centerKey, cur.rgb);
  },

  _isShipPlacementValid(centerKey) {
    if (!centerKey) return false;
    if (!this._isShipFit(centerKey)) return false;

    const keys = this._getOutpostKeys(centerKey);
    for (const k of keys) {
      // No overlap with existing structures
      if (this.structureTileToCenter.has(k)) return false;
    }

    // When moving a ship, enforce 6-tile range from original position
    if (this._movingShip && this._movingShipOldKey) {
      const dist = this._hexDistance(centerKey, this._movingShipOldKey);
      if (dist > 6) return false;
    }

    return true;
  },

  _finalizeShipPlacement(centerKey, keys, playerRgb, variantIndex) {
    const res = this.getShipReachableTiles(centerKey, 6);
    const s = {
      type: "ship",
      centerKey: centerKey,
      keys: keys.slice(),
      playerRgb: [playerRgb[0], playerRgb[1], playerRgb[2]],
      variantIndex: variantIndex,
      facingLeft: this._movingShipFacingLeft || false,
      rangeKeys: res.boundary,
      reachableCenterKeys: res.centers
    };

    console.log(`[Placement] Finalized ship at ${centerKey}. Variant: ${variantIndex}`);

    this.structures.push(s);
    this.structureByCenter.set(centerKey, s);
    for (const k of keys) {
      this.structureTileToCenter.set(k, centerKey);
    }
    this._updateSpatialIndex(s); // Maintain spatial index
    this._checkRuinClaims(keys, playerRgb);
    if (typeof this.updateMinimapStructures === "function") this.updateMinimapStructures();
  },

  placeShipAt(centerKey) {
    if (!this._isShipPlacementValid(centerKey)) return;

    const keys = this._getOutpostKeys(centerKey);
    if (keys.length !== 7) return;

    const cur = this.getCurrentPlayer();
    const variantIndex = this.currentShipVariant || 0;
    this._finalizeShipPlacement(centerKey, keys, cur.rgb, variantIndex);
  },


  placeFarmAt(centerKey) {
    if (!this._isOutpostPlacementValid(centerKey)) return; // Use same validation as outpost
    if (this._pendingFarmChoice) return;

    const keys = this._getOutpostKeys(centerKey);
    if (keys.length !== 7) return;

    const numberSnapshot = [];
    for (const k of keys) numberSnapshot.push(this._getTileNumberForKey(k));
    const farmNumber = this._computeModeNumberFromSnapshot(numberSnapshot);

    const cur = this.getCurrentPlayer();
    const { resourceData, isSuppressed } = this.computeOutpostResourceCounts(keys);
    const resourceCounts = this._getLegacyCounts(resourceData);
    const ties = this.computeFarmResourceTieOptions(resourceCounts);

    // Roll random variant
    if (this.farmVariants && this.farmVariants.length > 0) {
      this.currentFarmVariant = Math.floor(Math.random() * this.farmVariants.length);
    }
    const variantIndex = this.currentFarmVariant || 0;

    let gathered = [];

    if (ties.rank1.length > 2) {
      // Three-way (or more) tie at rank 1: let the player pick exactly 2.
      this._pendingFarmChoice = {
        centerKey,
        keys: keys.slice(),
        numberSnapshot: numberSnapshot.slice(),
        farmNumber: farmNumber | 0,
        variantIndex: variantIndex,
        resourceCounts: resourceCounts,
        isSuppressed: isSuppressed,
        playerRgb: [cur.rgb[0], cur.rgb[1], cur.rgb[2]]
      };

      showResourceChoiceMulti(
        ties.rank1,
        this.resourceIconCache,
        resourceCounts,
        2,
        (pickedArray) => {
          const p = this._pendingFarmChoice;
          if (!p) return;
          this._finalizePlaceFarm(p.centerKey, p.keys, p.numberSnapshot, p.farmNumber, p.resourceCounts, pickedArray, p.playerRgb, p.variantIndex, p.isSuppressed);
          this._pendingFarmChoice = null;
          this.updateHud();
        },
        "Choose 2 Yields"
      );
      return;
    }

    // If Rank 1 has exactly 2 ties, take both.
    gathered.push(...ties.rank1);

    // If Rank 1 had only 1, we also look at Rank 2.
    if (ties.rank1.length === 1 && ties.rank2.length > 0) {
      if (ties.rank2.length === 1) {
        gathered.push(ties.rank2[0]);
      } else {
        // Rank 2 tie: let player pick ONE from Rank 2 options.
        this._pendingFarmChoice = {
          centerKey,
          keys: keys.slice(),
          numberSnapshot: numberSnapshot.slice(),
          farmNumber: farmNumber | 0,
          variantIndex: variantIndex,
          resourceCounts: resourceCounts,
          isSuppressed: isSuppressed,
          rank1Resources: ties.rank1.slice(),
          rank2Options: ties.rank2.slice(),
          playerRgb: [cur.rgb[0], cur.rgb[1], cur.rgb[2]]
        };

        showResourceChoice(
          ties.rank2,
          this.resourceIconCache,
          resourceCounts,
          () => { },
          (picked) => {
            const p = this._pendingFarmChoice;
            if (!p) return;
            const finalYield = [...p.rank1Resources, picked];
            this._finalizePlaceFarm(p.centerKey, p.keys, p.numberSnapshot, p.farmNumber, p.resourceCounts, finalYield, p.playerRgb, p.variantIndex, p.isSuppressed);
            this._pendingFarmChoice = null;
            this.updateHud();
          },
          "Choose 2nd Yield"
        );
        return;
      }
    }

    this._finalizePlaceFarm(centerKey, keys, numberSnapshot, farmNumber, resourceCounts, gathered, cur.rgb, variantIndex, isSuppressed);
  },

  placeFactoryAt(centerKey) {
    if (!this._isFactoryPlacementValid(centerKey)) {
      console.log("Factory placement invalid at", centerKey);
      return;
    }
    if (this._pendingFactoryChoice) return;

    const keys = this._getOutpostKeys(centerKey);
    if (keys.length !== 7) return;

    const cur = this.getCurrentPlayer();

    // Factory produces 1 resource of choice.
    // The player chooses ONE resource from ALL available resources in the game.
    // We can get the complete list from TILE_TO_RESOURCE_KEY in resources.js or just hardcode/scan.
    // However, `showResourceChoice` expects options.
    // Let's gather all unique resources from the map to be safe, or just use a standard set.
    // A strict interpretation of "choose one type of resource" implies any resource.
    const allResources = ["grain", "timber", "brick", "livestock", "ore", "spices", "herbs", "furs"];

    // Always roll random variant
    if (this.factoryVariants && this.factoryVariants.length > 0) {
      this.currentFactoryVariant = Math.floor(Math.random() * this.factoryVariants.length);
    }
    const variantIndex = this.currentFactoryVariant || 0;

    const { isSuppressed } = this.computeOutpostResourceCounts(keys);

    this._pendingFactoryChoice = {
      centerKey,
      keys: keys.slice(),
      variantIndex: variantIndex,
      isSuppressed: isSuppressed,
      playerRgb: [cur.rgb[0], cur.rgb[1], cur.rgb[2]]
    };

    // Preload icons
    for (const res of allResources) {
      if (!this.resourceIconCache.getIcon(res)) this.resourceIconCache.loadIcon(res);
    }

    showResourceChoice(
      allResources,
      this.resourceIconCache,
      {}, // No counts needed for this prompt really, but we satisfy signature
      null, // No hover callback needed, previous implementation was clearing the pending choice!
      (picked) => {
        const p = this._pendingFactoryChoice;
        if (!p) return;
        this._finalizePlaceFactory(p.centerKey, p.keys, picked, p.playerRgb, p.variantIndex, p.isSuppressed);
        this._pendingFactoryChoice = null;
        this.updateHud();
      },
      "Choose Production"
    );
  },

  placeMercenaryCampAt(centerKey) {
    if (!this._isMercenaryCampPlacementValid(centerKey)) return;

    const keys = this._getOutpostKeys(centerKey);
    if (keys.length !== 7) return;

    const cur = this.getCurrentPlayer();

    // Roll random variant
    if (this.mercenaryCampVariants && this.mercenaryCampVariants.length > 0) {
      this.currentMercenaryCampVariant = Math.floor(Math.random() * this.mercenaryCampVariants.length);
    }
    const variantIndex = this.currentMercenaryCampVariant || 0;

    this._finalizePlaceMercenaryCamp(centerKey, keys, cur.rgb, variantIndex);
  },

  async _finalizePlaceMercenaryCamp(centerKey, keys, playerRgb, variantIndex = 0) {
    const s = {
      type: "mercenary_camp",
      centerKey: centerKey,
      keys: keys.slice(),
      variantIndex: variantIndex,
      playerRgb: [playerRgb[0], playerRgb[1], playerRgb[2]]
    };

    console.log(`[Placement] Finalized mercenary camp at ${centerKey}. Variant: ${variantIndex}`);

    this.structures.push(s);
    this.structureByCenter.set(centerKey, s);
    for (const k of keys) {
      this.structureTileToCenter.set(k, centerKey);
    }

    this._checkRuinClaims(keys, playerRgb);
    this._updateSpatialIndex(s);
    if (typeof this.updateMinimapStructures === "function") this.updateMinimapStructures();

    // Trigger stealing UI
    const { showMercenaryCampPrompt } = await import("../../ui/turnEvents.js");

    showMercenaryCampPrompt(this.getCurrentPlayer(), () => {
      // Prompt dismissed, no further action for now since steal selection is simplified
      this.updateHud();
      this.updateGameUi();
    });

  },


  _finalizePlaceFactory(centerKey, keys, yieldResource, playerRgb, variantIndex = 0, isSuppressed = false) {
    // We need dummy resourceData/Counts to satisfy the overlay renderer if we reuse _drawOutpostOverlay
    // factory always produces 1 "of that resource".
    // Let's mock the data structure so _drawOutpostOverlay works without crashing.
    const resourceData = {};
    resourceData[yieldResource] = { count: 1, numbers: new Set() };
    const resourceCounts = {};
    resourceCounts[yieldResource] = 1;

    const s = {
      type: "factory",
      centerKey: centerKey,
      keys: keys.slice(),
      variantIndex: variantIndex,
      yieldResource: yieldResource,
      resourceData: resourceData,
      resourceCounts: resourceCounts,
      isSuppressed: isSuppressed,
      playerRgb: [playerRgb[0], playerRgb[1], playerRgb[2]]
    };

    console.log(`[Placement] Finalized factory at ${centerKey}. Type: ${s.type}, Yield: ${s.yieldResource}`);

    this.structures.push(s);
    this.structureByCenter.set(centerKey, s);
    for (const k of keys) {
      this.structureTileToCenter.set(k, centerKey);
    }
    this._updateSpatialIndex(s); // Maintain spatial index

    if (!this.resourceIconCache.getIcon(yieldResource)) this.resourceIconCache.loadIcon(yieldResource);

    this._checkRuinClaims(keys, playerRgb);
    if (typeof this.updateMinimapStructures === "function") this.updateMinimapStructures();
  },

  // ----------------------------
  // Outpost sprite and overlay drawing
  // ----------------------------

  _getOutpostOutlinedCanvas(rgb, variantIndex = 0) {
    if (!this.outpostReady || this.outpostVariants.length === 0) return null;
    const img = this.outpostVariants[variantIndex % this.outpostVariants.length];
    if (!img) return null;
    return this._getOutlinedSprite(img, rgb, `outpost:${variantIndex}`);
  },

  _getFarmOutlinedCanvas(rgb, variantIndex = 0) {
    if (!this.farmReady || this.farmVariants.length === 0) return null;
    const img = this.farmVariants[variantIndex % this.farmVariants.length];
    if (!img) return null;
    return this._getOutlinedSprite(img, rgb, `farm:${variantIndex}`);
  },

  _getFactoryOutlinedCanvas(rgb, variantIndex = 0) {
    if (!this.factoryReady || !this.factoryVariants || this.factoryVariants.length === 0) {
      // console.warn("Factory assets not ready");
      return null;
    }
    const img = this.factoryVariants[variantIndex % this.factoryVariants.length];
    if (!img) return null;
    return this._getOutlinedSprite(img, rgb, `factory:${variantIndex}`);
  },

  _getPortOutlinedCanvas(rgb, variantIndex = 0) {
    if (!this.portReady || !this.portVariants || this.portVariants.length === 0) return null;
    const img = this.portVariants[variantIndex % this.portVariants.length];
    if (!img) return null;
    return this._getOutlinedSprite(img, rgb, `port:${variantIndex}`);
  },

  _getCastleOutlinedCanvas(rgb, variantIndex = 0) {
    if (!this.castleReady || !this.castleVariants || this.castleVariants.length === 0) return null;
    const img = this.castleVariants[variantIndex % this.castleVariants.length];
    if (!img) return null;
    return this._getOutlinedSprite(img, rgb, `castle:${variantIndex}`);
  },

  _getTradeTownOutlinedCanvas(rgb, variantIndex = 0) {
    if (!this.tradeTownReady || !this.tradeTownVariants || this.tradeTownVariants.length === 0) return null;
    const img = this.tradeTownVariants[variantIndex % this.tradeTownVariants.length];
    if (!img) return null;
    return this._getOutlinedSprite(img, rgb, `trade_town:${variantIndex}`);
  },

  _getOutlinedSprite(img, rgb, cacheKey) {
    if (!img) return null;
    const iw = (img.naturalWidth || img.width || 0);
    const ih = (img.naturalHeight || img.height || 0);
    if (iw <= 0 || ih <= 0) return null;

    if (!this._spriteOutlineCache) this._spriteOutlineCache = new Map();

    const rr = Math.max(0, Math.min(255, rgb[0] | 0));
    const gg = Math.max(0, Math.min(255, rgb[1] | 0));
    const bb = Math.max(0, Math.min(255, rgb[2] | 0));

    const fullKey = `${cacheKey}|${iw}x${ih}|${rr},${gg},${bb}`;
    const cached = this._spriteOutlineCache.get(fullKey);
    if (cached) return cached;

    const outlined = buildOutlinedSpriteCanvas4(img, [rr, gg, bb]);
    if (outlined) this._spriteOutlineCache.set(fullKey, outlined);
    return outlined;
  },

  _computeFactoryDrawRect(centerKey, rgb, variantIndex = 0) {
    const t = this.tileByKey.get(centerKey);
    if (!t) return null;

    if (!this.factoryReady) return null; // Logic gate

    const yOffNative = (typeof this.outpostYOffsetPx === "number") ? this.outpostYOffsetPx : -10;
    const xOffNative = (typeof this.outpostXOffsetPx === "number") ? this.outpostXOffsetPx : -1;

    const variantCount = (this.factoryVariants && this.factoryVariants.length) || 0;
    if (variantCount === 0) {
      console.log("FactoryDraw: No variants");
      return null;
    }
    const img = this.factoryVariants[variantIndex % variantCount];
    if (!img) {
      console.log("FactoryDraw: No image for index", variantIndex);
      return null;
    }

    const iw = (img.naturalWidth || img.width || 0);
    const ih = (img.naturalHeight || img.height || 0);
    if (iw <= 0 || ih <= 0) return null;

    const outlined = this._getFactoryOutlinedCanvas(rgb, variantIndex);
    // if (!outlined) console.log("FactoryDraw: No outline");

    const sw = outlined ? outlined.width : iw;
    const sh = outlined ? outlined.height : ih;

    const w = sw * this.mapScale;
    const h = sh * this.mapScale;


    const tileX = t.baseX;
    const tileY = t.baseY + t.dy - t.lift;

    const cx = tileX + t.width * 0.5;
    const cy = tileY + t.height * 0.5;

    let x = cx - w * 0.5 + (xOffNative * this.mapScale);
    let y = cy - h * 0.5 + (yOffNative * this.mapScale);

    if (outlined) {
      x -= this.mapScale;
      y -= this.mapScale;
    }

    // Correct 1 rendered pixel
    y -= this.mapScale;

    return { x, y, w, h, cx, cy, outlined, img };
  },

  _computeOutpostDrawRect(centerKey, rgb, variantIndex = 0) {
    const t = this.tileByKey.get(centerKey);
    if (!t) return null;

    const yOffNative = (typeof this.outpostYOffsetPx === "number") ? this.outpostYOffsetPx : -10;
    const xOffNative = (typeof this.outpostXOffsetPx === "number") ? this.outpostXOffsetPx : -1;

    const variantCount = (this.outpostVariants && this.outpostVariants.length) || 0;
    if (variantCount === 0) return null;
    const img = this.outpostVariants[variantIndex % variantCount];
    if (!img) return null;

    const iw = (img.naturalWidth || img.width || 0);
    const ih = (img.naturalHeight || img.height || 0);
    if (iw <= 0 || ih <= 0) return null;

    const outlined = this._getOutpostOutlinedCanvas(rgb, variantIndex);

    const sw = outlined ? outlined.width : iw;
    const sh = outlined ? outlined.height : ih;

    const w = sw * this.mapScale;
    const h = sh * this.mapScale;

    const tileX = t.baseX;
    const tileY = t.baseY + t.dy - t.lift;

    const cx = tileX + t.width * 0.5;
    const cy = tileY + t.height * 0.5;

    let x = cx - w * 0.5 + (xOffNative * this.mapScale);
    let y = cy - h * 0.5 + (yOffNative * this.mapScale);

    if (outlined) {
      x -= this.mapScale;
      y -= this.mapScale;
    }

    // Correct 1 rendered pixel
    y -= this.mapScale;

    return { x, y, w, h, cx, cy, outlined, img };
  },

  _computeFarmDrawRect(centerKey, rgb, variantIndex = 0) {
    const t = this.tileByKey.get(centerKey);
    if (!t) return null;

    // Use same offsets as outpost for now, they are similar settlements
    const yOffNative = (typeof this.outpostYOffsetPx === "number") ? this.outpostYOffsetPx : -10;
    const xOffNative = (typeof this.outpostXOffsetPx === "number") ? this.outpostXOffsetPx : -1;

    const variantCount = (this.farmVariants && this.farmVariants.length) || 0;
    if (variantCount === 0) return null;
    const img = this.farmVariants[variantIndex % variantCount];

    const iw = (img.naturalWidth || img.width || 0);
    const ih = (img.naturalHeight || img.height || 0);
    if (iw <= 0 || ih <= 0) return null;

    const outlined = this._getFarmOutlinedCanvas(rgb, variantIndex);

    const sw = outlined ? outlined.width : iw;
    const sh = outlined ? outlined.height : ih;

    const w = sw * this.mapScale;
    const h = sh * this.mapScale;

    const tileX = t.baseX;
    const tileY = t.baseY + t.dy - t.lift;

    const cx = tileX + t.width * 0.5;
    const cy = tileY + t.height * 0.5;

    let x = cx - w * 0.5 + (xOffNative * this.mapScale);
    let y = cy - h * 0.5 + (yOffNative * this.mapScale);

    if (outlined) {
      x -= this.mapScale;
      y -= this.mapScale;
    }

    // Correct 1 rendered pixel
    y -= this.mapScale;

    return { x, y, w, h, cx, cy, outlined, img };
  },

  _computeMercenaryCampDrawRect(centerKey, rgb, variantIndex = 0) {
    const t = this.tileByKey.get(centerKey);
    if (!t) return null;

    const yOffNative = (typeof this.outpostYOffsetPx === "number") ? this.outpostYOffsetPx : -10;
    const xOffNative = (typeof this.outpostXOffsetPx === "number") ? this.outpostXOffsetPx : -1;

    const variantCount = (this.mercenaryCampVariants && this.mercenaryCampVariants.length) || 0;
    if (variantCount === 0) return null;
    const img = this.mercenaryCampVariants[variantIndex % variantCount];
    if (!img) return null;

    const iw = (img.naturalWidth || img.width || 0);
    const ih = (img.naturalHeight || img.height || 0);
    if (iw <= 0 || ih <= 0) return null;

    const outlined = this._getMercenaryCampOutlinedCanvas(rgb, variantIndex);

    const sw = outlined ? outlined.width : iw;
    const sh = outlined ? outlined.height : ih;

    const w = sw * this.mapScale;
    const h = sh * this.mapScale;

    const tileX = t.baseX;
    const tileY = t.baseY + t.dy - t.lift;

    const cx = tileX + t.width * 0.5;
    const cy = tileY + t.height * 0.5;

    let x = cx - w * 0.5 + (xOffNative * this.mapScale);
    let y = cy - h * 0.5 + (yOffNative * this.mapScale);

    if (outlined) {
      x -= this.mapScale;
      y -= this.mapScale;
    }

    // Correct 1 rendered pixel
    y -= this.mapScale;

    return { x, y, w, h, cx, cy, outlined, img };
  },

  _getMercenaryCampOutlinedCanvas(rgb, variantIndex = 0) {
    if (!this.mercenaryCampReady || this.mercenaryCampVariants.length === 0) return null;
    const img = this.mercenaryCampVariants[variantIndex % this.mercenaryCampVariants.length];
    if (!img) return null;
    return this._getOutlinedSprite(img, rgb, `mercenary_camp:${variantIndex}`);
  },


  _computePortDrawRect(centerKey, rgb, variantIndex = 0) {
    const t = this.tileByKey.get(centerKey);
    if (!t) return null;

    if (!this.portReady) return null;

    const yOffNative = (typeof this.outpostYOffsetPx === "number") ? this.outpostYOffsetPx : -10;
    const xOffNative = (typeof this.outpostXOffsetPx === "number") ? this.outpostXOffsetPx : -1;

    const variantCount = (this.portVariants && this.portVariants.length) || 0;
    if (variantCount === 0) return null;
    const img = this.portVariants[variantIndex % variantCount];
    if (!img) return null;

    const iw = (img.naturalWidth || img.width || 0);
    const ih = (img.naturalHeight || img.height || 0);
    if (iw <= 0 || ih <= 0) return null;

    const outlined = this._getPortOutlinedCanvas(rgb, variantIndex);

    const sw = outlined ? outlined.width : iw;
    const sh = outlined ? outlined.height : ih;

    const w = sw * this.mapScale;
    const h = sh * this.mapScale;

    const tileX = t.baseX;
    const tileY = t.baseY + t.dy - t.lift;

    const cx = tileX + t.width * 0.5;
    const cy = tileY + t.height * 0.5;

    let x = cx - w * 0.5 + (xOffNative * this.mapScale);
    let y = cy - h * 0.5 + (yOffNative * this.mapScale);

    if (outlined) {
      x -= this.mapScale;
      y -= this.mapScale;
    }

    // Correct 1 rendered pixel
    y -= this.mapScale;

    return { x, y, w, h, cx, cy, outlined, img };
  },

  _computeCastleDrawRect(centerKey, rgb, variantIndex = 0) {
    const t = this.tileByKey.get(centerKey);
    if (!t) return null;

    if (!this.castleReady) return null;

    const yOffNative = (typeof this.outpostYOffsetPx === "number") ? this.outpostYOffsetPx : -10;
    const xOffNative = (typeof this.outpostXOffsetPx === "number") ? this.outpostXOffsetPx : -1;

    const variantCount = (this.castleVariants && this.castleVariants.length) || 0;
    if (variantCount === 0) return null;
    const img = this.castleVariants[variantIndex % variantCount];
    if (!img) return null;

    const iw = (img.naturalWidth || img.width || 0);
    const ih = (img.naturalHeight || img.height || 0);
    if (iw <= 0 || ih <= 0) return null;

    const outlined = this._getCastleOutlinedCanvas(rgb, variantIndex);

    const sw = outlined ? outlined.width : iw;
    const sh = outlined ? outlined.height : ih;

    const w = sw * this.mapScale;
    const h = sh * this.mapScale;

    const tileX = t.baseX;
    const tileY = t.baseY + t.dy - t.lift;

    const cx = tileX + t.width * 0.5;
    const cy = tileY + t.height * 0.5;

    let x = cx - w * 0.5 + (xOffNative * this.mapScale);
    let y = cy - h * 0.5 + (yOffNative * this.mapScale);

    if (outlined) {
      x -= this.mapScale;
      y -= this.mapScale;
    }

    // Correct 1 rendered pixel
    y -= this.mapScale;

    return { x, y, w, h, cx, cy, outlined, img };
  },

  _drawOutpostSprite(imgOrCanvas, x, y, w, h, glow, rgb, alpha = 1.0) {
    const doGlow = glow > 0.001;

    if (doGlow) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = false;
      ctx.shadowColor = rgbToCss(rgb, 0.85);
      ctx.shadowBlur = 24 * glow;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.drawImage(imgOrCanvas, x, y, w, h);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(imgOrCanvas, x, y, w, h);
      ctx.restore();
    }
  },

  drawOutpostAtCenter(centerKey, rgb, preview, tileGlow = 0, variantIndex = 0) {
    const rect = this._computeOutpostDrawRect(centerKey, rgb, variantIndex);
    if (!rect) return;

    const glow = (preview ? 0.3 : 0) + (tileGlow || 0);
    this._drawOutpostSprite(rect.outlined || rect.img, rect.x, rect.y, rect.w, rect.h, glow, rgb, preview ? 0.5 : 1.0);
  },

  drawFarmAtCenter(centerKey, rgb, isGhost, glow, variantIndex = 0) {
    const rect = this._computeFarmDrawRect(centerKey, rgb, variantIndex);
    if (!rect) return;

    const { x, y, w, h, outlined, img } = rect;
    // console.log(`Farm draw: ${centerKey} ${x},${y} ${w}x${h} ghost:${isGhost}`);

    if (isGhost) {
      if (outlined) {
        ctx.globalAlpha = 0.5;
        ctx.drawImage(outlined, x, y, w, h);
        ctx.globalAlpha = 1.0;
      } else {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.drawImage(img, x, y, w, h);
        ctx.restore();
      }
    } else {
      this._drawOutpostSprite(outlined || img, x, y, w, h, glow, rgb);
    }
  },

  drawFactoryAtCenter(centerKey, rgb, isGhost, glow, variantIndex = 0) {
    const rect = this._computeFactoryDrawRect(centerKey, rgb, variantIndex);
    if (!rect) return;

    const finalGlow = (isGhost ? 0.3 : 0) + (glow || 0);
    this._drawOutpostSprite(rect.outlined || rect.img, rect.x, rect.y, rect.w, rect.h, finalGlow, rgb, isGhost ? 0.5 : 1.0);
  },

  drawPortAtCenter(centerKey, rgb, isPreview = false, hoverAlpha = 0, variantIndex = 0) {
    const rect = this._computePortDrawRect(centerKey, rgb, variantIndex);
    if (!rect) return;

    ctx.save();
    if (isPreview) ctx.globalAlpha = 0.5;
    ctx.drawImage(rect.outlined || rect.img, rect.x, rect.y, rect.w, rect.h);
    if (hoverAlpha > 0.01) {
      ctx.globalAlpha = (isPreview ? 0.25 : 0.5) * hoverAlpha;
      ctx.globalCompositeOperation = "screen";
      ctx.drawImage(rect.outlined || rect.img, rect.x, rect.y, rect.w, rect.h);
    }
    ctx.restore();
  },

  drawCastleAtCenter(centerKey, rgb, isPreview = false, hoverAlpha = 0, variantIndex = 0) {
    const rect = this._computeCastleDrawRect(centerKey, rgb, variantIndex);
    if (!rect) return;

    ctx.save();
    if (isPreview) ctx.globalAlpha = 0.5;
    ctx.drawImage(rect.outlined || rect.img, rect.x, rect.y, rect.w, rect.h);
    if (hoverAlpha > 0.01) {
      ctx.globalAlpha = (isPreview ? 0.25 : 0.5) * hoverAlpha;
      ctx.globalCompositeOperation = "screen";
      ctx.drawImage(rect.outlined || rect.img, rect.x, rect.y, rect.w, rect.h);
    }
    ctx.restore();
  },

  _computeTradeTownDrawRect(centerKey, rgb, variantIndex = 0) {
    const t = this.tileByKey.get(centerKey);
    if (!t) return null;

    if (!this.tradeTownReady) return null;

    const yOffNative = (typeof this.outpostYOffsetPx === "number") ? this.outpostYOffsetPx : -10;
    const xOffNative = (typeof this.outpostXOffsetPx === "number") ? this.outpostXOffsetPx : -1;

    const variantCount = (this.tradeTownVariants && this.tradeTownVariants.length) || 0;
    if (variantCount === 0) return null;
    const img = this.tradeTownVariants[variantIndex % variantCount];
    if (!img) return null;

    const iw = (img.naturalWidth || img.width || 0);
    const ih = (img.naturalHeight || img.height || 0);
    if (iw <= 0 || ih <= 0) return null;

    const outlined = this._getTradeTownOutlinedCanvas(rgb, variantIndex);

    const sw = outlined ? outlined.width : iw;
    const sh = outlined ? outlined.height : ih;

    const w = sw * this.mapScale;
    const h = sh * this.mapScale;

    const tileX = t.baseX;
    const tileY = t.baseY + t.dy - t.lift;

    const cx = tileX + t.width * 0.5;
    const cy = tileY + t.height * 0.5;

    let x = cx - w * 0.5 + (xOffNative * this.mapScale);
    let y = cy - h * 0.5 + (yOffNative * this.mapScale);

    if (outlined) {
      x -= this.mapScale;
      y -= this.mapScale;
    }

    // Correct 1 rendered pixel
    y -= this.mapScale;

    return { x, y, w, h, cx, cy, outlined, img };
  },

  drawTradeTownAtCenter(centerKey, rgb, isPreview = false, hoverAlpha = 0, variantIndex = 0) {
    const rect = this._computeTradeTownDrawRect(centerKey, rgb, variantIndex);
    if (!rect) return;

    ctx.save();
    if (isPreview) ctx.globalAlpha = 0.5;
    ctx.drawImage(rect.outlined || rect.img, rect.x, rect.y, rect.w, rect.h);
    if (hoverAlpha > 0.01) {
      ctx.globalAlpha = (isPreview ? 0.25 : 0.5) * hoverAlpha;
      ctx.globalCompositeOperation = "screen";
      ctx.drawImage(rect.outlined || rect.img, rect.x, rect.y, rect.w, rect.h);
    }
    ctx.restore();
  },

  _getColonGlyphImage() {
    const icon = this.iconCache.getIcon("colon");
    if (!icon) {
      if (typeof this.iconCache.loadIcon === "function") this.iconCache.loadIcon("colon");
      return null;
    }
    return icon;
  },

  _drawTradeTownOverlay(structure, rgb) {
    const variantIndex = structure.variantIndex || 0;
    const rect = this._computeTradeTownDrawRect(structure.centerKey, rgb, variantIndex);
    if (!rect) return;

    const tradeResource = structure.tradeResource;
    const tradeRatio = structure.tradeRatio;
    if (!tradeResource || !tradeRatio) return;

    // Prepare parts for the overlay row: [ratio digit(s)] [colon] [resource icon]
    const resourceScale = (typeof this.outpostResourceIconScale === "number") ? this.outpostResourceIconScale : 1.0;
    const sRes = Math.max(1, Math.round(this.mapScale * resourceScale));

    const parts = [];
    let totalW = 0;
    let maxH = 0;

    // Ratio digit(s)
    const ratioStr = String(tradeRatio);
    for (let i = 0; i < ratioStr.length; i++) {
      const d = ratioStr.charCodeAt(i) - 48;
      if (d >= 0 && d <= 9) {
        const dc = this._getWhiteDigitCanvas(d) || this.iconCache.getIcon(d);
        if (!dc) { this.iconCache.loadIcon(d); continue; }
        const od = this._getOutlinedSprite(dc, rgb, `tradeRatio:${d}`);
        if (od) {
          const dw = od.width * sRes;
          const dh = od.height * sRes;
          parts.push({ img: od, w: dw, h: dh, marginLeft: 0 });
          totalW += dw;
          maxH = Math.max(maxH, dh);
        }
      }
    }

    // Colon glyph — tight against neighbors
    const colonImg = this._getColonGlyphImage();
    if (colonImg) {
      const outlinedColon = this._getOutlinedSprite(colonImg, rgb, "glyph:colon");
      if (outlinedColon) {
        const cw = outlinedColon.width * sRes;
        const ch = outlinedColon.height * sRes;
        const gap = Math.round(-10 * this.mapScale);
        parts.push({ img: outlinedColon, w: cw, h: ch, marginLeft: gap });
        totalW += gap + cw;
        maxH = Math.max(maxH, ch);
      }
    }

    // Resource icon — tight against colon
    const resImg = this.resourceIconCache.getIcon(tradeResource);
    if (!resImg) {
      this.resourceIconCache.loadIcon(tradeResource);
    } else {
      const outlinedRes = this._getOutlinedSprite(resImg, rgb, `res:${tradeResource}`);
      if (outlinedRes) {
        const rw = outlinedRes.width * sRes;
        const rh = outlinedRes.height * sRes;
        const gap = Math.round(-3 * this.mapScale);
        parts.push({ img: outlinedRes, w: rw, h: rh, marginLeft: gap });
        totalW += gap + rw;
        maxH = Math.max(maxH, rh);
      }
    }

    if (parts.length === 0) return;

    // Draw bubble — narrow padding (outlines already provide border)
    const bubblePaddingX = Math.round(1 * this.mapScale);
    const bubblePaddingY = Math.round(0 * this.mapScale);
    const bubbleBottomMargin = Math.round(3 * this.mapScale);

    const bubbleW = totalW + (bubblePaddingX * 2);
    const bubbleH = maxH + (bubblePaddingY * 2);

    const bubbleX = Math.round(rect.cx - (bubbleW * 0.5));
    const bubbleY = Math.round(rect.y - bubbleH - bubbleBottomMargin);

    const bx = bubbleX, by = bubbleY, bw = bubbleW, bh = bubbleH;
    const isHovered = this.mouseWorld &&
      this.mouseWorld.x >= bx && this.mouseWorld.x <= bx + bw &&
      this.mouseWorld.y >= by && this.mouseWorld.y <= by + bh;

    ctx.save();
    if (isHovered) {
      ctx.globalAlpha = 0.25;
    }

    ctx.fillStyle = "rgba(11, 16, 32, 0.70)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = Math.max(1, 1 * this.mapScale);

    const radius = Math.round(4 * this.mapScale);
    ctx.beginPath();
    ctx.moveTo(bx + radius, by);
    ctx.lineTo(bx + bw - radius, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius);
    ctx.lineTo(bx + bw, by + bh - radius);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - radius, by + bh);
    ctx.lineTo(bx + radius, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - radius);
    ctx.lineTo(bx, by + radius);
    ctx.quadraticCurveTo(bx, by, bx + radius, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw parts centered within the bubble
    let currentX = Math.round(bubbleX + (bubbleW - totalW) * 0.5);
    for (const p of parts) {
      if (!p.img) continue;
      currentX += (p.marginLeft || 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(p.img, currentX, bubbleY + Math.round((bubbleH - p.h) * 0.5), p.w, p.h);
      currentX += p.w;
    }

    ctx.restore();
  },

  drawMercenaryCampAtCenter(centerKey, rgb, isPreview = false, hoverAlpha = 0, variantIndex = 0) {
    const rect = this._computeMercenaryCampDrawRect(centerKey, rgb, variantIndex);
    if (!rect) return;

    ctx.save();
    if (isPreview) ctx.globalAlpha = 0.5;
    ctx.drawImage(rect.outlined || rect.img, rect.x, rect.y, rect.w, rect.h);
    if (hoverAlpha > 0.01) {
      ctx.globalAlpha = (isPreview ? 0.25 : 0.5) * hoverAlpha;
      ctx.globalCompositeOperation = "screen";
      ctx.drawImage(rect.outlined || rect.img, rect.x, rect.y, rect.w, rect.h);
    }
    ctx.restore();
  },

  _drawRoadSprite(img, x, y, w, h, glow, rgb, alpha = 1.0) {
    if (glow > 0.001) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = false;
      ctx.shadowColor = rgbToCss(rgb, 0.85);
      ctx.shadowBlur = 24 * glow;
      ctx.drawImage(img, x, y, w, h);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, x, y, w, h);
      ctx.restore();
    }
  },

  drawRoadStartPreview(ctx, key, rgb) {
    const t = this.tileByKey.get(key);
    if (!t) return;

    if (!this.roadStartImg.complete || this.roadStartImg.naturalWidth === 0) return;

    const iw = this.roadStartImg.naturalWidth;
    const ih = this.roadStartImg.naturalHeight;
    const outlined = this._getOutlinedSprite(this.roadStartImg, rgb || [255, 255, 255], "roadStart");

    const sw = outlined ? outlined.width : iw;
    const sh = outlined ? outlined.height : ih;
    const w = sw * this.mapScale;
    const h = sh * this.mapScale;

    const tileX = t.baseX;
    const tileY = t.baseY + t.dy - t.lift;
    const cx = tileX + t.width * 0.5;
    const cy = tileY + t.height * 0.5;

    // Correct for the outline expansion
    let x = cx - w * 0.5;
    let y = cy - h * 0.5;
    if (outlined) {
      x -= this.mapScale;
      y -= this.mapScale;
    }

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(outlined || this.roadStartImg, x, y, w, h);
    ctx.restore();
  },

  drawRoadAtCenter(ctx, centerKey, direction, rgb, preview, tileGlow = 0) {
    if (!this.roadAssetsReady) return;

    let img;
    if (direction === "h") img = this.roadHImg;
    else if (direction === "dl") img = this.roadTLBRImg;
    else img = this.roadBLTRImg;

    if (!img) return;

    const t = this.tileByKey.get(centerKey);
    if (!t) return;

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (iw <= 0 || ih <= 0) return;

    const playerRgb = rgb || [255, 255, 255];
    const outlined = this._getOutlinedSprite(img, playerRgb, `road:${direction}`);

    const sw = outlined ? outlined.width : iw;
    const sh = outlined ? outlined.height : ih;

    const w = sw * this.mapScale;
    const h = sh * this.mapScale;

    // Center on the middle tile
    const tileX = t.baseX;
    const tileY = t.baseY + t.dy - t.lift;
    const cx = tileX + t.width * 0.5;
    const cy = tileY + t.height * 0.5;

    let x = cx - w * 0.5;
    let y = cy - h * 0.5;

    if (outlined) {
      x -= this.mapScale;
      y -= this.mapScale;
    }

    const glow = (preview ? 0.3 : 0) + (tileGlow || 0);
    this._drawRoadSprite(outlined || img, x, y, w, h, glow, playerRgb, preview ? 0.5 : 1.0);
  },
  _finalizePlaceBanditTent(centerKey, playerRgb) {
    const s = {
      type: "bandit_tent",
      centerKey: centerKey,
      keys: [centerKey],
      playerRgb: [playerRgb[0], playerRgb[1], playerRgb[2]]
    };

    console.log(`[Placement] Finalized bandit tent at ${centerKey}.`);

    this.structures.push(s);
    this.structureByCenter.set(centerKey, s);
    this.structureTileToCenter.set(centerKey, centerKey);
    this._updateSpatialIndex(s); // Maintain spatial index

    this.recomputeAllSettlementResources();
    if (typeof this.updateMinimapStructures === "function") this.updateMinimapStructures();
  },

  drawWallAtCenter(ctx, centerKey, direction, rgb, preview, tileGlow = 0) {
    if (!this.wallAssetsReady) return;

    let img;
    if (direction === "h") img = this.wallHImg;
    else if (direction === "dl") img = this.wallTLBRImg;
    else img = this.wallBLTRImg;

    if (!img) return;

    const t = this.tileByKey.get(centerKey);
    if (!t) return;

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (iw <= 0 || ih <= 0) return;

    const playerRgb = rgb || [255, 255, 255];
    const outlined = this._getOutlinedSprite(img, playerRgb, `wall:${direction}`);

    const sw = outlined ? outlined.width : iw;
    const sh = outlined ? outlined.height : ih;

    const w = sw * this.mapScale;
    const h = sh * this.mapScale;

    const tileX = t.baseX;
    const tileY = t.baseY + t.dy - t.lift;
    const cx = tileX + t.width * 0.5;
    const cy = tileY + t.height * 0.5;

    let x = cx - w * 0.5;
    let y = cy - h * 0.5;

    if (outlined) {
      x -= this.mapScale;
      y -= this.mapScale;
    }

    const glow = (preview ? 0.3 : 0) + (tileGlow || 0);
    this._drawRoadSprite(outlined || img, x, y, w, h, glow, playerRgb, preview ? 0.5 : 1.0);
  },

  // ----------------------------
  // Ruin placement and claiming
  // ----------------------------

  _isRuinPlacementValid(centerKeyOrTile) {
    if (!centerKeyOrTile) return false;
    const centerKey = (typeof centerKeyOrTile === "object" && centerKeyOrTile !== null) ? centerKeyOrTile.key : centerKeyOrTile;
    const keys = this._getOutpostKeys(centerKeyOrTile);
    if (keys.length !== 7) return false;

    for (const k of keys) {
      if (this._isWaterTile(k)) return false;
      if (this.structureTileToCenter.has(k)) return false;
    }

    // Ruins must be 4+ tiles away from each other and from settlements/bandit_hq
    const nearby = this._getNearbyStructures(centerKeyOrTile, 4);
    for (const s of nearby) {
      if (!s || !s.centerKey) continue;
      if (s.type === "outpost" || s.type === "farm" || s.type === "bandit_hq" || s.type === "ruin") {
        const dist = this._hexDistance(centerKeyOrTile, s.centerKey);
        if (dist <= 4) return false;
      }
    }
    return true;
  },

  _finalizePlaceRuin(centerKey, keys, variantIndex) {
    const s = {
      type: "ruin",
      centerKey: centerKey,
      keys: keys.slice(),
      variantIndex: variantIndex,
      claimed: false,
      claimedByRgb: null
    };

    console.log(`[Placement] Finalized ruin at ${centerKey}. Variant: ${variantIndex}`);

    this.structures.push(s);
    this.structureByCenter.set(centerKey, s);
    for (const k of keys) {
      this.structureTileToCenter.set(k, centerKey);
    }
    this._updateSpatialIndex(s); // Maintain spatial index
    if (typeof this.updateMinimapStructures === "function") this.updateMinimapStructures();
  },

  _isSunkenShipPlacementValid(centerKeyOrTile) {
    const t = (typeof centerKeyOrTile === "object" && centerKeyOrTile !== null) ? centerKeyOrTile : this.tileByKey.get(centerKeyOrTile);
    if (!t) return false;

    // Center must be water
    if (!t.isWater) return false;

    // Check all 7 tiles of the footprint for deep water
    const rc = this._parseKey(t.key);
    if (!rc) return false;
    const r = rc.r, c = rc.c, odd = (r % 2) === 1;
    const targets = [
      { r, c },
      { r, c: c + 1 },
      { r, c: c - 1 },
      { r: r - 1, c: c + (odd ? 1 : 0) },
      { r: r - 1, c: c + (odd ? 0 : -1) },
      { r: r + 1, c: c + (odd ? 1 : 0) },
      { r: r + 1, c: c + (odd ? 0 : -1) }
    ];

    for (const p of targets) {
      if (!this.inBounds(p.r, p.c)) return false;
      const tk = this.keyOf(p.r, p.c);
      if (this.structureTileToCenter.has(tk)) return false;
      const tile = this.tileByKey.get(tk);
      // "Deep water" check: t.name should be "Deep Water" or similar. 
      // Checking t.name.toLowerCase().includes("deep") or similar.
      if (!tile || !tile.isWater || !tile.name.toLowerCase().includes("deep")) return false;
    }

    // Check distance from other major structures
    const nearby = this._getNearbyStructures(t.key, 4);
    for (const s of nearby) {
      if (s.type === "outpost" || s.type === "farm" || s.type === "bandit_hq" || s.type === "ruin" || s.type === "sunken_ship") {
        return false;
      }
    }

    return true;
  },

  _finalizePlaceSunkenShip(centerKey, keys, variantIndex) {
    const s = {
      type: "sunken_ship",
      centerKey: centerKey,
      keys: keys.slice(),
      variantIndex: variantIndex
    };

    console.log(`[Placement] Finalized sunken ship at ${centerKey}. Variant: ${variantIndex}`);

    this.structures.push(s);
    this.structureByCenter.set(centerKey, s);
    for (const k of keys) {
      this.structureTileToCenter.set(k, centerKey);
    }
    this._updateSpatialIndex(s); // Maintain spatial index
    if (typeof this.updateMinimapStructures === "function") this.updateMinimapStructures();
  },

  _spawnSunkenShips(ruinCount) {
    const start = performance.now();

    // Remove existing sunken ships
    const toRemove = this.structures.filter(s => s.type === "sunken_ship");
    for (const s of toRemove) {
      const idx = this.structures.indexOf(s);
      if (idx !== -1) this.structures.splice(idx, 1);
      this.structureByCenter.delete(s.centerKey);
      this._updateSpatialIndex(s, true);
      if (s.keys) {
        for (const k of s.keys) {
          this.structureTileToCenter.delete(k);
        }
      }
    }

    const count = Math.floor(ruinCount / 2);
    if (count <= 0) {
      console.log(`[Map] No sunken ships to spawn (ruinCount: ${ruinCount}).`);
      return;
    }
    console.log(`[Map] Spawning ${count} sunken ships...`);

    // Use water tiles
    const water = this.tiles.filter(t => t.isWater);
    const waterLen = water.length;
    if (waterLen === 0) return;

    let placed = 0;
    let attempts = 0;
    const maxAttempts = Math.min(waterLen, count * 200);

    while (placed < count && attempts < maxAttempts) {
      const t = water[Math.floor(Math.random() * waterLen)];
      attempts++;

      if (this.structureTileToCenter.has(t.key)) continue;
      if (!this._isSunkenShipPlacementValid(t)) continue;

      const keys = this._getOutpostKeys(t);
      if (keys.length !== 7) continue;

      const variantIndex = Math.floor(Math.random() * (this.sunkenShipVariants.length || 6));
      this._finalizePlaceSunkenShip(t.key, keys, variantIndex);
      placed++;
    }

    const end = performance.now();
    console.log(`[Map] Placed ${placed} sunken ships in ${(end - start).toFixed(2)}ms.`);
  },

  _spawnRuins() {
    const start = performance.now();
    // Remove existing ruins
    const toRemove = this.structures.filter(s => s.type === "ruin");
    for (const s of toRemove) {
      const idx = this.structures.indexOf(s);
      if (idx !== -1) this.structures.splice(idx, 1);
      this.structureByCenter.delete(s.centerKey);
      this._updateSpatialIndex(s, true);
      for (const k of s.keys) {
        this.structureTileToCenter.delete(k);
      }
    }

    const mapTilesW = (this.map && this.map.cols) || 1;
    const mapTilesH = (this.map && this.map.rows) || 1;
    const ruinCount = Math.max(1, Math.floor(this.players.length * (Math.sqrt(mapTilesW * mapTilesH) / 50)));
    console.log(`[Map] Spawning ${ruinCount} ruins for ${this.players.length} players (map ${mapTilesW}x${mapTilesH})...`);

    // Build cached land-tiles list (non-water tiles) once
    if (!this._landTiles || this._landTiles.length === 0) {
      this._landTiles = this.tiles.filter(t => !t.isWater);
    }
    const land = this._landTiles;
    const landLen = land.length;
    if (landLen === 0) return;

    // Random sampling: pick random land tiles and test validity.
    // Much faster than scanning ALL tiles when we only need a handful of ruins.
    let placed = 0;
    let attempts = 0;
    const maxAttempts = Math.min(landLen, ruinCount * 200); // Safety cap

    while (placed < ruinCount && attempts < maxAttempts) {
      const t = land[Math.floor(Math.random() * landLen)];
      attempts++;

      // Quick rejection: is the center tile already occupied?
      if (this.structureTileToCenter.has(t.key)) continue;

      if (!this._isRuinPlacementValid(t)) continue;

      const keys = this._getOutpostKeys(t);
      if (keys.length !== 7) continue;

      const variantIndex = Math.floor(Math.random() * 9);
      this._finalizePlaceRuin(t.key, keys, variantIndex);
      placed++;
    }

    const end = performance.now();
    console.log(`[Map] Placed ${placed} of ${ruinCount} ruins in ${(end - start).toFixed(2)}ms (${attempts} attempts).`);

    // Also spawn sunken ships
    this._spawnSunkenShips(placed);

    if (typeof this.updateMinimapStructures === "function") this.updateMinimapStructures();
  },

  _spawnBandits() {
    const start = performance.now();
    // 1. Remove existing bandit HQ and tents
    const toRemove = this.structures.filter(s => s.type === "bandit_hq" || s.type === "bandit_tent");
    for (const s of toRemove) {
      const idx = this.structures.indexOf(s);
      if (idx !== -1) this.structures.splice(idx, 1);
      this.structureByCenter.delete(s.centerKey);
      this._updateSpatialIndex(s, true);
      if (s.keys) {
        for (const k of s.keys) this.structureTileToCenter.delete(k);
      }
    }

    // 2. Find Tile 7 (cache it since it never changes)
    if (!this._tile7) {
      for (const t of this.tiles) {
        if (t.number === 7) { this._tile7 = t; break; }
      }
    }
    const hqTile = this._tile7;

    if (!hqTile) {
      console.warn("[Map] Could not find tile 7 for Bandit HQ spawning.");
      return;
    }

    console.log(`[Map] Spawning Bandit HQ at ${hqTile.key}.`);
    const hqKeys = this._getOutpostKeys(hqTile);
    const banditHq = {
      type: "bandit_hq",
      centerKey: hqTile.key,
      keys: hqKeys
    };
    this.structures.push(banditHq);
    this.structureByCenter.set(hqTile.key, banditHq);
    this._updateSpatialIndex(banditHq);
    for (const k of hqKeys) {
      this.structureTileToCenter.set(k, hqTile.key);
    }

    // 3. Place Bandit Tents (half of players, rounded down)
    const tentCount = Math.floor(this.players.length / 2);
    console.log(`[Map] Placing bandit tents for ${tentCount} (half of ${this.players.length} players)...`);

    // Cache sand/dune tiles (terrain never changes after map load)
    if (!this._sandTiles || this._sandTiles.length === 0) {
      this._sandTiles = this.tiles.filter(t => {
        const name = t.name.toLowerCase();
        return name.includes("sand") || name.includes("dune");
      });
      // Pre-sort by distance to HQ once (terrain doesn't move)
      this._sandTiles.sort((a, b) => this._hexDistance(hqTile, a) - this._hexDistance(hqTile, b));
    }

    // Find unoccupied sand tiles from the pre-sorted list (closest first)
    const pool = [];
    for (const t of this._sandTiles) {
      if (pool.length >= 20) break; // only need a small pool
      if (!this.structureTileToCenter.has(t.key)) pool.push(t);
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    // Pick the calculated count (up to available pool tiles)
    const count = Math.min(tentCount, pool.length);
    for (let i = 0; i < count; i++) {
      const t = pool[i];
      // Use player colors (index-matched) for variety, but they are all "bandits" (red outline)
      const p = this.players[i % this.players.length];
      console.log(`[Map] Placing bandit tent for ${p.name}'s bandits at ${t.key} (${t.name})`);
      this._finalizePlaceBanditTent(t.key, p.rgb);
    }

    // Recompute all settlement resources to ensure UI bubbles are accurate
    if (typeof this.recomputeAllSettlementResources === "function") {
      this.recomputeAllSettlementResources();
    }
    const end = performance.now();
    console.log(`[Map] Placed bandit tents in ${(end - start).toFixed(2)}ms.`);
    if (typeof this.updateMinimapStructures === "function") this.updateMinimapStructures();
  },

  _checkRuinClaims(placedKeys, playerRgb) {
    // Check if any of the placed tiles' neighbors touch an unclaimed ruin or sunken ship
    const checked = new Set();
    const curPlayerS = this.structures.find(s => s.playerRgb && JSON.stringify(s.playerRgb) === JSON.stringify(playerRgb) && placedKeys.includes(s.centerKey));
    const isBoatPlacement = curPlayerS && curPlayerS.type === "ship";
    const isRoadPlacement = curPlayerS && curPlayerS.type === "road";

    for (const k of placedKeys) {
      const rc = this._parseKey(k);
      if (!rc) continue;
      const neighbors = this.neighborsOf(rc.r, rc.c);
      for (const n of neighbors) {
        const nk = this.keyOf(n.r, n.c);
        const center = this.structureTileToCenter.get(nk);
        if (!center || checked.has(center)) continue;
        checked.add(center);

        const s = this.structureByCenter.get(center);
        if (!s) continue;

        if (s.type === "ruin" && !s.claimed) {
          // RULE: Only roads can claim ruins
          if (!isRoadPlacement) {
            console.log(`[Ruin] Discovery blocked: not a road placement.`);
            continue;
          }

          // BUG FIX: Check if this ruin is within another player's castle exclusion zone
          // If it is, the current player cannot claim it.
          // Using radius 10 to ensure we find any nearby castles.
          const nearbyCastles = this._getNearbyStructures(center, 10);
          let inOtherCastleZone = false;
          const curPlayerKey = JSON.stringify(playerRgb);

          for (const ns of nearbyCastles) {
            if (ns.type === "castle") {
              const castleOwnerKey = JSON.stringify(ns.playerRgb);
              if (castleOwnerKey !== curPlayerKey) {
                const d = this._hexDistance(center, ns.centerKey);
                // Territory matches the castle exclusion zone (distance 8)
                if (d <= 8) {
                  inOtherCastleZone = true;
                  break;
                }
              }
            }
          }

          if (inOtherCastleZone) {
            console.log(`[Ruin] Claim blocked: Ruin at ${center} is within another player's castle territory.`);
            continue;
          }

          // Regular ruin claim
          s.claimed = true;
          s.claimedByRgb = [playerRgb[0], playerRgb[1], playerRgb[2]];

          if (this._spriteOutlineCache) {
            for (const key of this._spriteOutlineCache.keys()) {
              if (key.startsWith(`ruin:`)) this._spriteOutlineCache.delete(key);
            }
          }

          const playerKey = JSON.stringify(playerRgb);
          for (const p of this.players) {
            if (JSON.stringify(p.rgb) === playerKey) {
              p.victoryPoints = (p.victoryPoints || 0) + 1;
              console.log(`[Ruin] ${p.name} claimed ruin at ${center}. VP: ${p.victoryPoints}`);
              break;
            }
          }

          const playerName = this.players.find(p => JSON.stringify(p.rgb) === playerKey)?.name || "Player";
          const { popupRewards } = this._getRuinRewards(center);
          showRuinClaimedPrompt(playerName, playerRgb, popupRewards, () => {
            this.updateGameUi();
          });
          return;
        }

        if (s.type === "sunken_ship") {
          // Sunken ships MUST be discovered by boats
          if (!isBoatPlacement) {
            console.log(`[SunkenShip] Discovery blocked: not a boat placement/movement.`);
            continue;
          }

          // Found sunken treasure!
          console.log(`[SunkenShip] Discovered at ${center}!`);

          const playerKey = JSON.stringify(playerRgb);
          const p = this.players.find(p => JSON.stringify(p.rgb) === playerKey);
          const playerName = p ? p.name : "Player";

          // Rewards: 3 timber, 1 spices
          const timberCount = 3;
          const spicesCount = 1;

          // Manually award resources if we don't have a helper for it
          // Actually, let's look at how rewards are handled in the prompt
          // RuinClaimedPrompt takes a list of rewards.
          const rewards = [
            { iconSrc: "./Tile_icons/resources/timber.png", label: "Timber", amount: `+${timberCount}` },
            { iconSrc: "./Tile_icons/resources/spices.png", label: "Spices", amount: `+${spicesCount}` },
            { iconEmoji: "⭐", label: "Victory Point", amount: "+1" }
          ];

          // We need a specific prompt for sunken ships if we want different text, 
          // but reuse showRuinClaimedPrompt for now with custom title in turnEvents.js later
          showRuinClaimedPrompt(playerName, playerRgb, rewards, () => {
            this.updateGameUi();
          });

          // Update player resources (assuming they are in p.resources)
          if (p) {
            if (p.resources) {
              p.resources.timber = (p.resources.timber || 0) + timberCount;
              p.resources.spices = (p.resources.spices || 0) + spicesCount;
            }
            p.victoryPoints = (p.victoryPoints || 0) + 1;
            console.log(`[SunkenShip] ${playerName} awarded 1 VP. Total: ${p.victoryPoints}`);
          }

          // DESTROY the sunken ship
          const idx = this.structures.indexOf(s);
          if (idx !== -1) this.structures.splice(idx, 1);
          this.structureByCenter.delete(s.centerKey);
          this._updateSpatialIndex(s, true);
          for (const sk of s.keys) {
            this.structureTileToCenter.delete(sk);
          }

          if (typeof this.updateMinimapStructures === "function") this.updateMinimapStructures();
          return;
        }
      }
    }
  },

  drawBanditHqAtCenter(centerKey, tileGlow = 0) {
    if (!this.banditHqReady) return;

    const t = this.tileByKey.get(centerKey);
    if (!t) return;

    const img = this.banditHqImg;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (iw <= 0 || ih <= 0) return;

    const playerRgb = [255, 0, 0]; // Red for bandits
    const outlined = this._getOutlinedSprite(img, playerRgb, "bandit_hq");

    const sw = outlined ? outlined.width : iw;
    const sh = outlined ? outlined.height : ih;

    const s = this.mapScale;
    const w = sw * s;
    const h = sh * s;

    const tileX = t.baseX;
    const tileY = t.baseY + t.dy - t.lift;
    const cx = tileX + t.width * 0.5;
    const cy = tileY + t.height * 0.5;

    // Center on tile
    let x = cx - w * 0.5;
    let y = cy - h * 0.6;

    if (outlined) {
      x -= s;
      y -= s;
    }

    if (tileGlow > 0.001) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.shadowColor = "rgba(255, 0, 0, 0.5)"; // Ominous red glow for bandits
      ctx.shadowBlur = 20 * tileGlow;
      ctx.drawImage(outlined || img, x, y, w, h);
      ctx.restore();
    } else {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(outlined || img, x, y, w, h);
      ctx.restore();
    }
  },

  drawBanditTentAtCenter(centerKey, preview, tileGlow = 0) {
    if (!this.banditTentReady) return;

    const t = this.tileByKey.get(centerKey);
    if (!t) return;

    const img = this.banditTentImg;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (iw <= 0 || ih <= 0) return;

    const playerRgb = [255, 0, 0]; // Red for bandits
    const outlined = this._getOutlinedSprite(img, playerRgb, "bandit_tent");

    const sw = outlined ? outlined.width : iw;
    const sh = outlined ? outlined.height : ih;

    const s = this.mapScale;
    const w = sw * s;
    const h = sh * s;

    const tileX = t.baseX;
    const tileY = t.baseY + t.dy - t.lift;
    const cx = tileX + t.width * 0.5;
    const cy = tileY + t.height * 0.5;

    // Center on tile
    let x = cx - w * 0.5 + s;
    let y = cy - h * 0.6; // Slightly higher

    if (outlined) {
      x -= s;
      y -= s;
    }

    const glow = (preview ? 0.3 : 0) + (tileGlow || 0);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (preview) ctx.globalAlpha = 0.5;

    if (glow > 0.001) {
      ctx.shadowColor = "rgba(255, 0, 0, 0.7)"; // Red glow for bandits
      ctx.shadowBlur = 20 * glow;
      ctx.drawImage(outlined || img, x, y, w, h);
    } else {
      ctx.drawImage(outlined || img, x, y, w, h);
    }
    ctx.restore();
  },

  // ----------------------------
  // Ship sprite drawing
  // ----------------------------

  drawShipAtCenter(centerKey, rgb, isGhost, glow, variantIndex = 0, facingLeft = false) {
    if (!this.shipReady || this.shipVariants.length === 0) return;

    const t = this.tileByKey.get(centerKey);
    if (!t) return;

    const img = this.shipVariants[variantIndex % this.shipVariants.length];
    if (!img) return;

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (iw <= 0 || ih <= 0) return;

    const outlined = this._getOutlinedSprite(img, rgb, `ship:${variantIndex}`);

    const sw = outlined ? outlined.width : iw;
    const sh = outlined ? outlined.height : ih;

    const s = this.mapScale;
    const w = sw * s;
    const h = sh * s;

    const yOffNative = (typeof this.outpostYOffsetPx === "number") ? this.outpostYOffsetPx : -10;
    const xOffNative = (typeof this.outpostXOffsetPx === "number") ? this.outpostXOffsetPx : -1;

    const tileX = t.baseX;
    const tileY = t.baseY + t.dy - t.lift;
    const cx = tileX + t.width * 0.5;
    const cy = tileY + t.height * 0.5;

    let x = cx - w * 0.5 + (xOffNative * s);
    let y = cy - h * 0.5 + (yOffNative * s);

    if (outlined) {
      x -= s;
      y -= s;
    }

    // Correct 1 rendered pixel
    y -= s;

    const drawImg = outlined || img;
    const finalGlow = (isGhost ? 0.3 : 0) + (glow || 0);

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if (isGhost) {
      ctx.globalAlpha = 0.5;
    }

    if (finalGlow > 0.001) {
      ctx.shadowColor = `rgba(${rgb[0]},${rgb[1]},${rgb[2]}, 0.85)`;
      ctx.shadowBlur = 24 * finalGlow;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    if (facingLeft) {
      // Flip horizontally: translate to center, scale -1 on x, draw offset
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(drawImg, 0, 0, w, h);
    } else {
      ctx.drawImage(drawImg, x, y, w, h);
    }

    ctx.restore();
  },

  // ----------------------------
  // Ruin sprite drawing
  // ----------------------------

  _getRuinOutlinedCanvas(rgb, variantIndex = 0) {
    if (!this.ruinReady || this.ruinVariants.length === 0) return null;
    const img = this.ruinVariants[variantIndex % this.ruinVariants.length];
    if (!img) return null;
    return this._getOutlinedSprite(img, rgb, `ruin:${variantIndex}`);
  },

  drawRuinAtCenter(centerKey, tileGlow = 0, structure) {
    if (!this.ruinReady) return;

    const t = this.tileByKey.get(centerKey);
    if (!t) return;

    const variantIndex = structure ? (structure.variantIndex || 0) : 0;
    const rgb = (structure && structure.claimed && structure.claimedByRgb)
      ? structure.claimedByRgb
      : [0xff, 0xd5, 0x41]; // Gold outline when unclaimed

    const img = this.ruinVariants[variantIndex % this.ruinVariants.length];
    if (!img) return;

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (iw <= 0 || ih <= 0) return;

    const outlined = this._getOutlinedSprite(img, rgb, `ruin:${variantIndex}|${rgb[0]},${rgb[1]},${rgb[2]}`);

    const sw = outlined ? outlined.width : iw;
    const sh = outlined ? outlined.height : ih;

    const s = this.mapScale;
    const w = sw * s;
    const h = sh * s;

    const tileX = t.baseX;
    const tileY = t.baseY + t.dy - t.lift;
    const cx = tileX + t.width * 0.5;
    const cy = tileY + t.height * 0.5;

    let x = cx - w * 0.5;
    let y = cy - h * 0.6;

    if (outlined) {
      x -= s;
      y -= s;
    }

    if (tileGlow > 0.001) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.shadowColor = structure && structure.claimed
        ? rgbToCss(rgb, 0.5)
        : "rgba(255, 213, 65, 0.4)"; // Gold shadow for unclaimed ruins
      ctx.shadowBlur = 20 * tileGlow;
      ctx.drawImage(outlined || img, x, y, w, h);
      ctx.restore();
    } else {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(outlined || img, x, y, w, h);
      ctx.restore();
    }
  },

  drawSunkenShipAtCenter(centerKey, tileGlow = 0, structure) {
    if (!this.sunkenShipReady) return;

    const t = this.tileByKey.get(centerKey);
    if (!t) return;

    const variantIndex = structure ? (structure.variantIndex || 0) : 0;
    const rgb = [0xff, 0xd5, 0x41]; // Gold outline for sunken ships

    const img = this.sunkenShipVariants[variantIndex % this.sunkenShipVariants.length];
    if (!img) return;

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (iw <= 0 || ih <= 0) return;

    // Sunken ships are always unclaimed type (they disappear when claimed)
    const outlined = this._getOutlinedSprite(img, rgb, `sunken_ship:${variantIndex}|${rgb[0]},${rgb[1]},${rgb[2]}`);

    const sw = outlined ? outlined.width : iw;
    const sh = outlined ? outlined.height : ih;

    const s = this.mapScale;
    const w = sw * s;
    const h = sh * s;

    const tileX = t.baseX;
    const tileY = t.baseY + t.dy - t.lift;
    const cx = tileX + t.width * 0.5;
    const cy = tileY + t.height * 0.5;

    const drawImg = outlined || img;
    const finalGlow = tileGlow || 0;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if (finalGlow > 0.001) {
      ctx.shadowColor = `rgba(${rgb[0]},${rgb[1]},${rgb[2]}, 0.85)`;
      ctx.shadowBlur = 24 * finalGlow;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    // Offset slightly upwards like ruins
    ctx.drawImage(drawImg, cx - w * 0.5, cy - h * 0.6, w, h);
    ctx.restore();
  },

  _drawStructureBubble(rect, structure, resources) {
    if (!resources || resources.length === 0) return;

    const rgb = [0xff, 0xd5, 0x41]; // Gold outline
    const sRes = Math.max(1, Math.round(this.mapScale * 1.0));
    const xImg = this._getXGlyphImage();
    const gapResToX = Math.round(-3 * this.mapScale);
    const gapXToNum = Math.round(-10 * this.mapScale);
    const betweenResources = Math.round(-4 * this.mapScale);

    const resourceItems = [];

    for (const { res, count } of resources) {
      const resIcon = this.resourceIconCache.getIcon(res);
      if (!resIcon) {
        this.resourceIconCache.loadIcon(res);
        continue;
      }

      const outlinedRes = this._getOutlinedSprite(resIcon, rgb, `res:${res}`);
      if (!outlinedRes) continue;

      let itemW = outlinedRes.width * sRes;
      const parts = [];
      parts.push({ type: 'icon', img: outlinedRes, w: outlinedRes.width * sRes, h: outlinedRes.height * sRes });

      if (xImg) {
        const outlinedX = this._getOutlinedSprite(xImg, rgb, "glyph:x");
        if (outlinedX) {
          const xw = outlinedX.width * sRes;
          const xh = outlinedX.height * sRes;
          itemW += gapResToX + xw;
          parts.push({ type: 'x', img: outlinedX, w: xw, h: xh, marginLeft: gapResToX });
        }
      }

      const digits = String(count);
      for (let i = 0; i < digits.length; i++) {
        const d = digits.charCodeAt(i) - 48;
        if (d >= 0 && d <= 9) {
          const dc = this._getWhiteDigitCanvas(d) || this.iconCache.getIcon(d);
          if (!dc) { this.iconCache.loadIcon(d); continue; }
          const od = this._getOutlinedSprite(dc, rgb, `mult:${d}`);
          if (od) {
            const dw = od.width * sRes;
            const dh = od.height * sRes;
            const margin = (i === 0 && xImg) ? gapXToNum : 0;
            itemW += margin + dw;
            parts.push({ type: 'digit', img: od, w: dw, h: dh, marginLeft: margin });
          }
        }
      }

      resourceItems.push({ w: itemW, parts });
    }

    if (resourceItems.length === 0) return;

    let maxItemW = 0;
    for (const item of resourceItems) maxItemW = Math.max(maxItemW, item.w);

    const bubblePaddingX = Math.round(1 * this.mapScale);
    const bubblePaddingY = Math.round(0 * this.mapScale);
    const bubbleBottomMargin = Math.round(3 * this.mapScale);

    const bubbleW = maxItemW + (bubblePaddingX * 2);
    let totalResH = 0;
    for (const item of resourceItems) {
      let hh = 0;
      for (const p of item.parts) hh = Math.max(hh, p.h);
      totalResH += hh;
    }
    if (resourceItems.length > 1) totalResH += (resourceItems.length - 1) * betweenResources;
    const bubbleH = (bubblePaddingY * 2) + totalResH;

    const bubbleX = Math.round(rect.cx - (bubbleW * 0.5));
    const bubbleY = Math.round(rect.y - bubbleH - bubbleBottomMargin);

    const bx = bubbleX, by = bubbleY, bw = bubbleW, bh = bubbleH;
    const isHovered = this.mouseWorld &&
      this.mouseWorld.x >= bx && this.mouseWorld.x <= bx + bw &&
      this.mouseWorld.y >= by && this.mouseWorld.y <= by + bh;

    ctx.save();
    if (isHovered) ctx.globalAlpha = 0.25;

    ctx.fillStyle = "rgba(11, 16, 32, 0.70)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = Math.max(1, 1 * this.mapScale);

    const radius = Math.round(4 * this.mapScale);
    ctx.beginPath();
    ctx.moveTo(bx + radius, by);
    ctx.lineTo(bx + bw - radius, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius);
    ctx.lineTo(bx + bw, by + bh - radius);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - radius, by + bh);
    ctx.lineTo(bx + radius, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - radius);
    ctx.lineTo(bx, by + radius);
    ctx.quadraticCurveTo(bx, by, bx + radius, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    let currentDrawY = Math.round(bubbleY + bubblePaddingY);
    for (const item of resourceItems) {
      let maxRowH = 0;
      for (const p of item.parts) maxRowH = Math.max(maxRowH, p.h);
      let currentX = Math.round(bubbleX + (bubbleW - item.w) * 0.5);
      for (const p of item.parts) {
        if (!p.img) continue;
        currentX += (p.marginLeft || 0);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(p.img, currentX, currentDrawY + Math.round((maxRowH - p.h) * 0.5), p.w, p.h);
        ctx.restore();
        currentX += p.w;
      }
      currentDrawY += maxRowH + betweenResources;
    }
    ctx.restore();
  },

  _drawSunkenShipOverlay(structure) {
    const t = this.tileByKey.get(structure.centerKey);
    if (!t) return;

    const variantIndex = structure.variantIndex || 0;
    const rgb = [0xff, 0xd5, 0x41]; // Gold outline used for unclaimed sunken ships

    const img = this.sunkenShipVariants[variantIndex % this.sunkenShipVariants.length];
    if (!img) return;

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (iw <= 0 || ih <= 0) return;

    const outlined = this._getOutlinedSprite(img, rgb, `sunken_ship:${variantIndex}|${rgb[0]},${rgb[1]},${rgb[2]}`);
    const sw = outlined ? outlined.width : iw;
    const sh = outlined ? outlined.height : ih;
    const s = this.mapScale;
    const w = sw * s;
    const h = sh * s;

    const tileX = t.baseX;
    const tileY = t.baseY + t.dy - t.lift;
    const cx = tileX + t.width * 0.5;
    const cy = tileY + t.height * 0.5;

    let spriteX = cx - w * 0.5;
    let spriteY = cy - h * 0.6;
    if (outlined) {
      spriteX -= s;
      spriteY -= s;
    }

    // Rewards: 3 timber (timber), 1 spices
    const resources = [
      { res: "timber", count: 3 },
      { res: "spices", count: 1 }
    ];

    const rect = { x: spriteX, y: spriteY, w, h, cx, cy };
    this._drawStructureBubble(rect, structure, resources);
  },

  _drawRuinOverlay(structure) {
    // Hide overlay once ruin is claimed
    if (structure.claimed) return;

    // Show resources the ruin gives: Spices x1, Herbs x2
    const variantIndex = structure.variantIndex || 0;
    const rgb = (structure.claimed && structure.claimedByRgb)
      ? structure.claimedByRgb
      : [0xff, 0xd5, 0x41];

    // Compute draw position (similar to outpost)
    const t = this.tileByKey.get(structure.centerKey);
    if (!t) return;

    const img = this.ruinVariants[variantIndex % this.ruinVariants.length];
    if (!img) return;

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (iw <= 0 || ih <= 0) return;

    const outlined = this._getOutlinedSprite(img, rgb, `ruin:${variantIndex}|${rgb[0]},${rgb[1]},${rgb[2]}`);
    const sw = outlined ? outlined.width : iw;
    const sh = outlined ? outlined.height : ih;
    const s = this.mapScale;
    const w = sw * s;
    const h = sh * s;

    const tileX = t.baseX;
    const tileY = t.baseY + t.dy - t.lift;
    const cx = tileX + t.width * 0.5;
    const cy = tileY + t.height * 0.5;

    let spriteX = cx - w * 0.5;
    let spriteY = cy - h * 0.6;
    if (outlined) {
      spriteX -= s;
      spriteY -= s;
    }

    // Resource items to show
    const { resources } = this._getRuinRewards(structure.centerKey);

    // Sizing
    const resourceScale = (typeof this.outpostResourceIconScale === "number") ? this.outpostResourceIconScale : 1.0;
    const sRes = Math.max(1, Math.round(this.mapScale * resourceScale));
    const xImg = this._getXGlyphImage();
    const gapResToX = Math.round(-3 * this.mapScale);
    const gapXToNum = Math.round(-10 * this.mapScale);
    const betweenResources = Math.round(-4 * this.mapScale);

    const resourceItems = [];

    for (const { res, count } of resources) {
      const resIcon = this.resourceIconCache.getIcon(res);
      if (!resIcon) {
        this.resourceIconCache.loadIcon(res);
        continue;
      }

      const outlinedRes = this._getOutlinedSprite(resIcon, rgb, `res:${res}`);
      if (!outlinedRes) continue;

      let itemW = outlinedRes.width * sRes;
      const parts = [];
      parts.push({ type: 'icon', img: outlinedRes, w: outlinedRes.width * sRes, h: outlinedRes.height * sRes });

      if (xImg) {
        const outlinedX = this._getOutlinedSprite(xImg, rgb, "glyph:x");
        if (outlinedX) {
          const xw = outlinedX.width * sRes;
          const xh = outlinedX.height * sRes;
          itemW += gapResToX + xw;
          parts.push({ type: 'x', img: outlinedX, w: xw, h: xh, marginLeft: gapResToX });
        }
      }

      const digits = String(count);
      for (let i = 0; i < digits.length; i++) {
        const d = digits.charCodeAt(i) - 48;
        if (d >= 0 && d <= 9) {
          const dc = this._getWhiteDigitCanvas(d) || this.iconCache.getIcon(d);
          if (!dc) { this.iconCache.loadIcon(d); continue; }
          const od = this._getOutlinedSprite(dc, rgb, `mult:${d}`);
          if (od) {
            const dw = od.width * sRes;
            const dh = od.height * sRes;
            const margin = (i === 0 && xImg) ? gapXToNum : 0;
            itemW += margin + dw;
            parts.push({ type: 'digit', img: od, w: dw, h: dh, marginLeft: margin });
          }
        }
      }

      resourceItems.push({ w: itemW, parts });
    }

    if (resourceItems.length === 0) return;

    let maxItemW = 0;
    for (const item of resourceItems) maxItemW = Math.max(maxItemW, item.w);

    const bubblePaddingX = Math.round(1 * this.mapScale);
    const bubblePaddingY = Math.round(0 * this.mapScale);
    const bubbleBottomMargin = Math.round(3 * this.mapScale);

    const bubbleW = maxItemW + (bubblePaddingX * 2);
    let totalResH = 0;
    for (const item of resourceItems) {
      let hh = 0;
      for (const p of item.parts) hh = Math.max(hh, p.h);
      totalResH += hh;
    }
    if (resourceItems.length > 1) totalResH += (resourceItems.length - 1) * betweenResources;
    const bubbleH = (bubblePaddingY * 2) + totalResH;

    const bubbleX = Math.round(cx - (bubbleW * 0.5));
    const bubbleY = Math.round(spriteY - bubbleH - bubbleBottomMargin);

    const bx = bubbleX, by = bubbleY, bw = bubbleW, bh = bubbleH;
    const isHovered = this.mouseWorld &&
      this.mouseWorld.x >= bx && this.mouseWorld.x <= bx + bw &&
      this.mouseWorld.y >= by && this.mouseWorld.y <= by + bh;

    ctx.save();
    if (isHovered) ctx.globalAlpha = 0.25;

    if (structure.claimed) {
      ctx.fillStyle = "rgba(11, 16, 32, 0.55)";
      ctx.strokeStyle = rgbToCss(rgb, 0.4);
    } else {
      ctx.fillStyle = "rgba(11, 16, 32, 0.70)";
      ctx.strokeStyle = "rgba(255, 213, 65, 0.25)";
    }
    ctx.lineWidth = Math.max(1, 1 * this.mapScale);

    const r = Math.round(4 * this.mapScale);
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + bw - r, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
    ctx.lineTo(bx + bw, by + bh - r);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
    ctx.lineTo(bx + r, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    let currentDrawY = Math.round(bubbleY + bubblePaddingY);
    for (const item of resourceItems) {
      let maxRowH = 0;
      for (const p of item.parts) maxRowH = Math.max(maxRowH, p.h);
      let currentX = Math.round(bubbleX + (bubbleW - item.w) * 0.5);
      for (const p of item.parts) {
        if (!p.img) continue;
        currentX += (p.marginLeft || 0);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(p.img, currentX, currentDrawY + Math.round((maxRowH - p.h) * 0.5), p.w, p.h);
        ctx.restore();
        currentX += p.w;
      }
      currentDrawY += maxRowH + betweenResources;
    }

    ctx.restore();
  },


  _drawOutpostOverlay(structure, rgb) {
    const isFarm = structure.type === "farm";
    const isFactory = structure.type === "factory";
    const variantIndex = structure.variantIndex || 0;

    let rect;
    if (isFarm) rect = this._computeFarmDrawRect(structure.centerKey, rgb, variantIndex);
    else if (isFactory) rect = this._computeFactoryDrawRect(structure.centerKey, rgb, variantIndex);
    else rect = this._computeOutpostDrawRect(structure.centerKey, rgb, variantIndex);

    if (!rect) return;

    // Factory has no number. We show just the resource.
    const number = (typeof structure.number === "number") ? (structure.number | 0) : 0;
    const showNumber = (number > 0);

    let numCanvas = null;
    let numW = 0, numH = 0;
    let outlinedNum = null;

    if (showNumber) {
      if (!this.iconCache.getIcon(number)) this.iconCache.loadIcon(number);
      numCanvas = this._getWhiteDigitCanvas(number) || this.iconCache.getIcon(number);
      if (numCanvas) {
        const numScale = (typeof this.outpostNumberScale === "number") ? this.outpostNumberScale : 1.0;
        const sNum = Math.max(1, Math.round(this.mapScale * numScale));
        outlinedNum = this._getOutlinedSprite(numCanvas, rgb, `outpostNum:${number}`);
        if (outlinedNum) {
          numW = outlinedNum.width * sNum;
          numH = outlinedNum.height * sNum;
        }
      }
    }

    const resourcesToShow = [];
    const resData = structure.resourceData || {};
    const counts = structure.resourceCounts || {};
    const suppressed = !!structure.isSuppressed;
    // When suppressed by a bandit tent, all output is halved (rounded down)
    const applySuppress = (c) => suppressed ? Math.floor(c / 2) : c;

    if (structure.yieldResource) {
      const data = resData[structure.yieldResource] || { count: counts[structure.yieldResource] || 0, numbers: new Set() };
      resourcesToShow.push({ res: structure.yieldResource, count: applySuppress(data.count), numbers: Array.from(data.numbers).sort((a, b) => a - b) });
    } else if (structure.yieldResources) {
      for (const r of structure.yieldResources) {
        const data = resData[r] || { count: counts[r] || 0, numbers: new Set() };
        resourcesToShow.push({ res: r, count: applySuppress(data.count), numbers: Array.from(data.numbers).sort((a, b) => a - b) });
      }
    } else if (Array.isArray(structure.yieldOptions) && structure.yieldOptions.length > 0) {
      for (const r of structure.yieldOptions) {
        const data = resData[r] || { count: counts[r] || 0, numbers: new Set() };
        resourcesToShow.push({ res: r, count: applySuppress(data.count), numbers: Array.from(data.numbers).sort((a, b) => a - b) });
      }
    }

    // Spacing and sizing
    const gapResToX = Math.round(-3 * this.mapScale);
    const gapXToNum = Math.round(-10 * this.mapScale);
    const gapNumToBracket = Math.round(-6 * this.mapScale);
    const betweenResources = Math.round(-4 * this.mapScale);
    const gapNumToRes = Math.round(-15 * this.mapScale);
    const resourceScale = (typeof this.outpostResourceIconScale === "number") ? this.outpostResourceIconScale : 1.0;
    const sRes = Math.max(1, Math.round(this.mapScale * resourceScale));
    const xImg = this._getXGlyphImage();

    const resourceItems = [];
    const prepareResourceItem = (resKey, cnt, resNumbers) => {
      const img = this.resourceIconCache.getIcon(resKey);
      if (!img) {
        this.resourceIconCache.loadIcon(resKey);
        return null;
      }

      const outlinedRes = this._getOutlinedSprite(img, rgb, `res:${resKey}`);
      if (!outlinedRes) return null;

      let itemW = outlinedRes.width * sRes;
      const parts = [];
      parts.push({ type: 'icon', img: outlinedRes, w: outlinedRes.width * sRes, h: outlinedRes.height * sRes });

      if (xImg) {
        const outlinedX = this._getOutlinedSprite(xImg, rgb, "glyph:x");
        if (outlinedX) {
          const xw = outlinedX.width * sRes;
          const xh = outlinedX.height * sRes;
          itemW += gapResToX + xw;
          parts.push({ type: 'x', img: outlinedX, w: xw, h: xh, marginLeft: gapResToX });
        }
      }

      const digits = String(cnt);
      for (let i = 0; i < digits.length; i++) {
        const d = digits.charCodeAt(i) - 48;
        if (d >= 0 && d <= 9) {
          const dc = this._getWhiteDigitCanvas(d) || this.iconCache.getIcon(d);
          if (!dc) {
            this.iconCache.loadIcon(d);
            continue;
          }
          const od = this._getOutlinedSprite(dc, rgb, `mult:${d}`);
          if (od) {
            const dw = od.width * sRes;
            const dh = od.height * sRes;
            const margin = (i === 0 && xImg) ? gapXToNum : 0;
            itemW += margin + dw;
            parts.push({ type: 'digit', img: od, w: dw, h: dh, marginLeft: margin });
          }
        }
      }

      return { w: itemW, parts };
    };

    for (const resEntry of resourcesToShow) {
      const item = prepareResourceItem(resEntry.res, resEntry.count, resEntry.numbers);
      if (item) resourceItems.push(item);
    }

    let maxItemW = 0;
    for (const item of resourceItems) maxItemW = Math.max(maxItemW, item.w);

    const contentW = Math.max(numW, maxItemW);
    const hasResources = resourceItems.length > 0;

    const bubblePaddingX = Math.round(1 * this.mapScale);
    const bubblePaddingY = Math.round(0 * this.mapScale);
    const bubbleBottomMargin = Math.round(3 * this.mapScale);

    const resHList = [];
    if (hasResources) {
      for (const item of resourceItems) {
        let h = 0;
        for (const p of item.parts) h = Math.max(h, p.h);
        resHList.push(h);
      }
    }

    const bubbleW = contentW + (bubblePaddingX * 2);
    let bubbleH = (bubblePaddingY * 2) + numH;
    if (hasResources) {
      const totalResH = resHList.reduce((a, b) => a + b, 0) + (resourceItems.length > 1 ? (resourceItems.length - 1) * betweenResources : 0);
      const gap = (numH > 0) ? gapNumToRes : 0;
      bubbleH += gap + totalResH;
    }

    const bubbleX = Math.round(rect.cx - (bubbleW * 0.5));
    const bubbleY = Math.round(rect.y - bubbleH - bubbleBottomMargin);

    const bx = bubbleX, by = bubbleY, bw = bubbleW, bh = bubbleH;
    const isHovered = this.mouseWorld &&
      this.mouseWorld.x >= bx && this.mouseWorld.x <= bx + bw &&
      this.mouseWorld.y >= by && this.mouseWorld.y <= by + bh;

    ctx.save();
    if (isHovered) {
      ctx.globalAlpha = 0.25;
    }

    if (structure.isSuppressed) {
      ctx.fillStyle = "rgba(128, 0, 0, 0.75)";
      ctx.strokeStyle = "rgba(255, 64, 64, 0.5)";
    } else {
      ctx.fillStyle = "rgba(11, 16, 32, 0.70)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    }
    ctx.lineWidth = Math.max(1, 1 * this.mapScale);

    const radius = Math.round(4 * this.mapScale);
    ctx.beginPath();
    ctx.moveTo(bx + radius, by);
    ctx.lineTo(bx + bw - radius, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius);
    ctx.lineTo(bx + bw, by + bh - radius);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - radius, by + bh);
    ctx.lineTo(bx + radius, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - radius);
    ctx.lineTo(bx, by + radius);
    ctx.quadraticCurveTo(bx, by, bx + radius, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (outlinedNum) {
      const drawNumX = Math.round(bubbleX + (bubbleW - numW) * 0.5);
      const drawNumY = Math.round(bubbleY + bubblePaddingY);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(outlinedNum, drawNumX, drawNumY, numW, numH);
      ctx.restore();
    }

    if (hasResources) {
      let currentDrawY = (outlinedNum)
        ? Math.round(bubbleY + bubblePaddingY + numH + gapNumToRes)
        : Math.round(bubbleY + bubblePaddingY);

      for (const item of resourceItems) {
        let maxRowH = 0;
        for (const p of item.parts) maxRowH = Math.max(maxRowH, p.h);
        let currentX = Math.round(bubbleX + (bubbleW - item.w) * 0.5);
        for (const p of item.parts) {
          if (!p.img) continue;
          currentX += (p.marginLeft || 0);
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(p.img, currentX, currentDrawY + Math.round((maxRowH - p.h) * 0.5), p.w, p.h);
          ctx.restore();
          currentX += p.w;
        }
        currentDrawY += maxRowH + betweenResources;
      }
    }

    ctx.restore();
  },

  // ----------------------------
  // Main draw loop entry
  // ----------------------------

  drawStructuresSprites(view) {
    try {
      // 1. Finalized Roads (Bottom Layer)
      for (const s of this.structures) {
        if (s.type !== "road") continue;
        const midT = this.tileByKey.get(s.centerKey);
        if (midT && this.tileIntersectsView(midT, view)) {
          this.drawRoadAtCenter(ctx, s.centerKey, s.direction, s.playerRgb, false, 0);
        }
      }

      // 2. Finalized Settlements (Outposts, Bandit HQs, Bandit Tents, Ruins, etc.)
      const nonRoads = this.structures.filter(s => s.type !== "road");
      nonRoads.sort((a, b) => {
        const ta = this.tileByKey.get(a.centerKey);
        const tb = this.tileByKey.get(b.centerKey);
        if (!ta || !tb) return 0;
        return ta.cy - tb.cy;
      });

      for (const s of nonRoads) {
        try {
          if (s.type === "outpost") {
            const t = this.tileByKey.get(s.centerKey);
            if (t && this.tileIntersectsView(t, view)) {
              this.drawOutpostAtCenter(s.centerKey, s.playerRgb, false, t.glow, s.variantIndex || 0);
            }
          } else if (s.type === "farm") {
            const t = this.tileByKey.get(s.centerKey);
            if (t && this.tileIntersectsView(t, view)) {
              this.drawFarmAtCenter(s.centerKey, s.playerRgb, false, t.glow, s.variantIndex || 0);
            }
          } else if (s.type === "factory") {
            const t = this.tileByKey.get(s.centerKey);
            if (t && this.tileIntersectsView(t, view)) {
              this.drawFactoryAtCenter(s.centerKey, s.playerRgb, false, t.glow, s.variantIndex || 0);
            }
          } else if (s.type === "bandit_hq") {
            const t = this.tileByKey.get(s.centerKey);
            if (t && this.tileIntersectsView(t, view)) {
              this.drawBanditHqAtCenter(s.centerKey, t.glow);
            }
          } else if (s.type === "bandit_tent") {
            const t = this.tileByKey.get(s.centerKey);
            if (t && this.tileIntersectsView(t, view)) {
              this.drawBanditTentAtCenter(s.centerKey, false, t.glow);
            }
          } else if (s.type === "ruin") {
            const t = this.tileByKey.get(s.centerKey);
            if (t && this.tileIntersectsView(t, view)) {
              this.drawRuinAtCenter(s.centerKey, t.glow, s);
            }
          } else if (s.type === "ship") {
            const t = this.tileByKey.get(s.centerKey);
            if (t && this.tileIntersectsView(t, view)) {
              this.drawShipAtCenter(s.centerKey, s.playerRgb, false, t.glow, s.variantIndex || 0, s.facingLeft || false);
            }
          } else if (s.type === "sunken_ship") {
            const t = this.tileByKey.get(s.centerKey);
            if (t && this.tileIntersectsView(t, view)) {
              this.drawSunkenShipAtCenter(s.centerKey, t.glow, s);
            }
          } else if (s.type === "port") {
            const t = this.tileByKey.get(s.centerKey);
            if (t && this.tileIntersectsView(t, view)) {
              this.drawPortAtCenter(s.centerKey, s.playerRgb, false, t.glow, s.variantIndex || 0);
            }
          } else if (s.type === "castle") {
            const t = this.tileByKey.get(s.centerKey);
            if (t && this.tileIntersectsView(t, view)) {
              this.drawCastleAtCenter(s.centerKey, s.playerRgb, false, t.glow, s.variantIndex || 0);
            }
          } else if (s.type === "trade_town") {
            const t = this.tileByKey.get(s.centerKey);
            if (t && this.tileIntersectsView(t, view)) {
              this.drawTradeTownAtCenter(s.centerKey, s.playerRgb, false, t.glow, s.variantIndex || 0);
            }
          } else if (s.type === "mercenary_camp") {
            const t = this.tileByKey.get(s.centerKey);
            if (t && this.tileIntersectsView(t, view)) {
              this.drawMercenaryCampAtCenter(s.centerKey, s.playerRgb, false, t.glow, s.variantIndex || 0);
            }
          } else if (s.type === "wall") {
            const t = this.tileByKey.get(s.centerKey);
            if (t && this.tileIntersectsView(t, view)) {
              this.drawWallAtCenter(ctx, s.centerKey, s.direction, s.playerRgb, false, t.glow);
            }
          }

        } catch (ee) {
          console.error(`Error drawing settlement at ${s.centerKey}:`, ee);
        }
      }


      // 3. Previews
      if (this.activeStructure === "outpost" && this.hoverCenterKey && this._isOutpostPlacementValid(this.hoverCenterKey)) {
        const t = this.tileByKey.get(this.hoverCenterKey);
        if (t && this.tileIntersectsView(t, view)) {
          const cur = this.getCurrentPlayer();
          // Use the pre-selected variant for this session
          this.drawOutpostAtCenter(this.hoverCenterKey, cur.rgb, true, t.glow, this.currentOutpostVariant || 0);
        }
      }

      if (this.activeStructure === "farm" && this.hoverCenterKey && this._isOutpostPlacementValid(this.hoverCenterKey)) {
        const t = this.tileByKey.get(this.hoverCenterKey);
        if (t && this.tileIntersectsView(t, view)) {
          const cur = this.getCurrentPlayer();
          this.drawFarmAtCenter(this.hoverCenterKey, cur.rgb, true, t.glow, this.currentFarmVariant || 0);
        }
      }

      if (this.activeStructure === "factory" && this.hoverCenterKey && this._isFactoryPlacementValid(this.hoverCenterKey)) {
        const t = this.tileByKey.get(this.hoverCenterKey);
        if (t && this.tileIntersectsView(t, view)) {
          const cur = this.getCurrentPlayer();
          this.drawFactoryAtCenter(this.hoverCenterKey, cur.rgb, true, t.glow, this.currentFactoryVariant || 0);
        }
      }

      if (this.activeStructure === "bandit_tent" && this.hoverCenterKey && this._isBanditTentPlacementValid(this.hoverCenterKey)) {
        const t = this.tileByKey.get(this.hoverCenterKey);
        if (t && this.tileIntersectsView(t, view)) {
          this.drawBanditTentAtCenter(this.hoverCenterKey, true, t.glow);
        }
      }

      if (this.activeStructure === "ship" && this.hoverCenterKey && this._isShipPlacementValid(this.hoverCenterKey)) {
        const t = this.tileByKey.get(this.hoverCenterKey);
        if (t && this.tileIntersectsView(t, view)) {
          const cur = this.getCurrentPlayer();
          // When moving, preserve facing direction; otherwise default to right-facing
          const previewFacing = this._movingShip ? (this._movingShipFacingLeft || false) : false;
          this.drawShipAtCenter(this.hoverCenterKey, cur.rgb, true, t.glow, this.currentShipVariant || 0, previewFacing);
        }
      }

      if (this.activeStructure === "port" && this.hoverCenterKey && this._isPortPlacementValid(this.hoverCenterKey)) {
        const t = this.tileByKey.get(this.hoverCenterKey);
        if (t && this.tileIntersectsView(t, view)) {
          const cur = this.getCurrentPlayer();
          this.drawPortAtCenter(this.hoverCenterKey, cur.rgb, true, t.glow, this.currentPortVariant || 0);
        }
      }

      if (this.activeStructure === "mercenary_camp" && this.hoverCenterKey && this._isMercenaryCampPlacementValid(this.hoverCenterKey)) {
        const t = this.tileByKey.get(this.hoverCenterKey);
        if (t && this.tileIntersectsView(t, view)) {
          const cur = this.getCurrentPlayer();
          this.drawMercenaryCampAtCenter(this.hoverCenterKey, cur.rgb, true, t.glow, this.currentMercenaryCampVariant || 0);
        }
      }

      if (this.activeStructure === "castle" && this.hoverCenterKey && this._isCastlePlacementValid(this.hoverCenterKey)) {
        const t = this.tileByKey.get(this.hoverCenterKey);
        if (t && this.tileIntersectsView(t, view)) {
          const cur = this.getCurrentPlayer();
          this.drawCastleAtCenter(this.hoverCenterKey, cur.rgb, true, t.glow, this.currentCastleVariant || 0);
        }
      }

      if (this.activeStructure === "trade_town" && this.hoverCenterKey && this._isTradeTownPlacementValid(this.hoverCenterKey)) {
        const t = this.tileByKey.get(this.hoverCenterKey);
        if (t && this.tileIntersectsView(t, view)) {
          const cur = this.getCurrentPlayer();
          this.drawTradeTownAtCenter(this.hoverCenterKey, cur.rgb, true, t.glow, this.currentTradeTownVariant || 0);
        }
      }

      // Road Construction Previews

      if (this.activeStructure === "road") {
        const cur = this.getCurrentPlayer();
        if (!this.activeRoadOrigin) {
          if (this.hoverCenterKey) {
            this.drawRoadStartPreview(ctx, this.hoverCenterKey, cur.rgb);
          }
        } else {
          const dir = this._getRoadDirectionFromOrigin(this.activeRoadOrigin, this.mouseWorld);
          const keys = this._getRoadTiles(this.activeRoadOrigin, dir);
          if (keys.length === 3) {
            const midT = this.tileByKey.get(keys[1]);
            if (midT && this.tileIntersectsView(midT, view)) {
              const isClear = this._isRoadPathClear(keys, this.activeRoadOrigin);
              // If not clear, draw with reduced alpha or special tint? 
              // For now, just dim it heavily.
              this.drawRoadAtCenter(ctx, keys[1], dir, cur.rgb, true, isClear ? midT.glow : -1.0);
            }
          }
        }
      }

      if (this.activeStructure === "wall") {
        const cur = this.getCurrentPlayer();
        if (!this.activeRoadOrigin) {
          if (this.hoverCenterKey) {
            this.drawRoadStartPreview(ctx, this.hoverCenterKey, cur.rgb);
          }
        } else {
          const dir = this._getRoadDirectionFromOrigin(this.activeRoadOrigin, this.mouseWorld);
          const keys = this._getRoadTiles(this.activeRoadOrigin, dir);
          if (keys.length === 3) {
            const midT = this.tileByKey.get(keys[1]);
            if (midT && this.tileIntersectsView(midT, view)) {
              const isClear = this._isWallPathClear(keys);
              this.drawWallAtCenter(ctx, keys[1], dir, cur.rgb, true, isClear ? midT.glow : -1.0);
            }
          }
        }
      }
    } catch (e) {
      console.error("Error drawing structure sprites:", e);
    }
  },

  drawStructuresOverlays(view) {
    try {
      const sorted = this.structures.slice().sort((a, b) => {
        const ta = this.tileByKey.get(a.centerKey);
        const tb = this.tileByKey.get(b.centerKey);
        if (!ta || !tb) return 0;
        return ta.cy - tb.cy;
      });

      for (const s of sorted) {
        if (s.type === "ruin") {
          try {
            const t = this.tileByKey.get(s.centerKey);
            if (t && this.tileIntersectsView(t, view)) {
              this._drawRuinOverlay(s);
            }
          } catch (ee) {
            console.error(`Error drawing ruin overlay at ${s.centerKey}:`, ee);
          }
          continue;
        }

        if (s.type === "sunken_ship") {
          try {
            const t = this.tileByKey.get(s.centerKey);
            if (t && this.tileIntersectsView(t, view)) {
              this._drawSunkenShipOverlay(s);
            }
          } catch (ee) {
            console.error(`Error drawing sunken ship overlay at ${s.centerKey}:`, ee);
          }
          continue;
        }
        if (s.type === "trade_town") {
          try {
            const t = this.tileByKey.get(s.centerKey);
            if (t && this.tileIntersectsView(t, view)) {
              this._drawTradeTownOverlay(s, s.playerRgb);
            }
          } catch (ee) {
            console.error(`Error drawing trade town overlay at ${s.centerKey}:`, ee);
          }
          continue;
        }
        if (s.type !== "outpost" && s.type !== "farm" && s.type !== "factory") continue;
        try {
          const t = this.tileByKey.get(s.centerKey);
          if (t && this.tileIntersectsView(t, view)) {
            this._drawOutpostOverlay(s, s.playerRgb);
          }
        } catch (ee) {
          console.error(`Error drawing overlay at ${s.centerKey}:`, ee);
        }
      }

      // Preview
      if (this.activeStructure === "outpost" && this.hoverCenterKey && this._isOutpostPlacementValid(this.hoverCenterKey)) {
        const t = this.tileByKey.get(this.hoverCenterKey);
        if (t && this.tileIntersectsView(t, view)) {
          const cur = this.getCurrentPlayer();
          const keys = this._getOutpostKeys(this.hoverCenterKey);
          if (keys.length === 7) {
            const numberSnapshot = [];
            for (const k of keys) numberSnapshot.push(this._getTileNumberForKey(k));
            const num = this._computeModeNumberFromSnapshot(numberSnapshot);
            const { resourceData, isSuppressed } = this.computeOutpostResourceCounts(keys);
            const counts = this._getLegacyCounts(resourceData);
            const tie = this.computeResourceTieOptions(counts);
            let yieldRes = null;
            let yieldOptions = [];
            if (tie.options.length === 1) yieldRes = tie.options[0];
            else if (tie.options.length > 1) yieldOptions = tie.options.slice();

            const temp = {
              type: "outpost",
              centerKey: this.hoverCenterKey,
              keys: keys,
              numberSnapshot: numberSnapshot,
              number: num,
              resourceData: resourceData,
              resourceCounts: counts,
              isSuppressed: isSuppressed,
              yieldResource: yieldRes,
              yieldOptions: yieldOptions,
              playerRgb: [cur.rgb[0], cur.rgb[1], cur.rgb[2]]
            };
            this._drawOutpostOverlay(temp, cur.rgb);
          }
        }
      }

      if (this.activeStructure === "farm" && this.hoverCenterKey && this._isOutpostPlacementValid(this.hoverCenterKey)) {
        const t = this.tileByKey.get(this.hoverCenterKey);
        if (t && this.tileIntersectsView(t, view)) {
          const cur = this.getCurrentPlayer();
          const keys = this._getOutpostKeys(this.hoverCenterKey);
          if (keys.length === 7) {
            const numberSnapshot = [];
            for (const k of keys) numberSnapshot.push(this._getTileNumberForKey(k));
            const num = this._computeModeNumberFromSnapshot(numberSnapshot);
            const { resourceData, isSuppressed } = this.computeOutpostResourceCounts(keys);
            const counts = this._getLegacyCounts(resourceData);
            const ties = this.computeFarmResourceTieOptions(counts);
            let yieldResources = [];
            let yieldOptions = [];

            if (ties.rank1.length > 2) {
              // Three-way+ tie at rank 1: show as options (player must pick 2)
              yieldOptions = ties.rank1.slice();
            } else {
              yieldResources.push(...ties.rank1);
              if (ties.rank1.length === 1 && ties.rank2.length > 0) {
                if (ties.rank2.length === 1) yieldResources.push(ties.rank2[0]);
                else yieldOptions = ties.rank2.slice();
              }
            }

            const temp = {
              type: "farm",
              centerKey: this.hoverCenterKey,
              keys: keys,
              numberSnapshot: numberSnapshot,
              number: num,
              resourceData: resourceData,
              resourceCounts: counts,
              isSuppressed: isSuppressed,
              yieldResources: yieldResources,
              yieldOptions: yieldOptions,
              playerRgb: [cur.rgb[0], cur.rgb[1], cur.rgb[2]]
            };
            this._drawOutpostOverlay(temp, cur.rgb);
          }
        }
      }

      if (this.activeStructure === "trade_town" && this.hoverCenterKey && this._isTradeTownPlacementValid(this.hoverCenterKey)) {
        const t = this.tileByKey.get(this.hoverCenterKey);
        if (t && this.tileIntersectsView(t, view)) {
          const cur = this.getCurrentPlayer();
          const keys = this._getOutpostKeys(this.hoverCenterKey);
          if (keys.length === 7) {
            const { resourceData } = this.computeOutpostResourceCounts(keys);
            const counts = this._getLegacyCounts(resourceData);
            let bestRes = null;
            let bestCount = 0;
            for (const [res, cnt] of Object.entries(counts)) {
              if (cnt > bestCount) { bestCount = cnt; bestRes = res; }
            }
            if (bestRes) {
              let tradeRatio;
              if (bestCount >= 7) tradeRatio = 1;
              else if (bestCount >= 5) tradeRatio = 2;
              else tradeRatio = 3;
              const temp = {
                type: "trade_town",
                centerKey: this.hoverCenterKey,
                keys: keys,
                variantIndex: this.currentTradeTownVariant || 0,
                tradeRatio: tradeRatio,
                tradeResource: bestRes,
                playerRgb: [cur.rgb[0], cur.rgb[1], cur.rgb[2]]
              };
              this._drawTradeTownOverlay(temp, cur.rgb);
            }
          }
        }
      }


    } catch (e) {
      console.error("Error drawing structure overlays:", e);
    }
  },

  removeStructureAt(key) {
    const centerKey = this.structureTileToCenter.get(key);
    if (!centerKey) return;

    const s = this.structureByCenter.get(centerKey);
    if (!s) return;

    // If removing a castle, deduct 1 VP from the owner
    if (s.type === "castle" && s.playerRgb) {
      const p = this.players.find(pl => pl.rgb && pl.rgb[0] === s.playerRgb[0] && pl.rgb[1] === s.playerRgb[1] && pl.rgb[2] === s.playerRgb[2]);
      if (p) {
        p.victoryPoints = Math.max(0, (p.victoryPoints || 0) - 1);
        console.log(`[Castle] ${p.name} lost castle at ${centerKey}. VP: ${p.victoryPoints}`);
      }
    }

    // Remove from main list
    const idx = this.structures.indexOf(s);
    if (idx !== -1) this.structures.splice(idx, 1);

    // Remove from maps
    this.structureByCenter.delete(centerKey);
    this._updateSpatialIndex(s, true); // Maintain spatial index
    if (s.keys) {
      for (const k of s.keys) {
        this.structureTileToCenter.delete(k);
      }
    }

    // Refresh display
    this.recomputeAllSettlementResources();
    this.updateHud();
    this.updateGameUi();
    if (typeof this.updateMinimapStructures === "function") this.updateMinimapStructures();
    console.log(`[Structures] Removed structure centered at ${centerKey}`);
  },

  calculateResourcesForRoll(rollNumber) {
    const playerYields = new Map(); // playerIdentityString -> Map(resourceKey -> count)

    for (const s of this.structures) {
      if (s.type !== "outpost" && s.type !== "farm" && s.type !== "factory") continue;

      // Simple rule: if the settlement's roll number matches, it produces.
      // Factory produces every turn, regardless of roll.
      if (s.type !== "factory" && s.number !== rollNumber) continue;

      const playerKey = JSON.stringify(s.playerRgb);
      if (!playerYields.has(playerKey)) {
        playerYields.set(playerKey, new Map());
      }
      const yields = playerYields.get(playerKey);

      // When suppressed by a bandit tent, halve all output (rounded down)
      const halve = s.isSuppressed ? (c) => Math.floor(c / 2) : (c) => c;

      if (s.type === "outpost") {
        // Outpost: yields yieldCount of yieldResource
        const res = s.yieldResource;
        const count = halve(s.yieldCount || 0);
        if (res && count > 0) {
          yields.set(res, (yields.get(res) || 0) + count);
        }
      } else if (s.type === "farm") {
        // Farm: yields resourceCounts[r] for each r in yieldResources
        const yieldResources = s.yieldResources || [];
        const counts = s.resourceCounts || {};
        for (const res of yieldResources) {
          const count = halve(counts[res] || 0);
          if (count > 0) {
            yields.set(res, (yields.get(res) || 0) + count);
          }
        }
      } else if (s.type === "factory") {
        // Factory: yields 1 of yieldResource every turn
        const res = s.yieldResource;
        const count = halve(1);
        if (res && count > 0) {
          yields.set(res, (yields.get(res) || 0) + count);
        }
      }
    }

    return playerYields;
  }
};
