"use strict";

// options: array of resource keys, example ["ore","grain"]
// iconCache: ResourceIconCache instance
// counts: object map resourceKey -> count (optional)
// onHover: (resourceKey|null) => void
// onPick: (resourceKey) => void
export function showResourceChoice(options, iconCache, counts, onHover, onPick, titleText) {
  closeResourceChoice();

  const norm = (k) => String(k || "").toLowerCase();

  const overlay = document.createElement("div");
  overlay.id = "resource-choice-overlay";
  overlay.style.position = "fixed";
  overlay.style.left = "0";
  overlay.style.top = "0";
  overlay.style.right = "0";
  overlay.style.bottom = "0";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.background = "rgba(0,0,0,0.35)";
  overlay.style.zIndex = "9999";

  const panel = document.createElement("div");
  panel.id = "resource-choice-panel";
  panel.style.background = "rgba(18,18,20,0.95)";
  panel.style.border = "1px solid rgba(255,255,255,0.15)";
  panel.style.borderRadius = "10px";
  panel.style.padding = "12px";
  panel.style.minWidth = "260px";
  panel.style.maxWidth = "520px";
  panel.style.boxShadow = "0 8px 32px rgba(0,0,0,0.35)";
  panel.style.color = "white";
  panel.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";

  const title = document.createElement("div");
  title.textContent = titleText || "Choose outpost yield";
  title.style.fontWeight = "600";
  title.style.marginBottom = "8px";
  panel.appendChild(title);

  const hint = document.createElement("div");
  hint.textContent = "Tie detected. Pick which resource this outpost produces.";
  hint.style.opacity = "0.85";
  hint.style.fontSize = "12px";
  hint.style.marginBottom = "10px";
  panel.appendChild(hint);

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "10px";
  row.style.flexWrap = "wrap";
  panel.appendChild(row);

  const xGlyph = new Image();
  xGlyph.decoding = "async";
  xGlyph.loading = "eager";
  xGlyph.src = "./Tile_icons/x.png";

  const makeDigitImg = (digit) => {
    const img = document.createElement("img");
    img.alt = String(digit);
    img.width = 18;
    img.height = 18;
    img.style.imageRendering = "pixelated";
    img.style.display = "block";
    img.src = `./Tile_icons/${digit}.png`;
    return img;
  };

  const makeXImg = () => {
    const img = document.createElement("img");
    img.alt = "x";
    img.width = 18;
    img.height = 18;
    img.style.imageRendering = "pixelated";
    img.style.display = "block";
    img.src = xGlyph.src;
    return img;
  };

  for (const raw of options) {
    const key = norm(raw);
    if (!key) continue;

    if (!iconCache.getIcon(key)) iconCache.loadIcon(key);

    const card = document.createElement("div");
    card.style.display = "flex";
    card.style.alignItems = "center";
    card.style.gap = "10px";
    card.style.padding = "10px 12px";
    card.style.borderRadius = "10px";
    card.style.cursor = "pointer";
    card.style.userSelect = "none";
    card.style.border = "1px solid rgba(255,255,255,0.18)";
    card.style.background = "rgba(255,255,255,0.06)";

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.alignItems = "center";
    left.style.gap = "8px";
    card.appendChild(left);

    const resImg = document.createElement("img");
    resImg.alt = key;
    resImg.width = 22;
    resImg.height = 22;
    resImg.style.imageRendering = "pixelated";
    resImg.style.display = "block";
    const icon = iconCache.getIcon(key);
    if (icon) resImg.src = icon.src;
    else resImg.src = `./Tile_icons/resources/${key}.png`;
    left.appendChild(resImg);

    const label = document.createElement("div");
    label.textContent = key;
    label.style.fontSize = "13px";
    label.style.textTransform = "capitalize";
    left.appendChild(label);

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.alignItems = "center";
    right.style.gap = "2px";
    right.style.marginLeft = "6px";
    right.style.opacity = "0.95";
    card.appendChild(right);

    const cnt = counts && counts[key] ? (counts[key] | 0) : 0;

    if (cnt > 1) {
      right.appendChild(makeXImg());

      const digits = String(cnt).split("");
      for (const ch of digits) {
        const d = ch.charCodeAt(0) - 48;
        if (d < 0 || d > 9) continue;
        right.appendChild(makeDigitImg(d));
      }
    } else if (cnt === 1) {
      // Optional: show x1. If you prefer no multiplier for 1, remove this block.
      right.appendChild(makeXImg());
      right.appendChild(makeDigitImg(1));
    }

    card.addEventListener("mouseenter", () => {
      card.style.background = "rgba(255,255,255,0.12)";
      card.style.border = "1px solid rgba(255,255,255,0.35)";
      if (onHover) onHover(key);
    });

    card.addEventListener("mouseleave", () => {
      card.style.background = "rgba(255,255,255,0.06)";
      card.style.border = "1px solid rgba(255,255,255,0.18)";
      if (onHover) onHover(null);
    });

    card.addEventListener("click", () => {
      if (onPick) onPick(key);
      closeResourceChoice();
    });

    row.appendChild(card);
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      // No dismiss by clicking outside, player must choose.
    }
  });

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

