"use strict";

import { rgbToCss } from "../core/utils.js";

export function showRollPrompt(onRoll, onSkip) {
    const overlay = document.createElement("div");
    overlay.id = "roll-prompt-overlay";
    Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        zIndex: "10000",
        backdropFilter: "blur(4px)"
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
        background: "rgba(22, 22, 26, 0.95)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "16px",
        padding: "24px",
        width: "400px",
        boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        textAlign: "center",
        color: "white",
        fontFamily: "system-ui, sans-serif"
    });

    const title = document.createElement("h2");
    title.textContent = "What did you roll?";
    title.style.margin = "0 0 16px 0";
    title.style.fontSize = "22px";
    title.style.fontWeight = "600";
    panel.appendChild(title);

    // --- Float a "Skip Roll" button exactly over the End Turn button ---
    let skipClone = null;
    const endTurnBtn = document.getElementById("endTurnBtn");
    const cleanup = () => {
        if (skipClone && skipClone.parentNode) skipClone.parentNode.removeChild(skipClone);
        skipClone = null;
    };
    if (endTurnBtn && onSkip) {
        const rect = endTurnBtn.getBoundingClientRect();
        skipClone = document.createElement("button");
        skipClone.textContent = "Skip";
        skipClone.className = endTurnBtn.className;
        Object.assign(skipClone.style, {
            position: "fixed",
            left: rect.left + "px",
            top: rect.top + "px",
            width: rect.width + "px",
            height: rect.height + "px",
            zIndex: "10001",
            margin: "0"
        });
        skipClone.onclick = (e) => {
            e.stopImmediatePropagation();
            e.preventDefault();
            cleanup();
            document.body.removeChild(overlay);
            onSkip();
        };
        document.body.appendChild(skipClone);
    }

    const grid = document.createElement("div");
    Object.assign(grid.style, {
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "10px"
    });

    for (let i = 2; i <= 12; i++) {
        const btn = document.createElement("button");
        btn.textContent = i;
        Object.assign(btn.style, {
            padding: "12px",
            fontSize: "18px",
            fontWeight: "bold",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "8px",
            color: "white",
            cursor: "pointer",
            transition: "all 0.2s"
        });

        if (i === 7) {
            btn.style.color = "#ff4d4d";
            btn.style.borderColor = "rgba(255, 77, 77, 0.3)";
        }

        btn.onmouseenter = () => {
            btn.style.background = "rgba(255, 255, 255, 0.15)";
            btn.style.transform = "scale(1.05)";
        };
        btn.onmouseleave = () => {
            btn.style.background = "rgba(255, 255, 255, 0.05)";
            btn.style.transform = "scale(1)";
        };
        btn.onclick = () => {
            cleanup();
            document.body.removeChild(overlay);
            onRoll(i);
        };
        grid.appendChild(btn);
    }

    panel.appendChild(grid);

    const divider = document.createElement("div");
    Object.assign(divider.style, {
        height: "1px",
        background: "rgba(255, 255, 255, 0.1)",
        margin: "24px 0"
    });
    panel.appendChild(divider);

    const rollBtn = document.createElement("button");
    rollBtn.textContent = "Roll";
    Object.assign(rollBtn.style, {
        width: "100%",
        padding: "16px",
        fontSize: "20px",
        fontWeight: "800",
        background: "linear-gradient(135deg, #4f46e5, #3b82f6)",
        border: "none",
        borderRadius: "12px",
        color: "white",
        cursor: "pointer",
        boxShadow: "0 4px 15px rgba(59, 130, 246, 0.3)",
        transition: "all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        textTransform: "uppercase",
        letterSpacing: "1px"
    });

    rollBtn.onmouseenter = () => {
        rollBtn.style.transform = "translateY(-3px) scale(1.02)";
        rollBtn.style.boxShadow = "0 8px 25px rgba(59, 130, 246, 0.4)";
    };
    rollBtn.onmouseleave = () => {
        rollBtn.style.transform = "translateY(0) scale(1)";
        rollBtn.style.boxShadow = "0 4px 15px rgba(59, 130, 246, 0.3)";
    };

    rollBtn.onclick = () => {
        // Digital Roll logic
        panel.innerHTML = "";
        panel.style.width = "400px";
        panel.style.minHeight = "300px";
        panel.style.display = "flex";
        panel.style.flexDirection = "column";
        panel.style.alignItems = "center";
        panel.style.justifyContent = "center";

        const rollTitle = document.createElement("h2");
        rollTitle.textContent = "Rolling...";
        rollTitle.style.marginBottom = "24px";
        panel.appendChild(rollTitle);

        const gif = document.createElement("img");
        gif.src = `./Animations/dice_roll.gif?t=${Date.now()}`;
        Object.assign(gif.style, {
            width: "256px",
            height: "256px",
            imageRendering: "pixelated",
            borderRadius: "12px",
            marginBottom: "16px"
        });
        panel.appendChild(gif);

        const roll1 = Math.floor(Math.random() * 6) + 1;
        const roll2 = Math.floor(Math.random() * 6) + 1;
        const total = roll1 + roll2;

        setTimeout(() => {
            panel.innerHTML = "";

            const resultTitle = document.createElement("h2");
            resultTitle.textContent = `You rolled a ${total}!`;
            resultTitle.style.marginBottom = "32px";
            panel.appendChild(resultTitle);

            const diceContainer = document.createElement("div");
            diceContainer.style.display = "flex";
            diceContainer.style.gap = "24px";
            diceContainer.style.marginBottom = "32px";

            const createDie = (val) => {
                const img = document.createElement("img");
                img.src = `./Tile_icons/dice/dice_${val}.png`;
                Object.assign(img.style, {
                    width: "96px",
                    height: "96px",
                    imageRendering: "pixelated",
                    filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.4))"
                });
                return img;
            };

            diceContainer.appendChild(createDie(roll1));
            diceContainer.appendChild(createDie(roll2));
            panel.appendChild(diceContainer);

            const continueBtn = document.createElement("button");
            continueBtn.textContent = "Continue";
            Object.assign(continueBtn.style, {
                padding: "12px 48px",
                fontSize: "18px",
                fontWeight: "bold",
                background: "white",
                border: "none",
                borderRadius: "10px",
                color: "black",
                cursor: "pointer",
                boxShadow: "0 4px 15px rgba(255,255,255,0.1)",
                transition: "all 0.2s"
            });

            continueBtn.onmouseenter = () => {
                continueBtn.style.transform = "translateY(-2px)";
                continueBtn.style.boxShadow = "0 6px 20px rgba(255,255,255,0.2)";
            };
            continueBtn.onmouseleave = () => {
                continueBtn.style.transform = "translateY(0)";
                continueBtn.style.boxShadow = "0 4px 15px rgba(255,255,255,0.1)";
            };

            continueBtn.onclick = () => {
                cleanup();
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                }
                onRoll(total);
            }
            panel.appendChild(continueBtn);
        }, 1300); // 13 frames @ 100ms
    };

    panel.appendChild(rollBtn);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
}

