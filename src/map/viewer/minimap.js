"use strict";

import { canvas, ctx } from "../../core/dom.js";

import { tileNameToColor } from "./colors.js";


export const minimapMethods = {
    /**
     * Build the base terrain minimap canvas (hex-offset layout).
     * Each tile is a 2×2 block; odd rows are shifted +1px right.
     * Call once after loadMap() finishes.
     */
    buildMinimapCanvas() {
        if (!this.map) return;

        const rows = this.map.rows;
        const cols = this.map.cols;
        const pw = 6; // Base width per hex
        const ph = 6; // Base height per hex

        // Pointy-top hex math (odd-r layout)
        // Horizontal spacing = pw
        // Vertical spacing = ph * 0.75
        // Row offset = pw * 0.5
        const cw = Math.ceil((cols + 0.5) * pw);
        const ch = Math.ceil((rows * 0.75 + 0.25) * ph);

        const c = document.createElement("canvas");
        c.width = cw;
        c.height = ch;
        const mctx = c.getContext("2d", { alpha: false });

        mctx.fillStyle = "#000";
        mctx.fillRect(0, 0, cw, ch);

        const drawHex = (ctx, cx, cy, w, h) => {
            const hh = h * 0.5;
            const hw = w * 0.5;
            const qh = h * 0.25;
            ctx.beginPath();
            ctx.moveTo(cx, cy - hh); // Top
            ctx.lineTo(cx + hw, cy - qh); // Top Right
            ctx.lineTo(cx + hw, cy + qh); // Bottom Right
            ctx.lineTo(cx, cy + hh); // Bottom
            ctx.lineTo(cx - hw, cy + qh); // Bottom Left
            ctx.lineTo(cx - hw, cy - qh); // Top Left
            ctx.closePath();
            ctx.fill();
        };

        for (let r = 0; r < rows; r++) {
            const y = (r * 0.75 + 0.5) * ph;
            const xOff = (r % 2 === 1) ? pw * 0.5 : 0;
            for (let col = 0; col < cols; col++) {
                const tileName = this.map.tiles[r][col];
                const rgb = tileNameToColor(tileName);
                const x = (col + 0.5) * pw + xOff;

                mctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
                drawHex(mctx, x, y, pw + 0.5, ph + 0.5); // Slight overlap to avoid gaps
            }
        }

        this._minimapBaseCanvas = c;
        this._minimapPw = pw;
        this._minimapPh = ph;
        this._minimapCanvas = null;
        this.updateMinimapStructures();
    },

    /**
     * Rebuild the minimap composite (terrain + structure dots).
     * Call after any structure is placed or removed.
     */
    updateMinimapStructures() {
        if (!this._minimapBaseCanvas || !this.map) return;

        const rows = this.map.rows;
        const cols = this.map.cols;
        const pw = this._minimapPw || 6;
        const ph = this._minimapPh || 6;
        const cw = this._minimapBaseCanvas.width;
        const ch = this._minimapBaseCanvas.height;

        const c = document.createElement("canvas");
        c.width = cw;
        c.height = ch;
        const mctx = c.getContext("2d", { alpha: false });

        // Blit the pre-built terrain canvas (O(1) instead of O(tiles))
        mctx.drawImage(this._minimapBaseCanvas, 0, 0);

        const drawHex = (ctx, cx, cy, w, h) => {
            const hh = h * 0.5;
            const hw = w * 0.5;
            const qh = h * 0.25;
            ctx.beginPath();
            ctx.moveTo(cx, cy - hh);
            ctx.lineTo(cx + hw, cy - qh);
            ctx.lineTo(cx + hw, cy + qh);
            ctx.lineTo(cx, cy + hh);
            ctx.lineTo(cx - hw, cy + qh);
            ctx.lineTo(cx - hw, cy - qh);
            ctx.closePath();
            ctx.fill();
        };

        const query = (this.searchQuery || "").toLowerCase().trim();
        const tokens = query.split(/\s+/).filter(t => t.length > 0);
        const isSearchActive = tokens.length > 0;

        // If search is active, dim the entire base canvas then highlight matches
        if (isSearchActive) {
            mctx.save();
            mctx.globalAlpha = 0.8;
            mctx.fillStyle = "#000";
            mctx.fillRect(0, 0, cw, ch);
            mctx.restore();

            for (let r = 0; r < rows; r++) {
                const y = (r * 0.75 + 0.5) * ph;
                const xOff = (r % 2 === 1) ? pw * 0.5 : 0;
                for (let col = 0; col < cols; col++) {
                    const tileName = this.map.tiles[r][col];
                    const tileNum = (this.map.numbers && this.map.numbers[r] && this.map.numbers[r][col] !== undefined)
                        ? String(this.map.numbers[r][col])
                        : "";
                    const tileText = (tileName + " " + tileNum).toLowerCase();
                    if (tokens.every(t => tileText.includes(t))) {
                        const rgb = tileNameToColor(tileName);
                        const x = (col + 0.5) * pw + xOff;
                        mctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
                        drawHex(mctx, x, y, pw + 0.5, ph + 0.5);
                    }
                }
            }
        }

        // Draw structure dots on top
        for (const s of this.structures) {
            if (!s || !s.centerKey) continue;

            let rgb;
            let structureName = (s.type || "").toLowerCase();
            let playerName = "";

            if (s.type === "ruin") {
                rgb = (s.claimed && s.claimedByRgb) ? s.claimedByRgb : [0xff, 0xd5, 0x41];
                structureName = "ruin";
                if (s.claimed && s.claimedByRgb) {
                    const player = this.players.find(p => p.rgb && p.rgb[0] === s.claimedByRgb[0] && p.rgb[1] === s.claimedByRgb[1] && p.rgb[2] === s.claimedByRgb[2]);
                    if (player) playerName = player.name.toLowerCase();
                }
            } else if (s.type === "bandit_hq" || s.type === "bandit_tent") {
                rgb = [255, 0, 0];
                structureName = s.type === "bandit_hq" ? "bandit hq" : "bandit tent";
            } else if (s.type === "sunken_ship") {
                rgb = [0xff, 0xd5, 0x41]; // Gold, same as ruins
                structureName = "sunken ship";
            } else if (s.type === "trade_town") {
                rgb = s.playerRgb || [255, 255, 255];
                structureName = "trade town";
                const player = this.players.find(p => p.rgb && p.rgb[0] === rgb[0] && p.rgb[1] === rgb[1] && p.rgb[2] === rgb[2]);
                if (player) playerName = player.name.toLowerCase();
            } else if (s.playerRgb) {
                rgb = s.playerRgb;
                const player = this.players.find(p => p.rgb && p.rgb[0] === rgb[0] && p.rgb[1] === rgb[1] && p.rgb[2] === rgb[2]);
                if (player) playerName = player.name.toLowerCase();
            } else continue;

            let drawColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
            if (isSearchActive) {
                const searchableTerms = [structureName, playerName];
                if (typeof s.number === "number") searchableTerms.push(String(s.number));
                if (s.resourceCounts) {
                    Object.keys(s.resourceCounts).forEach(res => searchableTerms.push(res));
                }
                if (s.yieldResource) searchableTerms.push(s.yieldResource);
                if (Array.isArray(s.yieldResources)) {
                    s.yieldResources.forEach(res => searchableTerms.push(res));
                }
                if (s.tradeResource) searchableTerms.push(s.tradeResource);

                const combinedText = searchableTerms.join(" ").toLowerCase();
                const matches = tokens.every(t => combinedText.includes(t));
                if (!matches) {
                    drawColor = `rgb(${rgb[0] * 0.2},${rgb[1] * 0.2},${rgb[2] * 0.2})`;
                }
            }

            mctx.fillStyle = drawColor;

            const keysArr = s.keys || [s.centerKey];
            for (const k of keysArr) {
                const parts = k.split(",");
                const r = parseInt(parts[0], 10);
                const col = parseInt(parts[1], 10);
                if (r >= 0 && r < rows && col >= 0 && col < cols) {
                    const y = (r * 0.75 + 0.5) * ph;
                    const xOff = (r % 2 === 1) ? pw * 0.5 : 0;
                    const x = (col + 0.5) * pw + xOff;
                    drawHex(mctx, x, y, pw + 0.5, ph + 0.5);
                }
            }
        }

        this._minimapCanvas = c;
    },

    /**
     * Draw the minimap overlay in the bottom-left corner (screen space).
     * Call from draw() AFTER ctx.restore().
     */
    drawMinimap() {
        if (!this._minimapCanvas || !this.map) return;

        const rect = canvas.getBoundingClientRect();
        const screenW = rect.width;
        const screenH = rect.height;

        const srcW = this._minimapCanvas.width;
        const srcH = this._minimapCanvas.height;

        // Minimap display size — removed artificial stretch math
        let maxW = 560;
        let maxH = 440;
        const aspect = srcW / srcH;

        // Never exceed 1/12 of the screen area
        const maxArea = (screenW * screenH) / 12;
        // Compute initial size from aspect
        let mmW, mmH;
        if (aspect > maxW / maxH) {
            mmW = maxW;
            mmH = maxW / aspect;
        } else {
            mmH = maxH;
            mmW = maxH * aspect;
        }
        // Scale down if exceeding budget
        if (mmW * mmH > maxArea) {
            const scale = Math.sqrt(maxArea / (mmW * mmH));
            mmW *= scale;
            mmH *= scale;
        }

        const margin = 14;
        const padding = 6;

        // Position: bottom-left
        const boxX = margin;
        const boxY = screenH - margin - mmH - padding * 2;
        const boxW = mmW + padding * 2;
        const boxH = mmH + padding * 2;

        // Store minimap image rect for hit testing
        const imgX = boxX + padding;
        const imgY = boxY + padding;
        this._minimapRect = { x: imgX, y: imgY, w: mmW, h: mmH };

        // Draw background panel
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = "rgba(11, 16, 32, 0.88)";
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 8);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Border
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 8);
        ctx.stroke();

        // Draw minimap image with high-quality smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(this._minimapCanvas, imgX, imgY, mmW, mmH);

        // --- Viewfinder rectangle ---
        // Map world bounds
        const bounds = this.computeWorldBounds();
        const worldW = bounds.maxX - bounds.minX;
        const worldH = bounds.maxY - bounds.minY;

        if (worldW > 0 && worldH > 0) {
            // Camera view in world coordinates (without the culling pad)
            const viewLeft = (0 - this.camera.x) / this.camera.scale;
            const viewTop = (0 - this.camera.y) / this.camera.scale;
            const viewRight = (screenW - this.camera.x) / this.camera.scale;
            const viewBottom = (screenH - this.camera.y) / this.camera.scale;

            // Convert to minimap pixel coords
            const vfX = imgX + ((viewLeft - bounds.minX) / worldW) * mmW;
            const vfY = imgY + ((viewTop - bounds.minY) / worldH) * mmH;
            const vfW = ((viewRight - viewLeft) / worldW) * mmW;
            const vfH = ((viewBottom - viewTop) / worldH) * mmH;

            // Clamp to minimap area
            const clampX = Math.max(imgX, Math.min(imgX + mmW, vfX));
            const clampY = Math.max(imgY, Math.min(imgY + mmH, vfY));
            const clampR = Math.max(imgX, Math.min(imgX + mmW, vfX + vfW));
            const clampB = Math.max(imgY, Math.min(imgY + mmH, vfY + vfH));

            const finalW = clampR - clampX;
            const finalH = clampB - clampY;

            if (finalW > 1 && finalH > 1) {
                ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
                ctx.lineWidth = 1.5;
                ctx.strokeRect(clampX, clampY, finalW, finalH);

                // Subtle fill for visibility
                ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
                ctx.fillRect(clampX, clampY, finalW, finalH);
            }
        }

        ctx.restore();
    },

    /**
     * Check if a screen-space point is inside the minimap.
     */
    minimapHitTest(sx, sy) {
        const r = this._minimapRect;
        if (!r) return false;
        return sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h;
    },

    /**
     * Navigate the camera so the given screen point on the minimap
     * becomes the center of the viewport.
     */
    minimapNavigateTo(sx, sy) {
        const r = this._minimapRect;
        if (!r || !this.map) return;

        // Normalised position within minimap image [0..1]
        const nx = (sx - r.x) / r.w;
        const ny = (sy - r.y) / r.h;

        // Map to world coordinates
        const bounds = this.computeWorldBounds();
        const worldX = bounds.minX + nx * (bounds.maxX - bounds.minX);
        const worldY = bounds.minY + ny * (bounds.maxY - bounds.minY);

        // Center camera on that world point
        const rect = canvas.getBoundingClientRect();
        this.camera.x = rect.width / 2 - worldX * this.camera.scale;
        this.camera.y = rect.height / 2 - worldY * this.camera.scale;

        this.updateHud();
        this.mouseWorld = this.camera.screenToWorld(this.mouse.x, this.mouse.y);
        this.updateHoverFromMouse();
    }
};
