"use strict";

import { Camera } from "../core/camera.js";
import { TileImageCache } from "../assets/tileImageCache.js";
import { TileIconCache } from "../assets/tileIconCache.js";
import { SelectionMode } from "../game/selectionMode.js";
import { nowSec } from "../core/utils.js";

import { gameStateMethods } from "./viewer/gameState.js";
import { mapLoadingMethods } from "./viewer/mapLoading.js";
import { structuresMethods } from "./viewer/structures.js";
import { uiMethods } from "./viewer/ui.js";
import { inputMethods } from "./viewer/input.js";
import { selectionMethods } from "./viewer/selection.js";
import { numbersMethods } from "./viewer/numbers.js";
import { hudMethods } from "./viewer/hud.js";
import { renderingMethods } from "./viewer/rendering.js";
import { minimapMethods } from "./viewer/minimap.js";
import { persistenceMethods } from "./viewer/persistence.js";
import { ResourceIconCache } from "../assets/resourceIconCache.js";
import { SpriteScaler } from "../assets/spriteScaler.js";
import { WebGLTileRenderer } from "./viewer/webglRenderer.js";

export class MapViewer {
  constructor() {
    this.map = null;
    this.tiles = [];
    this.tilesByRow = [];
    this.tileByKey = new Map();

    this.cache = new TileImageCache();
    this.iconCache = new TileIconCache();
    this.resourceIconCache = new ResourceIconCache();

    this.spriteScaler = new SpriteScaler();

    this.camera = new Camera();

    // WebGL renderer for tiles
    this.webglRenderer = null;
    this.webglReady = false;

    // Hover + selection state (keep exactly like pasted behavior)
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.camStart = { x: 0, y: 0 };

    this.mouse = { x: 0, y: 0 };
    this.mouseWorld = { x: 0, y: 0 };

    this.hoverCenterKey = null;
    this.hoverKeys = new Set();
    this.selectedKeys = new Set();
    this.shipRangeKeys = new Set();
    this.castleRangeKeys = new Set();

    this.pointerDown = false;
    this.pointerDownPos = { x: 0, y: 0 };
    this.pointerMoved = false;
    this.clickMoveThresholdPx = 6;

    this.selectionMode = SelectionMode.POINT;

    this.showNumbers = true;
    this.searchQuery = "";
    this.currentOutpostVariant = 0;

    this.keys = {};


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

    // Performance optimization: cached sets
    this.promotedTiles = new Set();
    this.animatingTiles = new Set(); // Tiles currently moving/glowing

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
    this.structureSpatialIndex = new Map(); // "gridR,gridC" -> Set of structures

    this.outpostVariants = [];
    this.outpostReady = false;

    this.farmVariants = [];
    this.farmReady = false;
    this.currentFarmVariant = 0;

    this.factoryVariants = [];
    this.factoryReady = false;
    this.currentFactoryVariant = 0;

    this.portVariants = [];
    this.portReady = false;
    this.currentPortVariant = 0;

    this.ruinVariants = [];
    this.ruinReady = false;

    this.shipVariants = [];
    this.shipReady = false;
    this.currentShipVariant = 0;

    this.sunkenShipVariants = [];
    this.sunkenShipReady = false;

    this.mercenaryCampVariants = [];
    this.mercenaryCampReady = false;
    this.currentMercenaryCampVariant = 0;

    this.castleVariants = [];
    this.castleReady = false;
    this.currentCastleVariant = 0;

    this.tradeTownVariants = [];
    this.tradeTownReady = false;
    this.currentTradeTownVariant = 0;


    const loadOutpostVariants = async () => {
      const statusEl = document.getElementById("status");
      if (statusEl) statusEl.textContent = "Loading outpost variants...";

      const found = [];
      for (let i = 0; i < 4; i++) {
        const path = `./Structures/Settlements/outpost_${i}.png`;
        const img = new Image();
        img.decoding = "async";

        const success = await new Promise(resolve => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = path;
        });

        if (success) {
          found.push(img);
          console.log(`[Asset] Loaded outpost variant: ${path}`);
        } else {
          console.warn(`[Asset] Failed to load outpost variant: ${path}`);
        }
      }

      this.outpostVariants = found;
      this.outpostReady = found.length > 0;
      console.log(`[Asset] Outpost system ready. Variants found: ${found.length}`);
    };

    const loadFarmVariants = async () => {
      const statusEl = document.getElementById("status");
      if (statusEl) statusEl.textContent = "Loading farm variants...";

      const found = [];
      for (let i = 0; i < 4; i++) {
        const path = `./Structures/Settlements/farm_${i}.png`;
        const img = new Image();
        img.decoding = "async";

        const success = await new Promise(resolve => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = path;
        });

        if (success) {
          found.push(img);
          console.log(`[Asset] Loaded farm variant: ${path}`);
        } else {
          console.warn(`[Asset] Failed to load farm variant: ${path}`);
        }
      }