export function showResourceSummary(playerYields, players, iconCache, onDone) {
    const overlay = document.createElement("div");
    overlay.id = "resource-summary-overlay";
    Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
        zIndex: "10001",
        backdropFilter: "blur(6px)"
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
        background: "rgba(22, 22, 26, 0.98)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: "20px",
        padding: "32px",
        width: "480px",
        maxHeight: "80vh",
        overflowY: "auto",
        boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
        color: "white",
        fontFamily: "system-ui, sans-serif"
    });

    const title = document.createElement("h2");
    title.textContent = "Production Results";
    title.style.margin = "0 0 24px 0";
    title.style.textAlign = "center";
    title.style.fontSize = "26px";
    title.style.background = "linear-gradient(to right, #fff, #aaa)";
    title.style.webkitBackgroundClip = "text";
    title.style.webkitTextFillColor = "transparent";
    panel.appendChild(title);

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "16px";

    let totalResources = 0;

    for (const player of players) {
        const playerKey = JSON.stringify(player.rgb);
        const yields = playerYields.get(playerKey);

        if (yields && yields.size > 0) {
            const row = document.createElement("div");
            Object.assign(row.style, {
                background: "rgba(255, 255, 255, 0.03)",
                border: `1px solid ${rgbToCss(player.rgb, 0.3)}`,
                borderRadius: "12px",
                padding: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
            });

            const left = document.createElement("div");
            left.style.display = "flex";
            left.style.alignItems = "center";
            left.style.gap = "12px";

            const dot = document.createElement("div");
            Object.assign(dot.style, {
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: rgbToCss(player.rgb, 1),
                boxShadow: `0 0 10px ${rgbToCss(player.rgb, 0.5)}`
            });

            const name = document.createElement("div");
            name.textContent = player.name;
            name.style.fontWeight = "600";
            name.style.fontSize = "16px";

            left.appendChild(dot);
            left.appendChild(name);
            row.appendChild(left);

            const resGroup = document.createElement("div");
            resGroup.style.display = "flex";
            resGroup.style.gap = "12px";

            for (const [resKey, count] of yields.entries()) {
                totalResources += count;
                const item = document.createElement("div");
                item.style.display = "flex";
                item.style.alignItems = "center";
                item.style.gap = "4px";

                const img = document.createElement("img");
                img.width = 24;
                img.height = 24;
                img.style.imageRendering = "pixelated";
                const icon = iconCache.getIcon(resKey);
                if (icon) img.src = icon.src;
                else img.src = `./Tile_icons/resources/${resKey}.png`;

                const num = document.createElement("span");
                num.textContent = `x${count}`;
                num.style.fontSize = "14px";
                num.style.fontWeight = "bold";
                num.style.opacity = "0.9";

                item.appendChild(img);
                item.appendChild(num);
                resGroup.appendChild(item);
            }
            row.appendChild(resGroup);
            list.appendChild(row);
        }
    }

    if (totalResources === 0) {
        const empty = document.createElement("div");
        empty.textContent = "No resources produced this roll.";
        empty.style.textAlign = "center";
        empty.style.opacity = "0.5";
        empty.style.padding = "20px";
        list.appendChild(empty);
    }

    panel.appendChild(list);

    const btnWrap = document.createElement("div");
    btnWrap.style.marginTop = "32px";
    btnWrap.style.display = "flex";
    btnWrap.style.justifyContent = "center";

    const doneBtn = document.createElement("button");
    doneBtn.textContent = "Continue";
    Object.assign(doneBtn.style, {
        padding: "12px 40px",
        fontSize: "16px",
        fontWeight: "bold",
        background: "white",
        border: "none",
        borderRadius: "10px",
        color: "black",
        cursor: "pointer",
        boxShadow: "0 4px 15px rgba(255,255,255,0.1)",
        transition: "all 0.2s"
    });

    doneBtn.onmouseenter = () => {
        doneBtn.style.transform = "translateY(-2px)";
        doneBtn.style.boxShadow = "0 6px 20px rgba(255,255,255,0.2)";
    };
    doneBtn.onmouseleave = () => {
        doneBtn.style.transform = "translateY(0)";
        doneBtn.style.boxShadow = "0 4px 15px rgba(255,255,255,0.1)";
    };
    doneBtn.onclick = () => {
        document.body.removeChild(overlay);
        if (onDone) onDone();
    };

    btnWrap.appendChild(doneBtn);
    panel.appendChild(btnWrap);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
}

