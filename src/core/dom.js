"use strict";

export const canvas = document.getElementById("canvas");
export const ctx = canvas.getContext("2d", { alpha: true });

// WebGL canvas for tile rendering (below 2D canvas)
export const webglCanvas = document.getElementById("webglCanvas");

ctx.imageSmoothingEnabled = false;

export const statusEl = document.getElementById("status");
export const zoomLabelEl = document.getElementById("zoomLabel");
export const hoverLabelEl = document.getElementById("hoverLabel");
export const resetBtn = document.getElementById("resetBtn");

export const modeLabelEl = document.getElementById("modeLabel");
export const clearSelBtn = document.getElementById("clearSelBtn");

export const btnModePoint = document.getElementById("modePoint");
export const btnModeCircle7 = document.getElementById("modeCircle7");
export const btnModeLineH = document.getElementById("modeLineH");
export const btnModeLineDR = document.getElementById("modeLineDR");
export const btnModeLineDL = document.getElementById("modeLineDL");

export const toggleNumbersEl = document.getElementById("toggleNumbers");

// Game UI
export const turnCountLabelEl = document.getElementById("turnCountLabel");
export const turnPlayerLabelEl = document.getElementById("turnPlayerLabel");
export const playerListEl = document.getElementById("playerList");
export const endTurnBtn = document.getElementById("endTurnBtn");
export const turnPanelEl = document.getElementById("turnPanel");
export const structuresHudEl = document.getElementById("structuresHud");

export const playersMinusBtn = document.getElementById("playersMinus");
export const playersPlusBtn = document.getElementById("playersPlus");
export const playersCountEl = document.getElementById("playersCount");
export const structureOutpostBtn = document.getElementById("structureOutpostBtn");
export const structureFarmBtn = document.getElementById("structureFarmBtn");
export const structureFactoryBtn = document.getElementById("structureFactoryBtn");
export const structureRoadBtn = document.getElementById("structureRoadBtn");
export const structureWallBtn = document.getElementById("structureWallBtn");
export const structureBanditTentBtn = document.getElementById("structureBanditTentBtn");
export const structurePortBtn = document.getElementById("structurePortBtn");
export const structureCastleBtn = document.getElementById("structureCastleBtn");
export const structureTradeTownBtn = document.getElementById("structureTradeTownBtn");

export const structureShipBtn = document.getElementById("structureShipBtn");
export const structureMercenaryCampBtn = document.getElementById("structureMercenaryCampBtn");


export const structureDeleteBtn = document.getElementById("structureDeleteBtn");
export const mapSearchEl = document.getElementById("mapSearch");
export const mapSearchClearEl = document.getElementById("mapSearchClear");

// Persistence
export const chooseMapBtn = document.getElementById("chooseMapBtn");
export const saveBtn = document.getElementById("saveBtn");
export const loadBtn = document.getElementById("loadBtn");
export const loadFileInput = document.getElementById("loadFileInput");

// Autosave Modal
export const autosaveModalEl = document.getElementById("autosaveModal");
export const resumeBtn = document.getElementById("resumeBtn");
export const startFreshBtn = document.getElementById("startFreshBtn");
export const toggleCostsBtn = document.getElementById("toggleCostsBtn");
export const toggleTradesBtn = document.getElementById("toggleTradesBtn");
export const toggleGuideBtn = document.getElementById("toggleGuideBtn");
export const closeCostsBtn = document.getElementById("closeCostsBtn");
export const closeTradesBtn = document.getElementById("closeTradesBtn");
export const closeGuideBtn = document.getElementById("closeGuideBtn");
export const costsMenuEl = document.getElementById("costsMenu");
export const tradesMenuEl = document.getElementById("tradesMenu");
export const guideMenuEl = document.getElementById("guideMenu");
export const costsListEl = document.getElementById("costsList");
