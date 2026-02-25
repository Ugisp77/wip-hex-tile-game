"use strict";

import {
  turnCountLabelEl,
  turnPlayerLabelEl,
  playerListEl,
  playersCountEl
} from "../../core/dom.js";

import {
  clamp,
  makePlayerColors,
  rgbToCss
} from "../../core/utils.js";

export const gameStateMethods = {
  resetPlayers(count) {
    const n = Math.max(1, Math.min(10, Math.floor(count)));
    this.playerCount = n;
    this.players = makePlayerColors(n).map((p, idx) => {
      return { id: idx, name: p.name, rgb: p.rgb, victoryPoints: 0 };
    });
    this.currentPlayerIndex = 0;
    this.turnCount = 1;
    this.updateGameUi();
    this.saveToLocalStorage(); // Ensure player count is saved

    // Debounce re-spawning bandits and ruins if tiles are loaded
    // This allows rapid clicking/sliding of player count without chugging
    if (this._respawnDebounceTimer) clearTimeout(this._respawnDebounceTimer);
    this._respawnDebounceTimer = setTimeout(() => {
      if (this.tiles && this.tiles.length > 0) {
        const t0 = performance.now();
        // Split work across frames to avoid a single long blocking call
        if (typeof this._spawnBandits === "function") this._spawnBandits();
        console.log(`[Perf] _spawnBandits took ${(performance.now() - t0).toFixed(1)}ms`);
        requestAnimationFrame(() => {
          const t1 = performance.now();
          if (typeof this._spawnRuins === "function") this._spawnRuins();
          console.log(`[Perf] _spawnRuins took ${(performance.now() - t1).toFixed(1)}ms`);
        });
      }
      this._respawnDebounceTimer = null;
    }, 150);
  },

  getCurrentPlayer() {
    if (!this.players.length) return { id: 0, name: "Player 1", rgb: [40, 120, 255] };
    return this.players[clamp(this.currentPlayerIndex, 0, this.players.length - 1)];
  },

  async endTurn() {
    if (!this.players.length) return;

    // Trigger Roll Phase for the NEXT turn (or current turn transition)
    // The prompt asks for the roll that just happened or is happening.
    const { showRollPrompt, showResourceSummary, showBanditTentPrompt } = await import("../../ui/turnEvents.js");

    showRollPrompt((roll) => {
      const finalizeTurn = () => {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.turnCount += 1;
        this.selectedKeys.clear();
        this.setActiveStructure(null);
        this.updateHud();
        this.updateGameUi();
        this.saveToLocalStorage();
      };

      const yields = this.calculateResourcesForRoll(roll);
      const hasYields = (yields && yields.size > 0);

      if (roll === 7) {
        // On a 7, the NEXT player moves a bandit tent
        const nextIdx = (this.currentPlayerIndex + 1) % this.players.length;
        const cur = this.players[nextIdx];
        const showBandit = () => {
          showBanditTentPrompt(cur, () => {
            this.setActiveStructure("bandit_tent");
            finalizeTurn();
          });
        };

        if (hasYields) {
          showResourceSummary(yields, this.players, this.resourceIconCache, showBandit);
        } else {
          showBandit();
        }
      } else {
        showResourceSummary(yields, this.players, this.resourceIconCache, finalizeTurn);
      }
    }, () => {
      // Skip roll — just advance the turn
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      this.turnCount += 1;
      this.selectedKeys.clear();
      this.setActiveStructure(null);
      this.updateHud();
      this.updateGameUi();
      this.saveToLocalStorage();
    });
  },

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

        // Victory Points controls
        const vpGroup = document.createElement("div");
        vpGroup.className = "player-vp-group";

        const vpMinus = document.createElement("button");
        vpMinus.className = "vp-btn";
        vpMinus.textContent = "−";
        vpMinus.onclick = (e) => {
          e.stopPropagation();
          p.victoryPoints = Math.max(0, (p.victoryPoints || 0) - 1);
          this.updateGameUi();
        };

        const vpLabel = document.createElement("div");
        vpLabel.className = "player-vp";
        vpLabel.textContent = `⭐ ${p.victoryPoints || 0}`;

        const vpPlus = document.createElement("button");
        vpPlus.className = "vp-btn";
        vpPlus.textContent = "+";
        vpPlus.onclick = (e) => {
          e.stopPropagation();
          p.victoryPoints = (p.victoryPoints || 0) + 1;
          this.updateGameUi();
        };

        vpGroup.appendChild(vpMinus);
        vpGroup.appendChild(vpLabel);
        vpGroup.appendChild(vpPlus);
        chip.appendChild(vpGroup);

        playerListEl.appendChild(chip);
      }
    }
  }
};
