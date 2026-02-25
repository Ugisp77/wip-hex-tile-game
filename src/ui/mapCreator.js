"use strict";

import { tileNameToColor } from "../map/viewer/colors.js";

/* ─── Default slider config ─── */
const TERRAIN_CONTROLS = [
    { key: "landmassSize", label: "Landmass Size", min: 0, max: 1, step: 0.01, value: 0.52, labelLow: "Small", labelHigh: "Large" },
    { key: "continents", label: "Continents", min: 0, max: 1, step: 0.01, value: 0.46, labelLow: "Many Small", labelHigh: "Few Large" },
    { key: "mountains", label: "Mountains", min: 0, max: 1, step: 0.01, value: 0.50, labelLow: "None", labelHigh: "Lots" },
    { key: "hills", label: "Hills", min: 0, max: 1, step: 0.01, value: 0.50, labelLow: "None", labelHigh: "Lots" },
    { key: "forests", label: "Forests", min: 0, max: 1, step: 0.01, value: 0.50, labelLow: "Sparse", labelHigh: "Dense" },
    { key: "deserts", label: "Deserts", min: 0, max: 1, step: 0.01, value: 0.30, labelLow: "None", labelHigh: "Lots" },
];

/* ─── Helper: styled element ─── */
function el(tag, styles, attrs) {
    const e = document.createElement(tag);
    if (styles) Object.assign(e.style, styles);
    if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
            if (k === "textContent") e.textContent = v;
            else if (k === "innerHTML") e.innerHTML = v;
            else e.setAttribute(k, v);
        }
    }
    return e;
}

