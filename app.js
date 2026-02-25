"use strict";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: true });
ctx.imageSmoothingEnabled = false;

const statusEl = document.getElementById("status");
const zoomLabelEl = document.getElementById("zoomLabel");
const hoverLabelEl = document.getElementById("hoverLabel");
const resetBtn = document.getElementById("resetBtn");

const modeLabelEl = document.getElementById("modeLabel");
const clearSelBtn = document.getElementById("clearSelBtn");

const btnModePoint = document.getElementById("modePoint");
const btnModeCircle7 = document.getElementById("modeCircle7");
const btnModeLineH = document.getElementById("modeLineH");
const btnModeLineDR = document.getElementById("modeLineDR");
const btnModeLineDL = document.getElementById("modeLineDL");

const toggleNumbersEl = document.getElementById("toggleNumbers");

// Game UI (left top + bottom center + player counter in right panel)
const turnCountLabelEl = document.getElementById("turnCountLabel");
const turnPlayerLabelEl = document.getElementById("turnPlayerLabel");
const playerListEl = document.getElementById("playerList");
const endTurnBtn = document.getElementById("endTurnBtn");

const playersMinusBtn = document.getElementById("playersMinus");
const playersPlusBtn = document.getElementById("playersPlus");
const playersCountEl = document.getElementById("playersCount");
const structureOutpostBtn = document.getElementById("structureOutpostBtn");


function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function expLerpFactor(dt, speed) {
    return 1 - Math.exp(-dt * speed);
}

function nowSec() {
    return performance.now() / 1000;
}

function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

function pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;

        const denom = (yj - yi) || 1e-9;
        const intersect = ((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / denom + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function setCanvasSize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;
}

// Deterministic RNG for reproducible tile variant choices
function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return function () {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        h ^= (h >>> 16);
        return h >>> 0;
    };
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Player colors
function hslToRgb(h, s, l) {
    const hh = ((h % 360) + 360) % 360;
    const ss = clamp(s, 0, 1);
    const ll = clamp(l, 0, 1);

    const c = (1 - Math.abs(2 * ll - 1)) * ss;
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
    const m = ll - c / 2;

    let r1 = 0, g1 = 0, b1 = 0;
    if (hh < 60) { r1 = c; g1 = x; b1 = 0; }
    else if (hh < 120) { r1 = x; g1 = c; b1 = 0; }
    else if (hh < 180) { r1 = 0; g1 = c; b1 = x; }
    else if (hh < 240) { r1 = 0; g1 = x; b1 = c; }
    else if (hh < 300) { r1 = x; g1 = 0; b1 = c; }
    else { r1 = c; g1 = 0; b1 = x; }

    return [
        Math.round((r1 + m) * 255),
        Math.round((g1 + m) * 255),
        Math.round((b1 + m) * 255)
    ];
}

function makePlayerColors(count) {
    const n = Math.max(1, Math.min(10, Math.floor(count)));
    const out = [];

    // Player 1 always blue
    out.push({ name: "Player 1", rgb: [40, 120, 255] });

    const golden = 137.50776405003785;
    let h = 210;
    for (let i = 1; i < n; i++) {
        h = (h + golden) % 360;
        if (Math.abs(h - 210) < 18) h = (h + 30) % 360;
        const rgb = hslToRgb(h, 0.92, 0.56);
        out.push({ name: `Player ${i + 1}`, rgb });
    }
    return out;
}

function rgbToCss(rgb, a) {
    const r = clamp(Math.round(rgb[0]), 0, 255);
    const g = clamp(Math.round(rgb[1]), 0, 255);
    const b = clamp(Math.round(rgb[2]), 0, 255);
    const aa = clamp(a, 0, 1);
    return `rgba(${r}, ${g}, ${b}, ${aa})`;
}

class Camera {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.scale = 1;
        this.minScale = 0.20;
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
        this.x = viewW * 0.5 - centerX * this.scale;
        this.y = viewH * 0.35 - centerY * this.scale;
    }
}

