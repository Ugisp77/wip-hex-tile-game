"use strict";

import { canvas, resetBtn } from "../../core/dom.js";

export const inputMethods = {
  attachInput() {
    canvas.addEventListener("mousedown", (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // Check if click is inside the minimap
      if (typeof this.minimapHitTest === "function" && this.minimapHitTest(sx, sy)) {
        this._minimapDragging = true;
        this.minimapNavigateTo(sx, sy);
        return; // Don't start normal map drag
      }

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
      this._minimapDragging = false;
    });

    window.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      this.mouse.x = sx;
      this.mouse.y = sy;

      // If dragging on minimap, navigate instead of panning
      if (this._minimapDragging) {
        this.minimapNavigateTo(sx, sy);
        return;
      }

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
      const scaleFactor = delta > 0 ? 1.15 : 1 / 1.15;

      // Zoom from window center when mouse is over the minimap
      const overMinimap = typeof this.minimapHitTest === "function" && this.minimapHitTest(mx, my);
      const zx = overMinimap ? rect.width / 2 : mx;
      const zy = overMinimap ? rect.height / 2 : my;

      this.camera.zoomOriginX = zx;
      this.camera.zoomOriginY = zy;
      this.camera.targetScale = Math.min(Math.max(this.camera.targetScale * scaleFactor, this.camera.minScale), this.camera.maxScale);

      // HUD and hover updates will be handled by the tick loop as the scale changes
    }, { passive: false });

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.resetView();
      });
    }

    window.addEventListener("resize", () => {
      this.resetView();
    });

    window.addEventListener("keydown", (e) => {
      this.keys[e.key] = true;

      if (e.key === "Enter") {
        if (typeof this.endTurn === "function") this.endTurn();
        e.preventDefault();
      }

      // Prevent default for movement/zoom keys to avoid page scrolling
      const handled = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", ",", "."].includes(e.key);
      if (handled) e.preventDefault();
    });

    window.addEventListener("keyup", (e) => {
      this.keys[e.key] = false;
    });
  }
};