/* ─── Build the entire map creator overlay ─── */
export function showMapCreator(onDone) {
    // State
    let previewData = null;
    let generating = false;
    let autoRegenerate = true;
    let previewDebounceTimer = null;

    // Inject CSS to hide number input spinners (can't be done inline)
    const styleId = "map-creator-spinner-hide";
    if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
            .map-creator-input::-webkit-outer-spin-button,
            .map-creator-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
            .map-creator-input { -moz-appearance: textfield; }
        `;
        document.head.appendChild(style);
    }

    /* === Overlay === */
    const overlay = el("div", {
        position: "fixed", inset: "0",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.80)",
        zIndex: "10003",
        backdropFilter: "blur(12px)",
        fontFamily: "'Inter', system-ui, sans-serif",
        color: "white",
    });

    /* === Main panel === */
    const panel = el("div", {
        background: "rgba(18, 18, 22, 0.98)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "24px",
        display: "flex",
        flexDirection: "row",
        width: "min(1200px, 92vw)",
        height: "min(780px, 88vh)",
        overflow: "hidden",
        boxShadow: "0 40px 100px rgba(0,0,0,0.8)",
    });

    /* ─── LEFT: Controls ─── */
    const left = el("div", {
        flex: "0 0 380px",
        display: "flex",
        flexDirection: "column",
        padding: "28px 24px",
        overflowY: "auto",
        borderRight: "1px solid rgba(255,255,255,0.08)",
    });

    // Title
    const title = el("h2", {
        margin: "0 0 20px 0", fontSize: "24px", fontWeight: "700",
        background: "linear-gradient(135deg, #34d399, #10b981)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
    }, { textContent: "Create a Map" });
    left.appendChild(title);

    /* Seed row */
    const seedRow = el("div", { display: "flex", gap: "8px", marginBottom: "16px", alignItems: "center" });
    const seedLabel = el("label", { fontSize: "13px", opacity: "0.6", marginBottom: "4px", display: "block" }, { textContent: "Seed" });
    const seedInput = el("input", {
        flex: "1", padding: "8px 12px", borderRadius: "8px",
        border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)",
        color: "white", fontSize: "14px", fontFamily: "monospace", outline: "none",
    }, { type: "number", placeholder: "Random" });
    seedInput.className = "map-creator-input";
    const seedBtn = el("button", {
        padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.15)",
        background: "rgba(255,255,255,0.06)", color: "white", cursor: "pointer",
        fontSize: "16px", transition: "all 0.15s",
    }, { textContent: "🎲", title: "Randomize Seed" });
    seedBtn.onmouseenter = () => { seedBtn.style.background = "rgba(255,255,255,0.15)"; };
    seedBtn.onmouseleave = () => { seedBtn.style.background = "rgba(255,255,255,0.06)"; };
    seedBtn.onclick = () => {
        seedInput.value = Math.floor(Math.random() * 999999) + 1;
        queuePreview();
    };
    const seedGroup = el("div", { marginBottom: "16px" });
    seedGroup.appendChild(seedLabel);
    seedRow.appendChild(seedInput);
    seedRow.appendChild(seedBtn);
    seedGroup.appendChild(seedRow);
    left.appendChild(seedGroup);

    /* Width / Height sliders with editable number inputs */
    function makeDimensionSlider(label, min, max, value, onChange) {
        const group = el("div", { marginBottom: "14px" });
        const row = el("div", { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" });
        const lbl = el("span", { fontSize: "13px", opacity: "0.6" }, { textContent: label });
        const numInput = el("input", {
            width: "60px", padding: "3px 8px", borderRadius: "6px",
            border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.9)", fontSize: "13px", fontWeight: "600",
            fontFamily: "monospace", outline: "none", textAlign: "right",
        }, { type: "number", min: String(min), max: String(max), value: String(value) });
        numInput.className = "map-creator-input";
        numInput.addEventListener("focus", () => { numInput.style.borderColor = "#10b981"; });
        numInput.addEventListener("blur", () => { numInput.style.borderColor = "rgba(255,255,255,0.15)"; });
        row.appendChild(lbl);
        row.appendChild(numInput);
        group.appendChild(row);

        const slider = el("input", {
            width: "100%", accentColor: "#10b981", cursor: "pointer",
        }, { type: "range", min: String(min), max: String(max), value: String(value), step: "1" });

        // Slider → input sync
        slider.addEventListener("input", () => {
            numInput.value = slider.value;
            if (onChange) onChange(Number(slider.value));
        });
        // Input → slider sync
        numInput.addEventListener("input", () => {
            let v = parseInt(numInput.value, 10);
            if (isNaN(v)) return;
            v = Math.max(min, Math.min(max, v));
            slider.value = v;
            if (onChange) onChange(v);
        });
        numInput.addEventListener("blur", () => {
            let v = parseInt(numInput.value, 10);
            if (isNaN(v)) v = value;
            v = Math.max(min, Math.min(max, v));
            numInput.value = v;
            slider.value = v;
        });

        group.appendChild(slider);
        return { group, slider, numInput, defaultValue: value };
    }

    const widthSlider = makeDimensionSlider("Width", 20, 500, 150, () => queuePreview());
    left.appendChild(widthSlider.group);

    const heightSlider = makeDimensionSlider("Height", 20, 500, 150, () => queuePreview());
    left.appendChild(heightSlider.group);

    /* ─── Terrain section header + Reset button ─── */
    const terrainRow = el("div", {
        display: "flex", justifyContent: "space-between", alignItems: "center",
        margin: "8px 0 12px 0",
        borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "14px",
    });
    const terrainLabel = el("div", {
        fontSize: "12px", fontWeight: "600", textTransform: "uppercase",
        letterSpacing: "1.5px", opacity: "0.35",
    }, { textContent: "Terrain" });
    const resetBtn = el("button", {
        padding: "4px 10px", borderRadius: "6px",
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.45)",
        cursor: "pointer", fontSize: "12px", fontWeight: "500",
        transition: "all 0.15s", display: "flex", alignItems: "center", gap: "4px",
    }, { textContent: "↺ Reset" });
    resetBtn.onmouseenter = () => { resetBtn.style.background = "rgba(255,255,255,0.1)"; resetBtn.style.color = "rgba(255,255,255,0.8)"; };
    resetBtn.onmouseleave = () => { resetBtn.style.background = "rgba(255,255,255,0.04)"; resetBtn.style.color = "rgba(255,255,255,0.45)"; };
    resetBtn.onclick = () => {
        // Reset terrain sliders only (leave seed, width, height untouched)
        // Reset terrain sliders
        for (const ctrl of TERRAIN_CONTROLS) {
            terrainSliders[ctrl.key].value = ctrl.value;
            // Update the percentage display
            const pctEl = terrainSliders[ctrl.key].parentElement.querySelector("span:last-of-type");
        }
        // Update all percentage displays by firing input events
        for (const ctrl of TERRAIN_CONTROLS) {
            terrainSliders[ctrl.key].dispatchEvent(new Event("input"));
        }
        queuePreview();
    };
    terrainRow.appendChild(terrainLabel);
    terrainRow.appendChild(resetBtn);
    left.appendChild(terrainRow);

    /* Terrain control sliders */
    const terrainSliders = {};
    for (const ctrl of TERRAIN_CONTROLS) {
        const group = el("div", { marginBottom: "12px" });
        const row = el("div", { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" });
        const lbl = el("span", { fontSize: "13px", opacity: "0.6" }, { textContent: ctrl.label });
        const pct = el("span", { fontSize: "12px", fontWeight: "600", color: "rgba(255,255,255,0.6)" }, { textContent: `${Math.round(ctrl.value * 100)}%` });
        row.appendChild(lbl);
        row.appendChild(pct);
        group.appendChild(row);

        const slider = el("input", {
            width: "100%", accentColor: "#10b981", cursor: "pointer",
        }, { type: "range", min: String(ctrl.min), max: String(ctrl.max), step: String(ctrl.step), value: String(ctrl.value) });

        // Sub-labels
        const subRow = el("div", { display: "flex", justifyContent: "space-between", marginTop: "2px" });
        subRow.appendChild(el("span", { fontSize: "10px", opacity: "0.3" }, { textContent: ctrl.labelLow }));
        subRow.appendChild(el("span", { fontSize: "10px", opacity: "0.3" }, { textContent: ctrl.labelHigh }));
        group.appendChild(slider);
        group.appendChild(subRow);

        slider.addEventListener("input", () => {
            pct.textContent = `${Math.round(Number(slider.value) * 100)}%`;
            queuePreview();
        });

        terrainSliders[ctrl.key] = slider;
        left.appendChild(group);
    }

    /* ─── Auto-regenerate toggle ─── */
    const autoRow = el("div", {
        display: "flex", alignItems: "center", gap: "8px",
        margin: "4px 0 12px 0", paddingTop: "8px",
        borderTop: "1px solid rgba(255,255,255,0.08)",
    });
    const autoCheckbox = el("input", {
        accentColor: "#10b981", cursor: "pointer",
    }, { type: "checkbox", id: "auto-regen-cb" });
    autoCheckbox.checked = true;
    const autoLabel = el("label", {
        fontSize: "13px", opacity: "0.6", cursor: "pointer",
    }, { textContent: "Auto-regenerate on changes", for: "auto-regen-cb" });
    autoCheckbox.addEventListener("change", () => {
        autoRegenerate = autoCheckbox.checked;
    });
    autoRow.appendChild(autoCheckbox);
    autoRow.appendChild(autoLabel);
    left.appendChild(autoRow);

    /* ─── Action buttons ─── */
    const btnRow = el("div", {
        display: "flex", gap: "10px", marginTop: "auto", paddingTop: "16px",
        borderTop: "1px solid rgba(255,255,255,0.08)",
    });

    const previewBtn = el("button", {
        flex: "1", padding: "12px", borderRadius: "12px", border: "none",
        background: "linear-gradient(135deg, #10b981, #059669)",
        color: "white", fontWeight: "700", fontSize: "15px", cursor: "pointer",
        transition: "all 0.2s", boxShadow: "0 4px 15px rgba(16,185,129,0.3)",
    }, { textContent: "Preview" });
    previewBtn.onmouseenter = () => { previewBtn.style.transform = "translateY(-1px)"; previewBtn.style.boxShadow = "0 6px 20px rgba(16,185,129,0.4)"; };
    previewBtn.onmouseleave = () => { previewBtn.style.transform = ""; previewBtn.style.boxShadow = "0 4px 15px rgba(16,185,129,0.3)"; };
    previewBtn.onclick = () => doPreview();

    const saveBtn = el("button", {
        flex: "1", padding: "12px", borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.15)",
        background: "rgba(255,255,255,0.06)",
        color: "white", fontWeight: "600", fontSize: "15px", cursor: "pointer",
        transition: "all 0.2s",
    }, { textContent: "Save Map" });
    saveBtn.onmouseenter = () => { saveBtn.style.background = "rgba(255,255,255,0.12)"; };
    saveBtn.onmouseleave = () => { saveBtn.style.background = "rgba(255,255,255,0.06)"; };
    saveBtn.onclick = () => showSaveDialog();

    btnRow.appendChild(previewBtn);
    btnRow.appendChild(saveBtn);
    left.appendChild(btnRow);

    /* Cancel */
    const cancelBtn = el("button", {
        marginTop: "10px", padding: "8px", border: "none", background: "none",
        color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: "13px",
        transition: "opacity 0.2s", textAlign: "center", width: "100%",
    }, { textContent: "Cancel" });
    cancelBtn.onmouseenter = () => { cancelBtn.style.color = "rgba(255,255,255,0.7)"; };
    cancelBtn.onmouseleave = () => { cancelBtn.style.color = "rgba(255,255,255,0.35)"; };
    cancelBtn.onclick = () => { document.body.removeChild(overlay); };
    left.appendChild(cancelBtn);

    /* ─── RIGHT: Preview ─── */
    const right = el("div", {
        flex: "1",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px",
        background: "rgba(0,0,0,0.3)",
        position: "relative",
    });

    const previewTitle = el("div", {
        fontSize: "13px", fontWeight: "600", textTransform: "uppercase",
        letterSpacing: "1.5px", opacity: "0.35", marginBottom: "16px",
    }, { textContent: "Preview" });
    right.appendChild(previewTitle);

    const previewContainer = el("div", {
        flex: "1", display: "flex", alignItems: "center", justifyContent: "center",
        width: "100%", position: "relative", cursor: "pointer",
    });

    const previewCanvas = el("canvas", {
        borderRadius: "12px",
        boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
        maxWidth: "100%",
        maxHeight: "100%",
    });
    previewContainer.appendChild(previewCanvas);

    // Click preview to regenerate
    previewContainer.addEventListener("click", () => {
        if (!generating) doPreview();
    });

    // Status overlay
    const statusOverlay = el("div", {
        position: "absolute", inset: "0",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: "8px",
        background: "rgba(0,0,0,0.5)", borderRadius: "12px",
        fontSize: "15px", fontWeight: "500", opacity: "0.8",
        pointerEvents: "none",
    }, { textContent: "Click here or adjust settings to generate" });
    previewContainer.appendChild(statusOverlay);

    right.appendChild(previewContainer);

    // Preview info bar
    const infoBar = el("div", {
        marginTop: "12px", fontSize: "12px", opacity: "0.4",
        textAlign: "center",
    }, { textContent: "Click the preview area to generate" });
    right.appendChild(infoBar);

    panel.appendChild(left);
    panel.appendChild(right);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    /* ─── Gather config params ─── */
    function getParams() {
        const params = {
            width: Number(widthSlider.slider.value),
            height: Number(heightSlider.slider.value),
        };
        const seedVal = seedInput.value.trim();
        if (seedVal) params.seed = Number(seedVal);

        for (const ctrl of TERRAIN_CONTROLS) {
            params[ctrl.key] = Number(terrainSliders[ctrl.key].value);
        }
        return params;
    }

    /* ─── Debounced auto-preview ─── */
    function queuePreview() {
        if (!autoRegenerate) {
            // Just mark stale
            if (previewData) {
                statusOverlay.style.display = "flex";
                statusOverlay.textContent = "Settings changed — click to regenerate";
            }
            return;
        }
        // Debounce: wait 600ms after last change before generating
        if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
        previewDebounceTimer = setTimeout(() => doPreview(), 600);
    }

    /* ─── Generate preview ─── */
    async function doPreview() {
        if (generating) return;
        generating = true;
        previewBtn.textContent = "Generating...";
        previewBtn.style.opacity = "0.6";
        previewBtn.style.pointerEvents = "none";
        statusOverlay.style.display = "flex";
        statusOverlay.textContent = "Generating preview...";

        try {
            const params = getParams();
            const resp = await fetch("/api/generate-preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(params),
            });
            if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
            previewData = await resp.json();

            // Update seed display if it was random
            if (!seedInput.value.trim()) {
                seedInput.value = previewData.seed;
            }

            renderPreview(previewData);
            statusOverlay.style.display = "none";
            infoBar.textContent = `${previewData.cols}×${previewData.rows} • Seed ${previewData.seed} • Click to regenerate`;
        } catch (err) {
            console.error("Preview generation failed:", err);
            statusOverlay.textContent = `Error: ${err.message}`;
        } finally {
            generating = false;
            previewBtn.textContent = "Preview";
            previewBtn.style.opacity = "1";
            previewBtn.style.pointerEvents = "";
        }
    }

    /* ─── Render preview with hex tiles (matching the game minimap) ─── */
    function renderPreview(data) {
        const { rows, cols, tiles } = data;

        // Match the minimap: 6×6 hex cells with pointy-top layout
        const pw = 6;
        const ph = 6;

        // Pointy-top hex math (odd-r layout)
        const cw = Math.ceil((cols + 0.5) * pw);
        const ch = Math.ceil((rows * 0.75 + 0.25) * ph);

        previewCanvas.width = cw;
        previewCanvas.height = ch;

        // Style size: scale up to fit the container
        const containerRect = previewContainer.getBoundingClientRect();
        const scaleX = (containerRect.width - 20) / cw;
        const scaleY = (containerRect.height - 20) / ch;
        const scale = Math.min(scaleX, scaleY, 6);
        previewCanvas.style.width = `${Math.floor(cw * scale)}px`;
        previewCanvas.style.height = `${Math.floor(ch * scale)}px`;

        const pctx = previewCanvas.getContext("2d", { alpha: false });
        pctx.imageSmoothingEnabled = true;
        pctx.imageSmoothingQuality = "high";

        // Black background
        pctx.fillStyle = "#000";
        pctx.fillRect(0, 0, cw, ch);

        // Draw hexes exactly like the minimap
        const drawHex = (cx, cy, w, h) => {
            const hh = h * 0.5;
            const hw = w * 0.5;
            const qh = h * 0.25;
            pctx.beginPath();
            pctx.moveTo(cx, cy - hh);         // Top
            pctx.lineTo(cx + hw, cy - qh);    // Top Right
            pctx.lineTo(cx + hw, cy + qh);    // Bottom Right
            pctx.lineTo(cx, cy + hh);          // Bottom
            pctx.lineTo(cx - hw, cy + qh);    // Bottom Left
            pctx.lineTo(cx - hw, cy - qh);    // Top Left
            pctx.closePath();
            pctx.fill();
        };

        for (let r = 0; r < rows; r++) {
            const y = (r * 0.75 + 0.5) * ph;
            const xOff = (r % 2 === 1) ? pw * 0.5 : 0;
            for (let c = 0; c < cols; c++) {
                const rgb = tileNameToColor(tiles[r][c]);
                const x = (c + 0.5) * pw + xOff;
                pctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
                drawHex(x, y, pw + 0.5, ph + 0.5); // Slight overlap to avoid gaps
            }
        }
    }

    /* ─── Save dialog ─── */
    function showSaveDialog() {
        // Create a small modal inside the overlay
        const saveOverlay = el("div", {
            position: "absolute", inset: "0",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.6)", zIndex: "10",
            borderRadius: "24px",
        });

        const savePanel = el("div", {
            background: "rgba(28, 28, 34, 0.98)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "16px",
            padding: "28px",
            width: "360px",
            textAlign: "center",
        });

        const saveTitle = el("h3", {
            margin: "0 0 16px 0", fontSize: "20px", fontWeight: "700",
            color: "white",
        }, { textContent: "Name Your Map" });
        savePanel.appendChild(saveTitle);

        const nameInput = el("input", {
            width: "100%", padding: "12px 16px", borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)",
            color: "white", fontSize: "16px", outline: "none",
            boxSizing: "border-box", marginBottom: "16px",
        }, { type: "text", placeholder: "e.g. Pangaea" });
        nameInput.addEventListener("focus", () => { nameInput.style.borderColor = "#10b981"; });
        nameInput.addEventListener("blur", () => { nameInput.style.borderColor = "rgba(255,255,255,0.2)"; });
        savePanel.appendChild(nameInput);

        const saveBtnRow = el("div", { display: "flex", gap: "10px" });

        const confirmBtn = el("button", {
            flex: "1", padding: "12px", borderRadius: "10px", border: "none",
            background: "linear-gradient(135deg, #10b981, #059669)",
            color: "white", fontWeight: "700", fontSize: "15px", cursor: "pointer",
            transition: "all 0.2s",
        }, { textContent: "Save" });

        const cancelSaveBtn = el("button", {
            flex: "1", padding: "12px", borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.06)",
            color: "white", fontWeight: "500", fontSize: "15px", cursor: "pointer",
        }, { textContent: "Cancel" });

        cancelSaveBtn.onclick = () => { panel.removeChild(saveOverlay); };

        confirmBtn.onclick = async () => {
            const name = nameInput.value.trim();
            if (!name) {
                nameInput.style.borderColor = "#ef4444";
                return;
            }

            confirmBtn.textContent = "Saving...";
            confirmBtn.style.opacity = "0.6";
            confirmBtn.style.pointerEvents = "none";

            try {
                const params = getParams();
                params.name = name;

                const resp = await fetch("/api/generate-map", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(params),
                });

                if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
                const result = await resp.json();

                if (result.error) throw new Error(result.error);

                // Success — close the overlay
                document.body.removeChild(overlay);
                if (onDone) onDone(result);
            } catch (err) {
                console.error("Map save failed:", err);
                confirmBtn.textContent = `Error: ${err.message}`;
                confirmBtn.style.opacity = "1";
                setTimeout(() => {
                    confirmBtn.textContent = "Save";
                    confirmBtn.style.opacity = "1";
                    confirmBtn.style.pointerEvents = "";
                }, 2000);
            }
        };

        // Enter key to save
        nameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") confirmBtn.click();
        });

        saveBtnRow.appendChild(confirmBtn);
        saveBtnRow.appendChild(cancelSaveBtn);
        savePanel.appendChild(saveBtnRow);
        saveOverlay.appendChild(savePanel);
        panel.style.position = "relative";
        panel.appendChild(saveOverlay);

        // Focus the input
        setTimeout(() => nameInput.focus(), 50);
    }
}