export function showBanditTentPrompt(currentPlayer, onDone) {
    const overlay = document.createElement("div");
    overlay.id = "bandit-tent-overlay";
    Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
        zIndex: "10001",
        backdropFilter: "blur(6px)"
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
        background: "rgba(22, 22, 26, 0.98)",
        border: "1px solid rgba(255, 77, 77, 0.3)",
        borderRadius: "20px",
        padding: "32px",
        width: "420px",
        boxShadow: "0 25px 60px rgba(0,0,0,0.6), 0 0 40px rgba(255, 77, 77, 0.1)",
        color: "white",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center"
    });

    const icon = document.createElement("img");
    icon.src = "./Structures/Settlements/bandit_hq.png";
    Object.assign(icon.style, {
        width: "64px",
        height: "64px",
        imageRendering: "pixelated",
        marginBottom: "16px",
        filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.5))"
    });
    panel.appendChild(icon);

    const title = document.createElement("h2");
    title.textContent = "Bandits!";
    Object.assign(title.style, {
        margin: "0 0 8px 0",
        fontSize: "28px",
        fontWeight: "700",
        color: "#ff4d4d"
    });
    panel.appendChild(title);

    const subtitle = document.createElement("div");
    subtitle.textContent = `${currentPlayer.name}, move a Bandit Tent!`;
    Object.assign(subtitle.style, {
        fontSize: "16px",
        opacity: "0.8",
        marginBottom: "24px"
    });
    panel.appendChild(subtitle);

    const desc = document.createElement("div");
    desc.textContent = "No resources are produced. Pick up a bandit tent and place it next to an opponent's settlement to suppress their production.";
    Object.assign(desc.style, {
        fontSize: "14px",
        opacity: "0.5",
        lineHeight: "1.5",
        marginBottom: "28px"
    });
    panel.appendChild(desc);

    const doneBtn = document.createElement("button");
    doneBtn.textContent = "Move Bandit Tent";
    Object.assign(doneBtn.style, {
        padding: "12px 32px",
        fontSize: "16px",
        fontWeight: "bold",
        background: "linear-gradient(135deg, #ff4d4d, #cc0000)",
        border: "none",
        borderRadius: "10px",
        color: "white",
        cursor: "pointer",
        boxShadow: "0 4px 15px rgba(255, 77, 77, 0.3)",
        transition: "all 0.2s"
    });

    doneBtn.onmouseenter = () => {
        doneBtn.style.transform = "translateY(-2px)";
        doneBtn.style.boxShadow = "0 6px 20px rgba(255, 77, 77, 0.4)";
    };
    doneBtn.onmouseleave = () => {
        doneBtn.style.transform = "translateY(0)";
        doneBtn.style.boxShadow = "0 4px 15px rgba(255, 77, 77, 0.3)";
    };
    doneBtn.onclick = () => {
        document.body.removeChild(overlay);
        if (onDone) onDone();
    };

    panel.appendChild(doneBtn);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
}