export function closeResourceChoice() {
  const el = document.getElementById("resource-choice-overlay");
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

/**
 * Show a multi-select resource picker. The player must pick exactly `pickCount` resources.
 * @param {string[]} options  – resource keys to choose from
 * @param {object}   iconCache
 * @param {object}   counts   – resourceKey -> count
 * @param {number}   pickCount – how many to pick (e.g. 2)
 * @param {function} onPick   – called with array of picked resource keys
 * @param {string}   [titleText]
 */
export function showResourceChoiceMulti(options, iconCache, counts, pickCount, onPick, titleText) {
  closeResourceChoice();

  const norm = (k) => String(k || "").toLowerCase();
  const selected = new Set();

  const overlay = document.createElement("div");
  overlay.id = "resource-choice-overlay";
  overlay.style.position = "fixed";
  overlay.style.left = "0";
  overlay.style.top = "0";
  overlay.style.right = "0";
  overlay.style.bottom = "0";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.background = "rgba(0,0,0,0.35)";
  overlay.style.zIndex = "9999";

  const panel = document.createElement("div");
  panel.id = "resource-choice-panel";
  panel.style.background = "rgba(18,18,20,0.95)";
  panel.style.border = "1px solid rgba(255,255,255,0.15)";
  panel.style.borderRadius = "10px";
  panel.style.padding = "12px";
  panel.style.minWidth = "260px";
  panel.style.maxWidth = "520px";
  panel.style.boxShadow = "0 8px 32px rgba(0,0,0,0.35)";
  panel.style.color = "white";
  panel.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";

  const title = document.createElement("div");
  title.textContent = titleText || `Choose ${pickCount} resources`;
  title.style.fontWeight = "600";
  title.style.marginBottom = "8px";
  panel.appendChild(title);

  const hint = document.createElement("div");
  hint.textContent = `Tie detected. Pick ${pickCount} resources for this farm to produce.`;
  hint.style.opacity = "0.85";
  hint.style.fontSize = "12px";
  hint.style.marginBottom = "10px";
  panel.appendChild(hint);

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "10px";
  row.style.flexWrap = "wrap";
  panel.appendChild(row);

  const xGlyph = new Image();
  xGlyph.decoding = "async";
  xGlyph.loading = "eager";
  xGlyph.src = "./Tile_icons/x.png";

  const makeDigitImg = (digit) => {
    const img = document.createElement("img");
    img.alt = String(digit);
    img.width = 18;
    img.height = 18;
    img.style.imageRendering = "pixelated";
    img.style.display = "block";
    img.src = `./Tile_icons/${digit}.png`;
    return img;
  };

  const makeXImg = () => {
    const img = document.createElement("img");
    img.alt = "x";
    img.width = 18;
    img.height = 18;
    img.style.imageRendering = "pixelated";
    img.style.display = "block";
    img.src = xGlyph.src;
    return img;
  };

  // Confirm button (starts disabled)
  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = `Confirm (0/${pickCount})`;
  confirmBtn.style.marginTop = "10px";
  confirmBtn.style.padding = "8px 20px";
  confirmBtn.style.borderRadius = "8px";
  confirmBtn.style.border = "1px solid rgba(255,255,255,0.2)";
  confirmBtn.style.background = "rgba(255,255,255,0.08)";
  confirmBtn.style.color = "rgba(255,255,255,0.4)";
  confirmBtn.style.cursor = "not-allowed";
  confirmBtn.style.fontWeight = "600";
  confirmBtn.style.fontSize = "13px";
  confirmBtn.disabled = true;

  const cards = [];

  const updateUI = () => {
    const ready = selected.size === pickCount;
    confirmBtn.disabled = !ready;
    confirmBtn.textContent = `Confirm (${selected.size}/${pickCount})`;
    if (ready) {
      confirmBtn.style.background = "rgba(80,200,120,0.25)";
      confirmBtn.style.border = "1px solid rgba(80,200,120,0.6)";
      confirmBtn.style.color = "white";
      confirmBtn.style.cursor = "pointer";
    } else {
      confirmBtn.style.background = "rgba(255,255,255,0.08)";
      confirmBtn.style.border = "1px solid rgba(255,255,255,0.2)";
      confirmBtn.style.color = "rgba(255,255,255,0.4)";
      confirmBtn.style.cursor = "not-allowed";
    }
    for (const c of cards) {
      if (selected.has(c._resKey)) {
        c.style.background = "rgba(80,200,120,0.18)";
        c.style.border = "1px solid rgba(80,200,120,0.6)";
      } else {
        c.style.background = "rgba(255,255,255,0.06)";
        c.style.border = "1px solid rgba(255,255,255,0.18)";
      }
    }
  };

  for (const raw of options) {
    const key = norm(raw);
    if (!key) continue;

    if (!iconCache.getIcon(key)) iconCache.loadIcon(key);

    const card = document.createElement("div");
    card._resKey = key;
    card.style.display = "flex";
    card.style.alignItems = "center";
    card.style.gap = "10px";
    card.style.padding = "10px 12px";
    card.style.borderRadius = "10px";
    card.style.cursor = "pointer";
    card.style.userSelect = "none";
    card.style.border = "1px solid rgba(255,255,255,0.18)";
    card.style.background = "rgba(255,255,255,0.06)";

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.alignItems = "center";
    left.style.gap = "8px";
    card.appendChild(left);

    const resImg = document.createElement("img");
    resImg.alt = key;
    resImg.width = 22;
    resImg.height = 22;
    resImg.style.imageRendering = "pixelated";
    resImg.style.display = "block";
    const icon = iconCache.getIcon(key);
    if (icon) resImg.src = icon.src;
    else resImg.src = `./Tile_icons/resources/${key}.png`;
    left.appendChild(resImg);

    const label = document.createElement("div");
    label.textContent = key;
    label.style.fontSize = "13px";
    label.style.textTransform = "capitalize";
    left.appendChild(label);

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.alignItems = "center";
    right.style.gap = "2px";
    right.style.marginLeft = "6px";
    right.style.opacity = "0.95";
    card.appendChild(right);

    const cnt = counts && counts[key] ? (counts[key] | 0) : 0;
    if (cnt > 1) {
      right.appendChild(makeXImg());
      const digits = String(cnt).split("");
      for (const ch of digits) {
        const d = ch.charCodeAt(0) - 48;
        if (d < 0 || d > 9) continue;
        right.appendChild(makeDigitImg(d));
      }
    } else if (cnt === 1) {
      right.appendChild(makeXImg());
      right.appendChild(makeDigitImg(1));
    }

    card.addEventListener("click", () => {
      if (selected.has(key)) {
        selected.delete(key);
      } else if (selected.size < pickCount) {
        selected.add(key);
      }
      updateUI();
    });

    cards.push(card);
    row.appendChild(card);
  }

  confirmBtn.addEventListener("click", () => {
    if (selected.size !== pickCount) return;
    if (onPick) onPick([...selected]);
    closeResourceChoice();
  });

  panel.appendChild(confirmBtn);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      // No dismiss by clicking outside, player must choose.
    }
  });

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}
