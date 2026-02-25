"use strict";

export const persistenceMethods = {
    serializeGameState() {
        const state = {
            version: "1.0",
            timestamp: Date.now(),
            game: {
                playerCount: this.playerCount,
                currentPlayerIndex: this.currentPlayerIndex,
                turnCount: this.turnCount,
                baseSeed: this.baseSeed,
                mapSeed: this.map?.seed,
                mapWidth: this.map?.cols,
                mapHeight: this.map?.rows
            },
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                rgb: p.rgb,
                victoryPoints: p.victoryPoints || 0
            })),
            structures: this.structures.map(s => {
                const item = {
                    type: s.type,
                    centerKey: s.centerKey,
                    keys: s.keys,
                    playerRgb: s.playerRgb ? [s.playerRgb[0], s.playerRgb[1], s.playerRgb[2]] : null
                };

                // Add type-specific data
                if (s.type === "outpost") {
                    item.number = s.number;
                    item.variantIndex = s.variantIndex;
                    item.yieldResource = s.yieldResource;
                    item.numberSnapshot = s.numberSnapshot;
                } else if (s.type === "farm") {
                    item.number = s.number;
                    item.variantIndex = s.variantIndex;
                    item.yieldResources = s.yieldResources;
                    item.numberSnapshot = s.numberSnapshot;
                } else if (s.type === "factory") {
                    item.variantIndex = s.variantIndex;
                    item.yieldResource = s.yieldResource;
                } else if (s.type === "port") {
                    item.variantIndex = s.variantIndex;
                } else if (s.type === "road" || s.type === "wall") {
                    item.originKey = s.originKey;
                    item.direction = s.direction;
                } else if (s.type === "ship") {
                    item.variantIndex = s.variantIndex;
                    // rangeKeys and reachableCenterKeys are recomputed
                } else if (s.type === "ruin") {
                    item.variantIndex = s.variantIndex;
                    item.claimed = s.claimed;
                    item.claimedByRgb = s.claimedByRgb;
                    if (s.rewardSnapshot) {
                        item.rewardSnapshot = s.rewardSnapshot;
                    }
                } else if (s.type === "bandit_hq" || s.type === "bandit_tent") {
                    // Mostly just position and type
                } else if (s.type === "mercenary_camp") {
                    item.variantIndex = s.variantIndex;
                } else if (s.type === "castle") {
                    item.variantIndex = s.variantIndex;
                } else if (s.type === "trade_town") {
                    item.variantIndex = s.variantIndex;
                    item.tradeRatio = s.tradeRatio;
                    item.tradeResource = s.tradeResource;
                }

                return item;
            })
        };

        return JSON.stringify(state, null, 2);
    },

    async deserializeGameState(jsonString) {
        try {
            const state = JSON.parse(jsonString);
            if (!state || !state.game) throw new Error("Invalid save file format");

            console.log("[Persistence] Loading game state...", state);

            // Verify map matching
            const mapSeed = state.game.mapSeed;
            const mapWidth = state.game.mapWidth;
            const mapHeight = state.game.mapHeight;

            if (mapSeed !== undefined && mapWidth !== undefined && mapHeight !== undefined) {
                const currentMap = this.map;
                if (!currentMap || currentMap.seed !== mapSeed || currentMap.cols !== mapWidth || currentMap.rows !== mapHeight) {
                    console.log("[Persistence] Map mismatch detected. Attempting to load matching map...");
                    const { findMapInRegistry } = await import("./mapRegistry.js");
                    const matchedMap = await findMapInRegistry(mapSeed, mapWidth, mapHeight);

                    if (matchedMap) {
                        console.log(`[Persistence] Found matching map in registry: ${matchedMap.path}`);
                        await this.loadMap(matchedMap.path);
                    } else {
                        const confirmLoad = confirm("This save file was created on a different map that is not in the registry. Loading may cause issues. Continue?");
                        if (!confirmLoad) return;
                    }
                }
            }

            // Restore game settings
            this.playerCount = state.game.playerCount || 4;
            this.currentPlayerIndex = state.game.currentPlayerIndex || 0;
            this.turnCount = state.game.turnCount || 1;
            this.baseSeed = state.game.baseSeed || 1;

            // Restore players
            if (Array.isArray(state.players)) {
                this.players = state.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    rgb: p.rgb,
                    victoryPoints: p.victoryPoints || 0
                }));
            }

            // Clear existing structures
            this.structures = [];
            this.structureByCenter.clear();
            this.structureTileToCenter.clear();

            // Restore structures
            if (Array.isArray(state.structures)) {
                for (const s of state.structures) {
                    // Re-insert into viewer state
                    this.structures.push(s);
                    this.structureByCenter.set(s.centerKey, s);
                    if (Array.isArray(s.keys)) {
                        for (const k of s.keys) {
                            this.structureTileToCenter.set(k, s.centerKey);
                        }
                    }

                    // Ensure icons are loaded if needed
                    if (s.type === "outpost" || s.type === "farm") {
                        if (s.number && !this.iconCache.getIcon(s.number)) this.iconCache.loadIcon(s.number);
                        if (s.yieldResource && !this.resourceIconCache.getIcon(s.yieldResource)) this.resourceIconCache.loadIcon(s.yieldResource);
                        if (Array.isArray(s.yieldResources)) {
                            for (const res of s.yieldResources) {
                                if (!this.resourceIconCache.getIcon(res)) this.resourceIconCache.loadIcon(res);
                            }
                        }
                    }
                    if (s.type === "trade_town" && s.tradeResource) {
                        if (!this.resourceIconCache.getIcon(s.tradeResource)) this.resourceIconCache.loadIcon(s.tradeResource);
                    }
                }
            }

            // Refresh everything
            this.recomputeAllSettlementResources();
            this.recomputeAllShipRanges();
            this.updateGameUi();
            this.updateHud();
            if (typeof this.updateMinimapStructures === "function") this.updateMinimapStructures();

            const statusEl = document.getElementById("status");
            if (statusEl) {
                statusEl.textContent = "Game loaded.";
                setTimeout(() => { if (statusEl.textContent === "Game loaded.") statusEl.textContent = "Ready."; }, 3000);
            }

        } catch (err) {
            console.error("[Persistence] Load failed:", err);
            alert("Failed to load game: " + err.message);
        }
    },

    saveGameToFile() {
        const json = this.serializeGameState();
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const date = new Date().toISOString().split('T')[0];
        const time = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');

        a.href = url;
        a.download = `hex_game_${date}_${time}.json`;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);

        const statusEl = document.getElementById("status");
        if (statusEl) {
            statusEl.textContent = "Game saved.";
            setTimeout(() => { if (statusEl.textContent === "Game saved.") statusEl.textContent = "Ready."; }, 3000);
        }
    },

    handleLoadClick() {
        const input = document.getElementById("loadFileInput");
        if (input) {
            input.value = ""; // Clear to allow same file re-upload
            input.click();
        }
    },

    async handleFileChange(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            await this.deserializeGameState(event.target.result);
            this.saveToLocalStorage(); // Autosave after manual load
        };
        reader.readAsText(file);
    },

    saveToLocalStorage() {
        try {
            const json = this.serializeGameState();
            localStorage.setItem("hex_autosave", json);
            console.log("[Persistence] Game autosaved to localStorage.");
        } catch (err) {
            console.warn("[Persistence] Autosave to localStorage failed:", err);
        }
    },

    getAutoSave() {
        try {
            return localStorage.getItem("hex_autosave");
        } catch (err) {
            return null;
        }
    },

    clearAutoSave() {
        try {
            localStorage.removeItem("hex_autosave");
        } catch (err) {
            // ignore
        }
    }
};