export function showRuinClaimedPrompt(playerName, playerRgb, rewards, onDone) {
    const overlay = document.createElement("div");
    overlay.id = "ruin-claimed-overlay";
    Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
        zIndex: "10001",
        backdropFilter: "blur(6px)"
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
        background: "rgba(22, 22, 26, 0.98)",
        border: `1px solid ${rgbToCss(playerRgb, 0.4)}`,
        borderRadius: "20px",
        padding: "32px",
        width: "420px",
        boxShadow: `0 25px 60px rgba(0,0,0,0.6), 0 0 40px ${rgbToCss(playerRgb, 0.15)}`,
        color: "white",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center"
    });

    const isSunkenShip = rewards && rewards.some(r => r.label === "Timber");
    const icon = document.createElement("div");
    icon.textContent = isSunkenShip ? "🚢" : "🏛️";
    icon.style.fontSize = "48px";
    icon.style.marginBottom = "12px";
    panel.appendChild(icon);

    const title = document.createElement("h2");
    title.textContent = isSunkenShip ? "Sunken Ship discovered!" : "Ruins discovered!";
    Object.assign(title.style, {
        margin: "0 0 8px 0",
        fontSize: "28px",
        fontWeight: "700",
        background: "linear-gradient(to right, #f0c27f, #fc5c7d)",
        webkitBackgroundClip: "text",
        webkitTextFillColor: "transparent"
    });
    panel.appendChild(title);

    const subtitle = document.createElement("div");
    subtitle.textContent = isSunkenShip ? `${playerName} explores a sunken ship` : `${playerName} explores ancient ruins`;
    Object.assign(subtitle.style, {
        fontSize: "16px",
        opacity: "0.8",
        marginBottom: "24px"
    });
    panel.appendChild(subtitle);

    // Rewards list
    const rewardsDiv = document.createElement("div");
    Object.assign(rewardsDiv.style, {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        marginBottom: "28px",
        padding: "16px",
        background: "rgba(255, 255, 255, 0.04)",
        borderRadius: "12px",
        border: "1px solid rgba(255, 255, 255, 0.08)"
    });

    // Default VPs if not provided (though we expect them in rewards)
    const rewardItems = rewards || [
        { iconSrc: "./Tile_icons/resources/spices.png", label: "Spices", amount: "+1" },
        { iconSrc: "./Tile_icons/resources/herbs.png", label: "Herbs", amount: "+2" },
        { iconEmoji: "⭐", label: "Victory Point", amount: "+1" }
    ];

    for (const item of rewardItems) {
        const row = document.createElement("div");
        Object.assign(row.style, {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 8px"
        });

        const left = document.createElement("div");
        left.style.display = "flex";
        left.style.alignItems = "center";
        left.style.gap = "8px";
        left.style.fontSize = "16px";

        if (item.iconSrc) {
            const img = document.createElement("img");
            img.src = item.iconSrc;
            img.width = 24;
            img.height = 24;
            img.style.imageRendering = "pixelated";
            left.appendChild(img);
        } else {
            const emoji = document.createElement("span");
            emoji.textContent = item.iconEmoji;
            left.appendChild(emoji);
        }
        const labelSpan = document.createElement("span");
        labelSpan.textContent = item.label;
        left.appendChild(labelSpan);

        const right = document.createElement("div");
        right.textContent = item.amount;
        Object.assign(right.style, {
            fontSize: "16px",
            fontWeight: "700",
            color: "#88ff88"
        });

        row.appendChild(left);
        row.appendChild(right);
        rewardsDiv.appendChild(row);
    }

    panel.appendChild(rewardsDiv);

    const doneBtn2 = document.createElement("button");
    doneBtn2.textContent = "Continue";
    Object.assign(doneBtn2.style, {
        padding: "12px 40px",
        fontSize: "16px",
        fontWeight: "bold",
        background: "white",
        border: "none",
        borderRadius: "10px",
        color: "black",
        cursor: "pointer",
        boxShadow: "0 4px 15px rgba(255,255,255,0.1)",
        transition: "all 0.2s"
    });

    doneBtn2.onmouseenter = () => {
        doneBtn2.style.transform = "translateY(-2px)";
        doneBtn2.style.boxShadow = "0 6px 20px rgba(255,255,255,0.2)";
    };
    doneBtn2.onmouseleave = () => {
        doneBtn2.style.transform = "translateY(0)";
        doneBtn2.style.boxShadow = "0 4px 15px rgba(255,255,255,0.1)";
    };
    doneBtn2.onclick = () => {
        document.body.removeChild(overlay);
        if (onDone) onDone();
    };

    panel.appendChild(doneBtn2);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
}

