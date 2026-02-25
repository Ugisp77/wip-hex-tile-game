"use strict";

import {
  modeLabelEl,
  clearSelBtn,
  btnModePoint,
  btnModeCircle7,
  btnModeLineH,
  btnModeLineDR,
  btnModeLineDL,
  toggleNumbersEl,
  endTurnBtn,
  playersMinusBtn,
  playersPlusBtn,
  playersCountEl,
  structureOutpostBtn,
  structureFarmBtn,
  structureFactoryBtn,
  structureRoadBtn,
  structureBanditTentBtn,
  structurePortBtn,
  structureCastleBtn,
  structureTradeTownBtn,
  structureShipBtn,
  structureMercenaryCampBtn,
  structureWallBtn,
  structureDeleteBtn,
  mapSearchEl,
  mapSearchClearEl,
  saveBtn,
  loadBtn,
  chooseMapBtn,
  loadFileInput,
  autosaveModalEl,
  resumeBtn,
  startFreshBtn,
  toggleCostsBtn,
  toggleTradesBtn,
  toggleGuideBtn,
  closeCostsBtn,
  closeTradesBtn,
  closeGuideBtn,
  costsMenuEl,
  tradesMenuEl,
  guideMenuEl,
  costsListEl,
  turnPanelEl,
  structuresHudEl,
  canvas
} from "../../core/dom.js";

import { SelectionMode } from "../../game/selectionMode.js";
import { showMapSelectionPrompt } from "../../ui/turnEvents.js";
import { fetchMapMetadata } from "./mapRegistry.js";

