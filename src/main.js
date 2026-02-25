"use strict";

import { canvas, ctx, webglCanvas } from "./core/dom.js";
import { MapViewer } from "./map/mapViewer.js";

function setCanvasSize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));

  // Update both canvases
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    webglCanvas.width = w;
    webglCanvas.height = h;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = false;
}

async function main() {
  setCanvasSize();
  window.addEventListener("resize", () => setCanvasSize());

  const viewer = new MapViewer();
  viewer.attachUi();
  viewer.attachInput();

  try {
    await viewer.loadMap();
    await viewer.initWebGL(); // Initialize WebGL renderer
  } catch (err) {
    const { statusEl } = await import("./core/dom.js");
    if (statusEl) statusEl.textContent = String(err && err.message ? err.message : err);
    console.error(err);
    return;
  }

  viewer.tick();
}

main();