class TileImageCache {
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

// Number tint mapping (from your pasted version)
function numberTintColor(n) {
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

class TileIconCache {
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

const SelectionMode = Object.freeze({
    POINT: "point",
    CIRCLE7: "circle7",
    LINE_H: "line_h",
    LINE_DR: "line_dr",
    LINE_DL: "line_dl"
});

class MapViewer {
    constructor() {
        this.map = null;
        this.tiles = [];
        this.tilesByRow = [];
        this.tileByKey = new Map();

        this.cache = new TileImageCache();
        this.iconCache = new TileIconCache();

        this.camera = new Camera();

        // Hover + selection state (keep exactly like pasted behavior)
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.camStart = { x: 0, y: 0 };

        this.mouse = { x: 0, y: 0 };
        this.mouseWorld = { x: 0, y: 0 };

        this.hoverCenterKey = null;
        this.hoverKeys = new Set();
        this.selectedKeys = new Set();

        this.pointerDown = false;
        this.pointerDownPos = { x: 0, y: 0 };
        this.pointerMoved = false;
        this.clickMoveThresholdPx = 6;

        this.selectionMode = SelectionMode.POINT;

        this.showNumbers = true;

        this.lastFrameT = nowSec();

        this.mapScale = 3;

        this.liftMax = 12;
        this.liftSpeed = 22;
        this.glowSpeed = 18;
        this.brightSpeed = 16;

        this.highlightAlpha = 0.8;

        this.debugLineLen = 3;

        this.cullPadScreenPx = 220;

        this.numberRadius = 16;
        this.numberDistByKey = new Map();

        this.numberFadeOuterWorld = 1;
        this.numberFadeInnerWorld = 0.6;

        this.baseSeed = 1;

        // Game state (restored)
        this.playerCount = 4;
        this.players = [];
        this.currentPlayerIndex = 0;
        this.turnCount = 1;

        this.resetPlayers(this.playerCount);
        // Structures
        this.activeStructure = null; // null or "outpost"
        this._prevSelectionMode = null;

        this.structures = []; // { type: "outpost", centerKey: "r,c", keys: string[], playerRgb: [r,g,b] }
        this.structureByCenter = new Map();
        this.structureTileToCenter = new Map(); // tileKey -> outpost centerKey

        this.outpostImg = new Image();
        this.outpostImg.decoding = "async";
        this.outpostImg.loading = "eager";
        this.outpostReady = false;
        this.outpostImg.onload = () => { this.outpostReady = true; };
        this.outpostImg.onerror = () => { this.outpostReady = false; };
        this.outpostImg.src = "./Structures/Settlements/outpost.png";
    }

    resetPlayers(count) {
        const n = Math.max(1, Math.min(10, Math.floor(count)));
        this.playerCount = n;
        this.players = makePlayerColors(n).map((p, idx) => {
            return { id: idx, name: p.name, rgb: p.rgb };
        });
        this.currentPlayerIndex = 0;
        this.turnCount = 1;
        this.updateGameUi();
    }

    getCurrentPlayer() {
        if (!this.players.length) return { id: 0, name: "Player 1", rgb: [40, 120, 255] };
        return this.players[clamp(this.currentPlayerIndex, 0, this.players.length - 1)];
    }

    endTurn() {
        if (!this.players.length) return;
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.turnCount += 1;
        this.updateGameUi();
    }

    updateGameUi() {
        if (playersCountEl) playersCountEl.textContent = String(this.playerCount);

        if (turnCountLabelEl) turnCountLabelEl.textContent = String(this.turnCount);
        const cur = this.getCurrentPlayer();
        if (turnPlayerLabelEl) turnPlayerLabelEl.textContent = cur.name;

        if (playerListEl) {
            playerListEl.innerHTML = "";
            for (let i = 0; i < this.players.length; i++) {
                const p = this.players[i];

                const chip = document.createElement("div");
                chip.className = "player-chip" + (i === this.currentPlayerIndex ? " active" : "");

                const left = document.createElement("div");
                left.className = "player-left";

                const dot = document.createElement("div");
                dot.className = "player-dot";
                dot.style.background = rgbToCss(p.rgb, 1);

                const name = document.createElement("div");
                name.className = "player-name";
                name.textContent = p.name;

                left.appendChild(dot);
                left.appendChild(name);

                chip.appendChild(left);
                playerListEl.appendChild(chip);
            }
        }
    }

    async loadMap() {
        statusEl.textContent = "Loading map.json...";
        const resp = await fetch("./map.json", { cache: "no-store" });
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

        this.buildTileInstances();
        this.computeNumberFadeRadiiWorld();

        if (failed.length > 0) {
            statusEl.textContent = `Loaded map with issues: Missing tile variants for ${failed.length} types.`;
            console.warn("Missing tile variants for:", failed);
        } else {
            statusEl.textContent = "Loaded.";
        }

        this.resetView();
    }

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
    }

    chooseVariantIndex(tileName, r, c) {
        const sm = xmur3(`${this.baseSeed}|${tileName}|${r},${c}`);
        const rng = mulberry32(sm());
        const count = this.cache.getVariantCount(tileName);
        if (!count || count <= 0) return 0;
        return Math.floor(rng() * count);
    }

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
                    bright: 0
                };

                this.tiles.push(tile);
                this.tilesByRow[r].push(tile);
                this.tileByKey.set(key, tile);
            }
        }
    }

    makeHexFootprint(x, y, tw, th) {
        return [
            { x: x + tw * 0.50, y: y + th * 0.02 },
            { x: x + tw * 0.95, y: y + th * 0.26 },
            { x: x + tw * 0.95, y: y + th * 0.74 },
            { x: x + tw * 0.50, y: y + th * 0.98 },
            { x: x + tw * 0.05, y: y + th * 0.74 },
            { x: x + tw * 0.05, y: y + th * 0.26 }
        ];
    }

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
    }

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

    computeSettlementNumber(keys) {
        let sum = 0;
        let count = 0;

        for (const k of keys) {
            const t = this.tileByKey.get(k);
            if (!t) continue;
            const n = (typeof t.number === "number") ? t.number : 0;
            if (!isFinite(n) || n === 0) continue;
            sum += n;
            count += 1;
        }

        if (count === 0) return 0;

        const avg = sum / count;
        let whole = Math.round(avg);

        // If rounding lands on 7, bump away from 7 depending on which side the decimals are on.
        if (whole === 7) {
            whole = (avg < 7) ? 6 : 8;
        }

        // Keep within typical Catan range if desired, but preserve 0 as "no number"
        if (whole !== 0) whole = clamp(whole, 2, 12);

        return whole;
    }

    setActiveStructure(type) {
        if (this.activeStructure === type) {
            this.activeStructure = null;

            if (this._prevSelectionMode) {
                this.selectionMode = this._prevSelectionMode;
                this._prevSelectionMode = null;
                this.updateModeUi();
                this.recomputeHoverShape();
                this.updateHud();
            }

            if (structureOutpostBtn) structureOutpostBtn.classList.remove("active");
            return;
        }

        this.activeStructure = type;

        if (type === "outpost") {
            if (!this._prevSelectionMode) this._prevSelectionMode = this.selectionMode;

            // Swap cursor selection type to circle while the tool is active.
            if (this.selectionMode !== SelectionMode.CIRCLE7) {
                this.selectionMode = SelectionMode.CIRCLE7;
                this.updateModeUi();
                this.recomputeHoverShape();
                this.updateHud();
            }

            if (structureOutpostBtn) structureOutpostBtn.classList.add("active");
        }
    }

    getCircle7KeysFromCenterKey(centerKey) {
        const out = [];
        const parts = String(centerKey).split(",");
        const r = Number(parts[0]);
        const c = Number(parts[1]);
        if (!this.inBounds(r, c)) return out;

        out.push(this.keyOf(r, c));
        const ns = this.neighborsOf(r, c);
        for (const n of ns) out.push(this.keyOf(n.r, n.c));
        return out;
    }

    placeOutpostAt(centerKey) {
        if (!centerKey) return;
        if (this.structureByCenter.has(centerKey)) return;

        const keys = this.getCircle7KeysFromCenterKey(centerKey);
        if (keys.length === 0) return;

        const cur = this.getCurrentPlayer();
        const settlementNumber = this.computeSettlementNumber(keys);

        const s = {
            type: "outpost",
            centerKey: centerKey,
            keys: keys,
            number: settlementNumber,
            playerRgb: [cur.rgb[0], cur.rgb[1], cur.rgb[2]]
        };

        this.structures.push(s);
        this.structureByCenter.set(centerKey, s);

        // Any tile in the outpost maps back to the outpost center
        for (const k of keys) {
            this.structureTileToCenter.set(k, centerKey);
        }
    }

    drawImageWithGlow(img, x, y, w, h, glow, rgb) {
        const doGlow = glow > 0.001;

        if (doGlow) {
            ctx.save();
            ctx.shadowColor = rgbToCss(rgb, 0.70);
            ctx.shadowBlur = 16 * glow;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.drawImage(img, x, y, w, h);
            ctx.restore();
        } else {
            ctx.drawImage(img, x, y, w, h);
        }
    }

    drawOutpostAtCenter(centerKey, rgb, preview) {
        if (!this.outpostReady) return;

        const t = this.tileByKey.get(centerKey);
        if (!t) return;

        // Knobs:
        // - outpostYOffsetPx: vertical offset in *native* pixels (before scaling)
        // - outpostXOffsetPx: horizontal offset in *native* pixels (before scaling)
        // - outpostGlowPlaced / outpostGlowPreview: glow strength
        const yOffNative = (typeof this.outpostYOffsetPx === "number") ? this.outpostYOffsetPx : -10;
        const xOffNative = (typeof this.outpostXOffsetPx === "number") ? this.outpostXOffsetPx : -1;
        const glowPlaced = (typeof this.outpostGlowPlaced === "number") ? this.outpostGlowPlaced : 1.6;
        const glowPreview = (typeof this.outpostGlowPreview === "number") ? this.outpostGlowPreview : 1.2;

        const glow = preview ? glowPreview : glowPlaced;

        const iw = (this.outpostImg.naturalWidth || this.outpostImg.width || 0);
        const ih = (this.outpostImg.naturalHeight || this.outpostImg.height || 0);
        if (iw <= 0 || ih <= 0) return;

        // Native pixels scaled by mapScale
        const w = iw * this.mapScale;
        const h = ih * this.mapScale;

        const tileX = t.baseX;
        const tileY = t.baseY + t.dy - t.lift;

        const cx = tileX + t.width * 0.5;
        const cy = tileY + t.height * 0.5;

        let x = cx - w * 0.5 + (xOffNative * this.mapScale);
        let y = cy - h * 0.5 + (yOffNative * this.mapScale);

        // Snap to mapScale pixel grid to keep pixel art crisp
        const snap = Math.max(1, this.mapScale | 0);
        x = Math.round(x / snap) * snap;
        y = Math.round(y / snap) * snap;

        this.drawImageWithGlow(this.outpostImg, x, y, w, h, glow, rgb);
    }

    drawStructures(view) {
        // Placed structures
        for (const s of this.structures) {
            if (s.type !== "outpost") continue;

            const t = this.tileByKey.get(s.centerKey);
            if (!t) continue;
            if (!this.tileIntersectsView(t, view)) continue;

            this.drawOutpostAtCenter(s.centerKey, s.playerRgb, false);
        }

        // Preview when tool active
        if (this.activeStructure === "outpost" && this.hoverCenterKey) {
            const t = this.tileByKey.get(this.hoverCenterKey);
            if (t && this.tileIntersectsView(t, view)) {
                const cur = this.getCurrentPlayer();
                this.drawOutpostAtCenter(this.hoverCenterKey, cur.rgb, true);
            }
        }
    }

    drawNumbersPass(view) {
        if (!this.showNumbers) return;

        for (let r = 0; r < this.tilesByRow.length; r++) {
            const rowTiles = this.tilesByRow[r];
            for (let i = 0; i < rowTiles.length; i++) {
                const t = rowTiles[i];
                if (!this.tileIntersectsView(t, view)) continue;
                if (typeof t.number !== "number") continue;

                const x = t.baseX;
                const y = t.baseY + t.dy - t.lift;
                this.drawTileNumberIcon(t, x, y);
            }
        }
    }

    setSelectionMode(mode) {
        this.selectionMode = mode;
        this.updateModeUi();
        this.recomputeHoverShape();
        this.updateHud();
    }

    updateModeUi() {
        if (modeLabelEl) modeLabelEl.textContent = this.selectionMode;

        const all = [btnModePoint, btnModeCircle7, btnModeLineH, btnModeLineDR, btnModeLineDL].filter(Boolean);
        for (const b of all) b.classList.remove("active");

        if (this.selectionMode === SelectionMode.POINT && btnModePoint) btnModePoint.classList.add("active");
        if (this.selectionMode === SelectionMode.CIRCLE7 && btnModeCircle7) btnModeCircle7.classList.add("active");
        if (this.selectionMode === SelectionMode.LINE_H && btnModeLineH) btnModeLineH.classList.add("active");
        if (this.selectionMode === SelectionMode.LINE_DR && btnModeLineDR) btnModeLineDR.classList.add("active");
        if (this.selectionMode === SelectionMode.LINE_DL && btnModeLineDL) btnModeLineDL.classList.add("active");
    }

    attachUi() {
        if (btnModePoint) btnModePoint.addEventListener("click", () => this.setSelectionMode(SelectionMode.POINT));
        if (btnModeCircle7) btnModeCircle7.addEventListener("click", () => this.setSelectionMode(SelectionMode.CIRCLE7));
        if (btnModeLineH) btnModeLineH.addEventListener("click", () => this.setSelectionMode(SelectionMode.LINE_H));
        if (btnModeLineDR) btnModeLineDR.addEventListener("click", () => this.setSelectionMode(SelectionMode.LINE_DR));
        if (btnModeLineDL) btnModeLineDL.addEventListener("click", () => this.setSelectionMode(SelectionMode.LINE_DL));

        if (clearSelBtn) {
            clearSelBtn.addEventListener("click", () => {
                this.selectedKeys.clear();
                this.updateHud();
            });
        }

        if (toggleNumbersEl) {
            toggleNumbersEl.addEventListener("change", () => {
                this.showNumbers = !!toggleNumbersEl.checked;
            });
            this.showNumbers = !!toggleNumbersEl.checked;
        } else {
            this.showNumbers = true;
        }

        if (endTurnBtn) endTurnBtn.addEventListener("click", () => this.endTurn());

        const clampPlayers = (n) => Math.max(1, Math.min(10, Math.floor(n)));
        if (playersMinusBtn) {
            playersMinusBtn.addEventListener("click", () => {
                const next = clampPlayers(this.playerCount - 1);
                if (next !== this.playerCount) this.resetPlayers(next);
            });
        }
        if (playersPlusBtn) {
            playersPlusBtn.addEventListener("click", () => {
                const next = clampPlayers(this.playerCount + 1);
                if (next !== this.playerCount) this.resetPlayers(next);
            });
        }

        if (structureOutpostBtn) {
            structureOutpostBtn.addEventListener("click", () => {
                this.setActiveStructure("outpost");
            });
        }

        this.updateGameUi();
        this.updateModeUi();
    }

    // Input handling pulled from your pasted version (unchanged)
    attachInput() {
        canvas.addEventListener("mousedown", (e) => {
            const rect = canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;

            this.pointerDown = true;
            this.pointerMoved = false;
            this.pointerDownPos.x = sx;
            this.pointerDownPos.y = sy;

            this.isDragging = true;
            this.dragStart.x = e.clientX;
            this.dragStart.y = e.clientY;
            this.camStart.x = this.camera.x;
            this.camStart.y = this.camera.y;
        });

        window.addEventListener("mouseup", () => {
            if (this.pointerDown) {
                this.pointerDown = false;
                const wasClick = !this.pointerMoved;
                if (wasClick) this.applySelectionFromHover();
            }
            this.isDragging = false;
        });

        window.addEventListener("mousemove", (e) => {
            const rect = canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;

            this.mouse.x = sx;
            this.mouse.y = sy;

            this.mouseWorld = this.camera.screenToWorld(this.mouse.x, this.mouse.y);

            if (this.pointerDown && !this.pointerMoved) {
                const dx = sx - this.pointerDownPos.x;
                const dy = sy - this.pointerDownPos.y;
                const dist2 = dx * dx + dy * dy;
                if (dist2 > this.clickMoveThresholdPx * this.clickMoveThresholdPx) {
                    this.pointerMoved = true;
                }
            }

            if (this.isDragging) {
                const dx = e.clientX - this.dragStart.x;
                const dy = e.clientY - this.dragStart.y;
                this.camera.x = this.camStart.x + dx;
                this.camera.y = this.camStart.y + dy;
                this.updateHud();
            } else {
                this.updateHoverFromMouse();
            }
        });

        canvas.addEventListener("mouseleave", () => {
            this.setHoverCenter(null);
        });

        canvas.addEventListener("wheel", (e) => {
            e.preventDefault();

            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            const delta = -e.deltaY;
            const scaleFactor = delta > 0 ? 1.08 : 1 / 1.08;

            this.camera.zoomAt(mx, my, scaleFactor);
            this.updateHud();

            this.mouseWorld = this.camera.screenToWorld(this.mouse.x, this.mouse.y);
            this.updateHoverFromMouse();
        }, { passive: false });

        if (resetBtn) {
            resetBtn.addEventListener("click", () => {
                this.resetView();
            });
        }

        window.addEventListener("resize", () => {
            setCanvasSize();
            this.resetView();
        });
    }

    inBounds(r, c) {
        return !!this.map && r >= 0 && c >= 0 && r < this.map.rows && c < this.map.cols;
    }

    keyOf(r, c) {
        return `${r},${c}`;
    }

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
    }

    stepE(r, c) { return { r: r, c: c + 1 }; }
    stepW(r, c) { return { r: r, c: c - 1 }; }

    stepNE(r, c) {
        const odd = (r % 2) === 1;
        return { r: r - 1, c: c + (odd ? 1 : 0) };
    }

    stepNW(r, c) {
        const odd = (r % 2) === 1;
        return { r: r - 1, c: c + (odd ? 0 : -1) };
    }

    stepSE(r, c) {
        const odd = (r % 2) === 1;
        return { r: r + 1, c: c + (odd ? 1 : 0) };
    }

    stepSW(r, c) {
        const odd = (r % 2) === 1;
        return { r: r + 1, c: c + (odd ? 0 : -1) };
    }

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
    }

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
    }

    setHoverCenter(key) {
        if (this.hoverCenterKey === key) return;

        this.hoverCenterKey = key;

        // Always rebuild hoverKeys here, otherwise outpost hover never clears correctly
        this.hoverKeys.clear();

        if (this.hoverCenterKey) {
            // If hovering a tile that is an outpost center, hover the whole outpost footprint.
            const s = this.structureByCenter.get(this.hoverCenterKey);
            if (s && s.type === "outpost" && Array.isArray(s.keys) && s.keys.length) {
                for (const k of s.keys) this.hoverKeys.add(k);

                // Keep number logic centered on the outpost center key.
                this.recomputeNumberRadiusMap();
                this.updateHud();
                this.requestNumberIconsInRadius();
                return;
            }
        }

        this.recomputeHoverShape();
        this.recomputeNumberRadiusMap();
        this.updateHud();
        this.requestNumberIconsInRadius();
    }

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
    }

    requestNumberIconsInRadius() {
        if (!this.showNumbers) return;
        if (!this.hoverCenterKey) return;

        for (const k of this.numberDistByKey.keys()) {
            const t = this.tileByKey.get(k);
            if (!t) continue;

            if (typeof t.number !== "number" || !isFinite(t.number) || t.number === 0) continue;
            if (!this.iconCache.getIcon(t.number)) this.iconCache.loadIcon(t.number);
        }
    }

    recomputeHoverShape() {
        this.hoverKeys.clear();
        if (!this.hoverCenterKey || !this.map) return;

        const parts = this.hoverCenterKey.split(",");
        const r = Number(parts[0]);
        const c = Number(parts[1]);

        const coords = this.selectionCoordsFromCenter(r, c);
        for (const p of coords) {
            if (!this.inBounds(p.r, p.c)) continue;
            this.hoverKeys.add(this.keyOf(p.r, p.c));
        }
    }

    updateHoverFromMouse() {
        if (!this.map) return;

        const world = this.camera.screenToWorld(this.mouse.x, this.mouse.y);
        this.mouseWorld.x = world.x;
        this.mouseWorld.y = world.y;

        let hit = null;

        for (let r = this.tilesByRow.length - 1; r >= 0; r--) {
            const rowTiles = this.tilesByRow[r];
            for (let i = rowTiles.length - 1; i >= 0; i--) {
                const t = rowTiles[i];
                if (pointInPoly(world.x, world.y, t.footprint)) {
                    hit = t;
                    r = -1;
                    break;
                }
            }
        }

        if (!hit) {
            this.setHoverCenter(null);
        } else {
            const centerKey = this.structureTileToCenter.get(hit.key) || hit.key;
            this.setHoverCenter(centerKey);
        }
    }

    applySelectionFromHover() {
        if (!this.hoverCenterKey) return;

        // If the hovered thing is an outpost, selection becomes the whole outpost footprint.
        const s = this.hoverCenterKey ? this.structureByCenter.get(this.hoverCenterKey) : null;
        if (s && s.type === "outpost" && Array.isArray(s.keys) && s.keys.length) {
            this.selectedKeys.clear();
            for (const k of s.keys) this.selectedKeys.add(k);

            this.updateHud();

            // If tool active, still allow placement (but it will no-op if already placed)
            if (this.activeStructure === "outpost") this.placeOutpostAt(this.hoverCenterKey);
            return;
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

        // Structure placement piggybacks on the existing click selection behavior.
        // This does not change selection logic, it only adds placement as a side effect.
        if (this.activeStructure === "outpost") {
            this.placeOutpostAt(this.hoverCenterKey);
        }

        this.updateHud();
    }

    updateHud() {
        if (zoomLabelEl) zoomLabelEl.textContent = this.camera.scale.toFixed(2);

        const hoverText = (() => {
            if (!this.hoverCenterKey || !this.map) return "none";
            const parts = this.hoverCenterKey.split(",");
            const r = Number(parts[0]);
            const c = Number(parts[1]);
            const name = this.map.tiles[r][c];
            return `${name} (${r},${c})`;
        })();

        const selCount = this.selectedKeys.size;
        const hoverCount = this.hoverKeys.size;

        if (hoverLabelEl) {
            hoverLabelEl.textContent = `${hoverText} | hover: ${hoverCount} | selected: ${selCount} | mode: ${this.selectionMode}`;
        }
    }

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
    }

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
    }

    tick() {
        const t = nowSec();
        const dt = Math.min(0.05, Math.max(0.001, t - this.lastFrameT));
        this.lastFrameT = t;

        const liftK = expLerpFactor(dt, this.liftSpeed);
        const glowK = expLerpFactor(dt, this.glowSpeed);
        const brightK = expLerpFactor(dt, this.brightSpeed);

        for (const tile of this.tiles) {
            const isHover = this.hoverKeys.has(tile.key) ? 1 : 0;
            const isSelected = this.selectedKeys.has(tile.key) ? 1 : 0;

            const hoverLift = isHover ? this.liftMax : 0;
            const selectedLift = isSelected ? this.liftMax * 0.6 : 0;
            const targetLift = Math.max(hoverLift, selectedLift);

            const targetGlow = isHover ? 1.0 : (isSelected ? 0.65 : 0);
            const targetBright = isSelected ? 1 : 0;

            tile.lift = lerp(tile.lift, targetLift, liftK);
            tile.glow = lerp(tile.glow, targetGlow, glowK);
            tile.bright = lerp(tile.bright, targetBright, brightK);
        }

        this.draw();
        requestAnimationFrame(() => this.tick());
    }

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

        const promoted = new Set();
        for (const k of this.hoverKeys) promoted.add(k);
        for (const k of this.selectedKeys) promoted.add(k);

        // Pass 1: tiles (no numbers)
        for (let r = 0; r < this.tilesByRow.length; r++) {
            const rowTiles = this.tilesByRow[r];

            for (let i = 0; i < rowTiles.length; i++) {
                const tile = rowTiles[i];
                if (promoted.has(tile.key)) continue;
                if (!this.tileIntersectsView(tile, view)) continue;
                this.drawTile(tile);
            }

            for (let i = 0; i < rowTiles.length; i++) {
                const tile = rowTiles[i];
                if (!promoted.has(tile.key)) continue;
                if (!this.tileIntersectsView(tile, view)) continue;
                this.drawTile(tile);
            }
        }

        // Pass 2: structures (above tiles, below numbers)
        this.drawStructures(view);

        // Pass 3: numbers last
        this.drawNumbersPass(view);

        ctx.restore();
    }

    drawTile(t) {
        const img = this.cache.getVariant(t.name, t.variantIndex);

        const x = t.baseX;
        const y = t.baseY + t.dy - t.lift;

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
                const r = clamp(Math.round(prgb[0]), 0, 255);
                const g = clamp(Math.round(prgb[1]), 0, 255);
                const b = clamp(Math.round(prgb[2]), 0, 255);

                // Cache key includes tintStrength so you can tweak live
                const ts = Math.round(tintStrength * 1000);
                const tintKey = `${srcKey}|${t.width}x${t.height}|${r},${g},${b}|${ts}`;

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
                        cctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
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
}

async function main() {
    setCanvasSize();
    window.addEventListener("resize", () => setCanvasSize());

    const viewer = new MapViewer();
    viewer.attachUi();
    viewer.attachInput();

    try {
        await viewer.loadMap();
    } catch (err) {
        if (statusEl) statusEl.textContent = String(err && err.message ? err.message : err);
        console.error(err);
        return;
    }

    viewer.tick();
}

main();