export const uiMethods = {
  setSelectionMode(mode) {
    this.selectionMode = mode;
    this.updateModeUi();
    this.recomputeHoverShape();
    this.updateHud();
  },

  updateModeUi() {
    if (modeLabelEl) modeLabelEl.textContent = this.selectionMode;

    const all = [btnModePoint, btnModeCircle7, btnModeLineH, btnModeLineDR, btnModeLineDL].filter(Boolean);
    for (const b of all) b.classList.remove("active");

    if (this.selectionMode === SelectionMode.POINT && btnModePoint) btnModePoint.classList.add("active");
    if (this.selectionMode === SelectionMode.CIRCLE7 && btnModeCircle7) btnModeCircle7.classList.add("active");
    if (this.selectionMode === SelectionMode.LINE_H && btnModeLineH) btnModeLineH.classList.add("active");
    if (this.selectionMode === SelectionMode.LINE_DR && btnModeLineDR) btnModeLineDR.classList.add("active");
    if (this.selectionMode === SelectionMode.LINE_DL && btnModeLineDL) btnModeLineDL.classList.add("active");
  },

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

    if (structureFarmBtn) {
      structureFarmBtn.addEventListener("click", () => {
        this.setActiveStructure("farm");
      });
    }

    if (structureFactoryBtn) {
      structureFactoryBtn.addEventListener("click", () => {
        this.setActiveStructure("factory");
      });
    }

    if (structureRoadBtn) {
      structureRoadBtn.addEventListener("click", () => {
        this.setActiveStructure("road");
      });
    }

    if (structureWallBtn) {
      structureWallBtn.addEventListener("click", () => {
        this.setActiveStructure("wall");
      });
    }

    if (structureBanditTentBtn) {
      structureBanditTentBtn.addEventListener("click", () => {
        this.setActiveStructure("bandit_tent");
      });
    }

    if (structureShipBtn) {
      structureShipBtn.addEventListener("click", () => {
        this.setActiveStructure("ship");
      });
    }

    if (structurePortBtn) {
      structurePortBtn.addEventListener("click", () => {
        this.setActiveStructure("port");
      });
    }

    if (structureMercenaryCampBtn) {
      structureMercenaryCampBtn.addEventListener("click", () => {
        this.setActiveStructure("mercenary_camp");
      });
    }

    if (structureCastleBtn) {
      structureCastleBtn.addEventListener("click", () => {
        this.setActiveStructure("castle");
      });
    }

    if (structureTradeTownBtn) {
      structureTradeTownBtn.addEventListener("click", () => {
        this.setActiveStructure("trade_town");
      });
    }

    if (structureDeleteBtn) {

      structureDeleteBtn.addEventListener("click", () => {
        this.setActiveStructure("delete");
      });
    }

    if (chooseMapBtn) {
      chooseMapBtn.addEventListener("click", async () => {
        const { discoverMaps, fetchMapMetadata } = await import("./mapRegistry.js");
        const paths = await discoverMaps();
        showMapSelectionPrompt(paths, fetchMapMetadata, (selectedMap) => {
          this.loadMap(selectedMap.path);
        });
      });
    }

    if (mapSearchEl) {
      mapSearchEl.addEventListener("input", (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.updateMinimapStructures();
      });
    }

    if (mapSearchClearEl) {
      mapSearchClearEl.addEventListener("click", () => {
        if (mapSearchEl) mapSearchEl.value = "";
        this.searchQuery = "";
        this.updateMinimapStructures();
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => this.saveGameToFile());
    }

    if (loadBtn) {
      loadBtn.addEventListener("click", () => this.handleLoadClick());
    }

    if (loadFileInput) {
      loadFileInput.addEventListener("change", (e) => this.handleFileChange(e));
    }

    if (resumeBtn) {
      resumeBtn.addEventListener("click", () => {
        const json = this.getAutoSave();
        if (json) {
          this.deserializeGameState(json);
        }
        if (autosaveModalEl) autosaveModalEl.style.display = "none";
      });
    }

    if (startFreshBtn) {
      startFreshBtn.addEventListener("click", () => {
        this.clearAutoSave();
        if (autosaveModalEl) autosaveModalEl.style.display = "none";
      });
    }

    if (toggleCostsBtn) {
      toggleCostsBtn.addEventListener("click", () => this.toggleCostsMenu());
    }

    if (toggleTradesBtn) {
      toggleTradesBtn.addEventListener("click", () => this.toggleTradesMenu());
    }

    if (toggleGuideBtn) {
      toggleGuideBtn.addEventListener("click", () => this.toggleGuideMenu());
    }

    if (closeCostsBtn) {
      closeCostsBtn.addEventListener("click", () => {
        if (costsMenuEl) costsMenuEl.style.display = "none";
      });
    }

    if (closeTradesBtn) {
      closeTradesBtn.addEventListener("click", () => {
        if (tradesMenuEl) tradesMenuEl.style.display = "none";
      });
    }

    if (closeGuideBtn) {
      closeGuideBtn.addEventListener("click", () => {
        if (guideMenuEl) guideMenuEl.style.display = "none";
      });
    }

    // --- Reference Guide section collapse/expand ---
    if (guideMenuEl) {
      guideMenuEl.addEventListener("click", (e) => {
        const header = e.target.closest(".ref-section-header");
        if (!header) return;
        const section = header.closest(".ref-section");
        if (section) section.classList.toggle("collapsed");
      });
    }

    // --- Structure section collapse/expand ---
    if (structuresHudEl) {
      structuresHudEl.addEventListener("click", (e) => {
        const header = e.target.closest(".structure-section-header");
        if (!header) return;
        const section = header.closest(".structure-section");
        if (section) section.classList.toggle("collapsed");
      });
    }

    // --- Structure cost popup (delegated) ---
    if (structuresHudEl) {
      structuresHudEl.addEventListener("click", (e) => {
        const costBtn = e.target.closest(".structure-cost-btn");
        if (!costBtn) return;

        e.preventDefault();
        e.stopPropagation();

        const structureName = costBtn.getAttribute("data-structure");
        if (!structureName) return;

        // Toggle: if the same popup is already open for this button, close it
        if (this._activeCostPopup && this._activeCostPopupBtn === costBtn) {
          this._activeCostPopup.remove();
          this._activeCostPopup = null;
          this._activeCostPopupBtn = null;
          return;
        }

        // Close any existing popup
        if (this._activeCostPopup) {
          this._activeCostPopup.remove();
          this._activeCostPopup = null;
          this._activeCostPopupBtn = null;
        }

        // Show popup
        this._showCostPopup(costBtn, structureName);
      });
    }

    this.updateGameUi();
    this.updateModeUi();
  },

  async toggleCostsMenu() {
    if (!costsMenuEl) return;

    if (costsMenuEl.style.display === "none") {
      // Close other panels
      if (tradesMenuEl) tradesMenuEl.style.display = "none";
      if (guideMenuEl) guideMenuEl.style.display = "none";

      await this.loadAndShowCosts();
      costsMenuEl.style.display = "flex";
    } else {
      costsMenuEl.style.display = "none";
    }
  },

  toggleTradesMenu() {
    if (!tradesMenuEl) return;

    if (tradesMenuEl.style.display === "none") {
      // Close other panels
      if (costsMenuEl) costsMenuEl.style.display = "none";
      if (guideMenuEl) guideMenuEl.style.display = "none";

      tradesMenuEl.style.display = "flex";
    } else {
      tradesMenuEl.style.display = "none";
    }
  },

  toggleGuideMenu() {
    if (!guideMenuEl) return;

    if (guideMenuEl.style.display === "none") {
      // Close other panels
      if (costsMenuEl) costsMenuEl.style.display = "none";
      if (tradesMenuEl) tradesMenuEl.style.display = "none";

      guideMenuEl.style.display = "flex";
    } else {
      guideMenuEl.style.display = "none";
    }
  },

  async _showCostPopup(anchorBtn, structureName) {
    const resMap = {
      timber: "timber.png",
      clay: "brick.png",
      sheep: "livestock.png",
      grain: "grain.png",
      ore: "ore.png",
      spices: "spices.png",
      herbs: "herbs.png",
      furs: "furs.png"
    };

    // Cache the building costs data
    if (!this._buildingCostsCache) {
      try {
        const response = await fetch("./buildingCosts.json");
        this._buildingCostsCache = await response.json();
      } catch (err) {
        console.error("Failed to load building costs:", err);
        return;
      }
    }

    // Find the matching structure across all sections
    let costs = null;
    for (const section of this._buildingCostsCache) {
      for (const item of section.items) {
        if (item.name === structureName) {
          costs = item.costs;
          break;
        }
      }
      if (costs) break;
    }

    if (!costs) return;

    // Build the popup
    const popup = document.createElement("div");
    popup.className = "structure-cost-popup";

    const title = document.createElement("div");
    title.className = "popup-title";
    title.textContent = structureName;
    popup.appendChild(title);

    const resourcesEl = document.createElement("div");
    resourcesEl.className = "cost-resources";

    for (const [res, amount] of Object.entries(costs)) {
      const badgeEl = document.createElement("div");
      badgeEl.className = "cost-badge";

      const iconEl = document.createElement("img");
      iconEl.className = "cost-resource-icon";
      const iconFile = resMap[res] || `${res}.png`;
      iconEl.src = `./Tile_icons/resources/${iconFile}`;
      iconEl.alt = res;

      const textEl = document.createElement("span");
      textEl.textContent = amount;

      badgeEl.appendChild(iconEl);
      badgeEl.appendChild(textEl);
      resourcesEl.appendChild(badgeEl);
    }

    popup.appendChild(resourcesEl);

    // Append to body so it's not clipped by the HUD overflow
    document.body.appendChild(popup);

    // Position: to the left of the structures HUD, vertically aligned with the button
    const hudRect = structuresHudEl.getBoundingClientRect();
    const btnRect = anchorBtn.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();

    const left = hudRect.left - popupRect.width - 10;
    const top = btnRect.top + btnRect.height / 2 - 18; // align arrow with button center

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    this._activeCostPopup = popup;
    this._activeCostPopupBtn = anchorBtn;
  },

  updateDynamicLayout() {
    if (!canvas) return;
    const availableTotalH = canvas.clientHeight;

    // Minimap boundary (relative to canvas top)
    const minimapRect = this._minimapRect;
    const minimapTop = minimapRect ? minimapRect.y : availableTotalH - 14;

    // Left side panels (Turn & Costs)
    // Start at top: 14px. Max height should be space above minimap minus gap.
    const availableLeftH = minimapTop - 14 - 14;

    if (turnPanelEl) {
      turnPanelEl.style.maxHeight = `${availableLeftH}px`;
    }

    if (costsMenuEl) {
      costsMenuEl.style.maxHeight = `${availableLeftH}px`;
    }

    if (tradesMenuEl) {
      tradesMenuEl.style.maxHeight = `${availableLeftH}px`;
    }

    if (guideMenuEl) {
      guideMenuEl.style.maxHeight = `${availableLeftH}px`;
    }

    // Right side panel (Structures)
    // Starts at top: 14px. Max height should be total height minus margin.
    if (structuresHudEl) {
      const availableRightH = availableTotalH - 14 - 14;
      structuresHudEl.style.maxHeight = `${availableRightH}px`;
    }
  },

  async loadAndShowCosts() {
    if (!costsListEl) return;

    const resMap = {
      timber: "timber.png",
      clay: "brick.png",
      sheep: "livestock.png",
      grain: "grain.png",
      ore: "ore.png",
      spices: "spices.png",
      herbs: "herbs.png",
      furs: "furs.png"
    };

    try {
      const response = await fetch("./buildingCosts.json");
      const sections = await response.json();

      costsListEl.innerHTML = "";

      for (const sectionData of sections) {
        const sectionEl = document.createElement("div");
        sectionEl.className = "cost-section";

        const sectionHeader = document.createElement("div");
        sectionHeader.className = "cost-section-header";

        const sectionTitle = document.createElement("span");
        sectionTitle.className = "cost-section-title";
        sectionTitle.textContent = sectionData.section;

        const sectionToggle = document.createElement("span");
        sectionToggle.className = "cost-section-toggle";

        sectionHeader.appendChild(sectionTitle);
        sectionHeader.appendChild(sectionToggle);
        sectionEl.appendChild(sectionHeader);

        const sectionBody = document.createElement("div");
        sectionBody.className = "cost-section-body";

        for (const item of sectionData.items) {
          const itemEl = document.createElement("div");
          itemEl.className = "cost-item";

          const headerEl = document.createElement("div");
          headerEl.className = "cost-item-header";
          headerEl.textContent = item.name;
          itemEl.appendChild(headerEl);

          const resourcesEl = document.createElement("div");
          resourcesEl.className = "cost-resources";

          for (const [res, amount] of Object.entries(item.costs)) {
            const badgeEl = document.createElement("div");
            badgeEl.className = "cost-badge";

            const iconEl = document.createElement("img");
            iconEl.className = "cost-resource-icon";
            const iconFile = resMap[res] || `${res}.png`;
            iconEl.src = `./Tile_icons/resources/${iconFile}`;
            iconEl.alt = res;

            const textEl = document.createElement("span");
            textEl.textContent = amount;

            badgeEl.appendChild(iconEl);
            badgeEl.appendChild(textEl);
            resourcesEl.appendChild(badgeEl);
          }

          itemEl.appendChild(resourcesEl);
          sectionBody.appendChild(itemEl);
        }

        sectionEl.appendChild(sectionBody);
        costsListEl.appendChild(sectionEl);

        sectionHeader.addEventListener("click", () => {
          sectionEl.classList.toggle("collapsed");
        });
      }
    } catch (err) {
      console.error("Failed to load building costs:", err);
      costsListEl.textContent = "Error loading costs.";
    }
  },

  _clearAllStructureHighlights() {
    const btns = [
      structureOutpostBtn, structureFarmBtn, structureFactoryBtn,
      structureRoadBtn, structureWallBtn, structureBanditTentBtn,
      structurePortBtn, structureCastleBtn, structureTradeTownBtn, structureShipBtn, structureMercenaryCampBtn,
      structureDeleteBtn
    ];
    for (const b of btns) {
      if (b) b.classList.remove("active");
    }
  },

  setActiveStructure(type) {
    if (this.activeStructure === type || type === null) {
      if (this.activeStructure === null && type === null) return;

      this.activeStructure = null;
      this.activeRoadOrigin = null;

      if (this._prevSelectionMode) {
        this.selectionMode = this._prevSelectionMode;
        this._prevSelectionMode = null;
        this.updateModeUi();
        this.recomputeHoverShape();
        this.updateHud();
        this.clearShipRange(true);
      }

      this._clearAllStructureHighlights();
      this.clearShipRange(true);
      return;
    }

    this.activeStructure = type;
    this.activeRoadOrigin = null;

    this._clearAllStructureHighlights();

    if (type === "outpost") {
      this.clearShipRange(true);
      if (!this._prevSelectionMode) this._prevSelectionMode = this.selectionMode;

      if (this.selectionMode !== SelectionMode.CIRCLE7) {
        this.selectionMode = SelectionMode.CIRCLE7;
        this.updateModeUi();
        this.recomputeHoverShape();
        this.updateHud();
      }

      if (structureOutpostBtn) structureOutpostBtn.classList.add("active");

    } else if (type === "farm") {
      this.clearShipRange(true);
      if (!this._prevSelectionMode) this._prevSelectionMode = this.selectionMode;

      if (this.selectionMode !== SelectionMode.CIRCLE7) {
        this.selectionMode = SelectionMode.CIRCLE7;
        this.updateModeUi();
        this.recomputeHoverShape();
        this.updateHud();
      }

      if (structureFarmBtn) structureFarmBtn.classList.add("active");
    } else if (type === "factory") {
      this.clearShipRange(true);
      if (!this._prevSelectionMode) this._prevSelectionMode = this.selectionMode;

      if (this.selectionMode !== SelectionMode.CIRCLE7) {
        this.selectionMode = SelectionMode.CIRCLE7;
        this.updateModeUi();
        this.recomputeHoverShape();
        this.updateHud();
      }

      if (structureFactoryBtn) structureFactoryBtn.classList.add("active");
    } else if (type === "road") {
      this.clearShipRange(true);
      if (!this._prevSelectionMode) this._prevSelectionMode = this.selectionMode;

      if (this.selectionMode !== SelectionMode.ROAD) {
        this.selectionMode = SelectionMode.ROAD;
        this.updateModeUi();
        this.recomputeHoverShape();
        this.updateHud();
      }

      if (structureRoadBtn) structureRoadBtn.classList.add("active");
    } else if (type === "wall") {
      this.clearShipRange(true);
      if (!this._prevSelectionMode) this._prevSelectionMode = this.selectionMode;

      if (this.selectionMode !== SelectionMode.WALL) {
        this.selectionMode = SelectionMode.WALL;
        this.updateModeUi();
        this.recomputeHoverShape();
        this.updateHud();
      }

      if (structureWallBtn) structureWallBtn.classList.add("active");
    } else if (type === "bandit_tent") {
      this.clearShipRange(true);
      if (!this._prevSelectionMode) this._prevSelectionMode = this.selectionMode;

      if (this.selectionMode !== SelectionMode.POINT) {
        this.selectionMode = SelectionMode.POINT;
        this.updateModeUi();
        this.recomputeHoverShape();
        this.updateHud();
      }

      if (structureBanditTentBtn) structureBanditTentBtn.classList.add("active");
    } else if (type === "delete") {
      this.clearShipRange(true);
      if (!this._prevSelectionMode) this._prevSelectionMode = this.selectionMode;

      if (this.selectionMode !== SelectionMode.POINT) {
        this.selectionMode = SelectionMode.POINT;
        this.updateModeUi();
        this.recomputeHoverShape();
        this.updateHud();
      }

      if (structureDeleteBtn) structureDeleteBtn.classList.add("active");
    } else if (type === "ship") {
      if (!this._prevSelectionMode) this._prevSelectionMode = this.selectionMode;

      if (this.selectionMode !== SelectionMode.CIRCLE7) {
        this.selectionMode = SelectionMode.CIRCLE7;
        this.updateModeUi();
        this.recomputeHoverShape();
        this.updateHud();
      }

      if (structureShipBtn) structureShipBtn.classList.add("active");
    } else if (type === "port") {
      this.clearShipRange(true);
      if (!this._prevSelectionMode) this._prevSelectionMode = this.selectionMode;

      if (this.selectionMode !== SelectionMode.CIRCLE7) {
        this.selectionMode = SelectionMode.CIRCLE7;
        this.updateModeUi();
        this.recomputeHoverShape();
        this.updateHud();
      }

      if (structurePortBtn) structurePortBtn.classList.add("active");
    } else if (type === "mercenary_camp") {
      this.clearShipRange(true);
      if (!this._prevSelectionMode) this._prevSelectionMode = this.selectionMode;

      if (this.selectionMode !== SelectionMode.CIRCLE7) {
        this.selectionMode = SelectionMode.CIRCLE7;
        this.updateModeUi();
        this.recomputeHoverShape();
        this.updateHud();
      }

      if (structureMercenaryCampBtn) structureMercenaryCampBtn.classList.add("active");
    } else if (type === "castle") {
      this.clearShipRange(true);
      if (!this._prevSelectionMode) this._prevSelectionMode = this.selectionMode;

      if (this.selectionMode !== SelectionMode.CIRCLE7) {
        this.selectionMode = SelectionMode.CIRCLE7;
        this.updateModeUi();
        this.recomputeHoverShape();
        this.updateHud();
      }

      if (structureCastleBtn) structureCastleBtn.classList.add("active");
    } else if (type === "trade_town") {
      this.clearShipRange(true);
      if (!this._prevSelectionMode) this._prevSelectionMode = this.selectionMode;

      if (this.selectionMode !== SelectionMode.CIRCLE7) {
        this.selectionMode = SelectionMode.CIRCLE7;
        this.updateModeUi();
        this.recomputeHoverShape();
        this.updateHud();
      }

      if (structureTradeTownBtn) structureTradeTownBtn.classList.add("active");
    }
  }
};