export function showMercenaryCampPrompt(currentPlayer, onDone) {
    const playerColor = rgbToCss(currentPlayer.rgb, 1);
    const overlay = document.createElement("div");
    overlay.id = "mercenary-camp-overlay";
    Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.85)",
        zIndex: "10001",
        backdropFilter: "blur(10px)"
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
        background: "rgba(20, 18, 16, 0.98)",
        border: `2px solid ${playerColor}`,
        borderRadius: "24px",
        padding: "40px",
        width: "420px",
        boxShadow: `0 30px 70px rgba(0,0,0,0.8), 0 0 40px ${rgbToCss(currentPlayer.rgb, 0.15)}`,
        color: "white",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center"
    });

    const icon = document.createElement("img");
    icon.src = "./Structures/Settlements/mercenary_camp_0.png";
    Object.assign(icon.style, {
        width: "64px",
        height: "64px",
        imageRendering: "pixelated",
        marginBottom: "16px",
        filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.5))"
    });
    panel.appendChild(icon);

    const title = document.createElement("h2");
    title.textContent = "Mercenary Camp!";
    Object.assign(title.style, {
        margin: "0 0 12px 0",
        fontSize: "32px",
        fontWeight: "900",
        color: playerColor,
        textShadow: `0 0 20px ${rgbToCss(currentPlayer.rgb, 0.3)}`,
        textTransform: "uppercase",
        letterSpacing: "1px"
    });
    panel.appendChild(title);

    const desc = document.createElement("div");
    desc.textContent = "You've established a Mercenary Camp! You can now steal half of one type of resource from another player of your choice.";
    Object.assign(desc.style, {
        fontSize: "17px",
        opacity: "0.9",
        lineHeight: "1.6",
        marginBottom: "32px",
        color: "rgba(255, 255, 255, 0.95)"
    });
    panel.appendChild(desc);

    const doneBtn = document.createElement("button");
    doneBtn.textContent = "Understood";
    Object.assign(doneBtn.style, {
        padding: "14px 40px",
        fontSize: "16px",
        fontWeight: "800",
        background: playerColor,
        border: "none",
        borderRadius: "12px",
        color: "black",
        cursor: "pointer",
        boxShadow: `0 8px 20px ${rgbToCss(currentPlayer.rgb, 0.3)}`,
        transition: "all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        textTransform: "uppercase"
    });

    doneBtn.onmouseenter = () => {
        doneBtn.style.transform = "translateY(-3px) scale(1.05)";
        doneBtn.style.boxShadow = `0 12px 25px ${rgbToCss(currentPlayer.rgb, 0.4)}`;
    };
    doneBtn.onmouseleave = () => {
        doneBtn.style.transform = "translateY(0) scale(1)";
        doneBtn.style.boxShadow = `0 8px 20px ${rgbToCss(currentPlayer.rgb, 0.3)}`;
    };
    doneBtn.onclick = () => {
        document.body.removeChild(overlay);
        if (onDone) onDone();
    };

    panel.appendChild(doneBtn);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
}

