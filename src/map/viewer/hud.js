"use strict";

import { zoomLabelEl, hoverLabelEl } from "../../core/dom.js";

export const hudMethods = {
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

    this.updateDynamicLayout();
  }
};