      this.farmVariants = found;
      this.farmReady = found.length > 0;
      console.log(`[Asset] Farm system ready. Variants found: ${found.length}`);
    };

    const loadFactoryVariants = async () => {
      const statusEl = document.getElementById("status");
      if (statusEl) statusEl.textContent = "Loading factory variants...";

      const found = [];
      for (let i = 0; i < 5; i++) {
        const path = `./Structures/Settlements/factory_${i}.png`;
        const img = new Image();
        img.decoding = "async";

        const success = await new Promise(resolve => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = path;
        });

        if (success) {
          found.push(img);
          console.log(`[Asset] Loaded factory variant: ${path}`);
        } else {
          console.warn(`[Asset] Failed to load factory variant: ${path}`);
        }
      }

      this.factoryVariants = found;
      this.factoryReady = found.length > 0;
      console.log(`[Asset] Factory system ready. Variants found: ${found.length}`);
    };

    const loadPortVariants = async () => {
      const statusEl = document.getElementById("status");
      if (statusEl) statusEl.textContent = "Loading port variants...";

      const found = [];
      for (let i = 0; i < 5; i++) {
        const path = `./Structures/Settlements/port_${i}.png`;
        const img = new Image();
        img.decoding = "async";

        const success = await new Promise(resolve => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = path;
        });

        if (success) {
          found.push(img);
          console.log(`[Asset] Loaded port variant: ${path}`);
        } else {
          console.warn(`[Asset] Failed to load port variant: ${path}`);
        }
      }

      this.portVariants = found;
      this.portReady = found.length > 0;
      console.log(`[Asset] Port system ready. Variants found: ${found.length}`);
    };

    const loadRuinVariants = async () => {
      const found = [];
      for (let i = 0; i < 9; i++) {
        const path = `./Structures/Environment/ruin_${i}.png`;
        const img = new Image();
        img.decoding = "async";

        const success = await new Promise(resolve => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = path;
        });

        if (success) {
          found.push(img);
          console.log(`[Asset] Loaded ruin variant: ${path}`);
        } else {
          console.warn(`[Asset] Failed to load ruin variant: ${path}`);
        }
      }

      this.ruinVariants = found;
      this.ruinReady = found.length > 0;
      console.log(`[Asset] Ruin system ready. Variants found: ${found.length}`);
    };

    const loadShipVariants = async () => {
      const found = [];
      for (let i = 0; i < 4; i++) {
        const path = `./Structures/Ships/ship_${i}.png`;
        const img = new Image();
        img.decoding = "async";

        const success = await new Promise(resolve => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = path;
        });

        if (success) {
          found.push(img);
          console.log(`[Asset] Loaded ship variant: ${path}`);
        } else {
          console.warn(`[Asset] Failed to load ship variant: ${path}`);
        }
      }

      this.shipVariants = found;
      this.shipReady = found.length > 0;
      console.log(`[Asset] Ship system ready. Variants found: ${found.length}`);
    };

    const loadSunkenShipVariants = async () => {
      const found = [];
      for (let i = 0; i < 6; i++) {
        const path = `./Structures/Environment/sunken_ship_${i}.png`;
        const img = new Image();
        img.decoding = "async";

        const success = await new Promise(resolve => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = path;
        });

        if (success) {
          found.push(img);
          console.log(`[Asset] Loaded sunken ship variant: ${path}`);
        } else {
          console.warn(`[Asset] Failed to load sunken ship variant: ${path}`);
        }
      }

      this.sunkenShipVariants = found;
      this.sunkenShipReady = found.length > 0;
      console.log(`[Asset] Sunken Ship system ready. Variants found: ${found.length}`);
    };

    const loadMercenaryCampVariants = async () => {
      const found = [];
      for (let i = 0; i < 4; i++) {
        const path = `./Structures/Settlements/mercenary_camp_${i}.png`;
        const img = new Image();
        img.decoding = "async";

        const success = await new Promise(resolve => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = path;
        });

        if (success) {
          found.push(img);
          console.log(`[Asset] Loaded mercenary camp variant: ${path}`);
        } else {
          console.warn(`[Asset] Failed to load mercenary camp variant: ${path}`);
        }
      }

      this.mercenaryCampVariants = found;
      this.mercenaryCampReady = found.length > 0;
      console.log(`[Asset] Mercenary Camp system ready. Variants found: ${found.length}`);
    };

    const loadCastleVariants = async () => {
      const found = [];
      for (let i = 0; i < 5; i++) {
        const path = `./Structures/Settlements/castle_${i}.png`;
        const img = new Image();
        img.decoding = "async";

        const success = await new Promise(resolve => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = path;
        });

        if (success) {
          found.push(img);
          console.log(`[Asset] Loaded castle variant: ${path}`);
        } else {
          console.warn(`[Asset] Failed to load castle variant: ${path}`);
        }
      }

      this.castleVariants = found;
      this.castleReady = found.length > 0;
      console.log(`[Asset] Castle system ready. Variants found: ${found.length}`);
    };

    const loadTradeTownVariants = async () => {
      const statusEl = document.getElementById("status");
      if (statusEl) statusEl.textContent = "Loading trade town variants...";

      const found = [];
      for (let i = 0; i < 3; i++) {
        const path = `./Structures/Settlements/trade_town_${i}.png`;
        const img = new Image();
        img.decoding = "async";

        const success = await new Promise(resolve => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = path;
        });

        if (success) {
          found.push(img);
          console.log(`[Asset] Loaded trade town variant: ${path}`);
        } else {
          console.warn(`[Asset] Failed to load trade town variant: ${path}`);
        }
      }

      this.tradeTownVariants = found;
      this.tradeTownReady = found.length > 0;
      console.log(`[Asset] Trade Town system ready. Variants found: ${found.length}`);
    };

    const initAllSettlements = async () => {
      await Promise.all([
        loadOutpostVariants(),
        loadFarmVariants(),
        loadFactoryVariants(),
        loadRuinVariants(),
        loadShipVariants(),
        loadPortVariants(),
        loadMercenaryCampVariants(),
        loadSunkenShipVariants(),
        loadCastleVariants(),
        loadTradeTownVariants()
      ]);
      const total = this.outpostVariants.length + this.farmVariants.length + this.factoryVariants.length + this.portVariants.length + this.mercenaryCampVariants.length + this.shipVariants.length + this.castleVariants.length + this.tradeTownVariants.length;

      const statusEl = document.getElementById("status");
      if (statusEl) {
        if (total > 0) {
          statusEl.textContent = `Ready. Loaded variants for Outposts, Farms, Factories, and Ports.`;
          setTimeout(() => { if (statusEl.textContent.includes("variants")) statusEl.textContent = "Ready."; }, 5000);
        } else {
          statusEl.textContent = "Error: No settlement variants found!";
        }
      }
    };

    initAllSettlements();


    // Roads
    this.activeRoadOrigin = null; // centerKey of the first click
    this.roadStartImg = new Image();
    this.roadHImg = new Image();
    this.roadBLTRImg = new Image();
    this.roadTLBRImg = new Image();

    this.roadStartImg.src = "./Structures/Roads/road_start.png";
    this.roadHImg.src = "./Structures/Roads/road_h.png";
    this.roadBLTRImg.src = "./Structures/Roads/road_bltr.png";
    this.roadTLBRImg.src = "./Structures/Roads/road_tlbr.png";

    this.roadAssetsReady = false;
    let loadedCount = 0;
    const checkReady = () => { if (++loadedCount === 4) this.roadAssetsReady = true; };
    this.roadStartImg.onload = checkReady;
    this.roadHImg.onload = checkReady;
    this.roadBLTRImg.onload = checkReady;
    this.roadTLBRImg.onload = checkReady;
    this.roadStartImg.onerror = checkReady;

    // Walls
    this.wallHImg = new Image();
    this.wallBLTRImg = new Image(); // trbl
    this.wallTLBRImg = new Image();

    this.wallHImg.src = "./Structures/Walls/wall_h.png";
    this.wallBLTRImg.src = "./Structures/Walls/wall_trbl.png";
    this.wallTLBRImg.src = "./Structures/Walls/wall_tlbr.png";

    this.wallAssetsReady = false;
    let wallLoadedCount = 0;
    const checkWallReady = () => { if (++wallLoadedCount === 3) this.wallAssetsReady = true; };
    this.wallHImg.onload = checkWallReady;
    this.wallBLTRImg.onload = checkWallReady;
    this.wallTLBRImg.onload = checkWallReady;

    // Bandit HQ
    this.banditHqImg = new Image();
    this.banditHqReady = false;
    this.banditHqImg.onload = () => {
      this.banditHqReady = true;
      console.log("[Asset] Bandit HQ image loaded.");
    };
    this.banditHqImg.onerror = () => {
      console.warn("[Asset] Failed to load bandit_hq.png at ./Structures/Settlements/bandit_hq.png");
    };
    this.banditHqImg.src = "./Structures/Settlements/bandit_hq.png";

    // Bandit Tent
    this.banditTentImg = new Image();
    this.banditTentReady = false;
    this.banditTentImg.onload = () => {
      this.banditTentReady = true;
      console.log("[Asset] Bandit Tent image loaded.");
    };
    this.banditTentImg.onerror = () => {
      console.warn("[Asset] Failed to load bandit_tent.png at ./Structures/Units/bandit_tent.png");
    };
    this.banditTentImg.src = "./Structures/Units/bandit_tent.png";
  }
}


Object.assign(
  MapViewer.prototype,
  gameStateMethods,
  mapLoadingMethods,
  structuresMethods,
  uiMethods,
  inputMethods,
  selectionMethods,
  numbersMethods,
  hudMethods,
  renderingMethods,
  minimapMethods,
  persistenceMethods
);