export function showMapSelectionPrompt(paths, fetchMetadata, onSelect) {
    const overlay = document.createElement("div");
    overlay.id = "map-selection-overlay";
    Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
        zIndex: "10002",
        backdropFilter: "blur(8px)"
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
        background: "rgba(18, 18, 22, 0.98)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        borderRadius: "24px",
        padding: "32px",
        width: "440px",
        boxShadow: "0 30px 70px rgba(0,0,0,0.7)",
        color: "white",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center"
    });

    const title = document.createElement("h2");
    title.textContent = "Choose a Map";
    Object.assign(title.style, {
        margin: "0 0 24px 0",
        fontSize: "26px",
        fontWeight: "700",
        background: "linear-gradient(135deg, #60a5fa, #3b82f6)",
        webkitBackgroundClip: "text",
        webkitTextFillColor: "transparent"
    });
    panel.appendChild(title);

    const list = document.createElement("div");
    Object.assign(list.style, {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        marginBottom: "32px",
        minHeight: "100px"
    });

    // Populate list asynchronously
    const loadMaps = async () => {
        for (const path of paths) {
            const item = document.createElement("div");
            item.className = "map-select-item-placeholder";
            Object.assign(item.style, {
                padding: "20px",
                background: "rgba(255, 255, 255, 0.03)",
                borderRadius: "12px",
                fontSize: "14px",
                opacity: "0.5",
                textAlign: "left"
            });
            item.textContent = `Loading ${path.split('/').pop()}...`;
            list.appendChild(item);

            fetchMetadata(path).then(map => {
                const btn = document.createElement("button");
                btn.className = "map-select-btn";
                Object.assign(btn.style, {
                    padding: "16px 24px",
                    fontSize: "17px",
                    fontWeight: "600",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "12px",
                    color: "rgba(255, 255, 255, 0.9)",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    width: "100%"
                });

                const name = document.createElement("span");
                name.textContent = map.name;
                name.style.fontSize = "18px";
                btn.appendChild(name);

                const meta = document.createElement("span");
                if (map.error) {
                    meta.textContent = "Failed to load metadata";
                    meta.style.color = "#ff4d4d";
                } else {
                    meta.textContent = `${map.width}x${map.height} • Seed ${map.seed}`;
                }
                meta.style.fontSize = "13px";
                meta.style.opacity = "0.5";
                btn.appendChild(meta);

                btn.onmouseenter = () => {
                    btn.style.background = "rgba(255, 255, 255, 0.12)";
                    btn.style.borderColor = "rgba(255, 255, 255, 0.25)";
                    btn.style.transform = "translateX(5px)";
                };
                btn.onmouseleave = () => {
                    btn.style.background = "rgba(255, 255, 255, 0.05)";
                    btn.style.borderColor = "rgba(255, 255, 255, 0.1)";
                    btn.style.transform = "translateX(0)";
                };
                btn.onclick = () => {
                    document.body.removeChild(overlay);
                    onSelect(map);
                };

                // Replace placeholder
                list.replaceChild(btn, item);
            });
        }
    };

    loadMaps();
    panel.appendChild(list);

    // "Create a Map" button
    const createBtn = document.createElement("button");
    createBtn.innerHTML = `<img src="./Structures/Roads/road_start.png" style="width:32px;height:auto;image-rendering:pixelated;vertical-align:middle;margin-right:8px;filter:brightness(2);">Create a Map`;
    Object.assign(createBtn.style, {
        width: "100%",
        padding: "14px",
        fontSize: "16px",
        fontWeight: "700",
        background: "linear-gradient(135deg, #10b981, #059669)",
        border: "none",
        borderRadius: "12px",
        color: "white",
        cursor: "pointer",
        boxShadow: "0 4px 15px rgba(16, 185, 129, 0.3)",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        marginBottom: "16px",
    });
    createBtn.onmouseenter = () => {
        createBtn.style.transform = "translateY(-2px)";
        createBtn.style.boxShadow = "0 8px 25px rgba(16, 185, 129, 0.4)";
    };
    createBtn.onmouseleave = () => {
        createBtn.style.transform = "translateY(0)";
        createBtn.style.boxShadow = "0 4px 15px rgba(16, 185, 129, 0.3)";
    };
    createBtn.onclick = async () => {
        document.body.removeChild(overlay);
        const { showMapCreator } = await import("./mapCreator.js");
        showMapCreator(async (result) => {
            if (result && result.path) {
                // Re-open the map selector with a refreshed list so the new map appears
                const { discoverMaps, fetchMapMetadata, resetDiscovery } = await import("../map/viewer/mapRegistry.js");
                resetDiscovery();
                const freshPaths = await discoverMaps();
                showMapSelectionPrompt(freshPaths, fetchMapMetadata, onSelect);
            }
        });
    };
    panel.appendChild(createBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    Object.assign(cancelBtn.style, {
        background: "none",
        border: "none",
        color: "rgba(255, 255, 255, 0.4)",
        cursor: "pointer",
        fontSize: "15px",
        fontWeight: "500",
        padding: "8px 16px",
        transition: "opacity 0.2s"
    });
    cancelBtn.onmouseenter = () => cancelBtn.style.opacity = "1";
    cancelBtn.onmouseleave = () => cancelBtn.style.opacity = "0.6";
    cancelBtn.onclick = () => document.body.removeChild(overlay);
    panel.appendChild(cancelBtn);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
}
