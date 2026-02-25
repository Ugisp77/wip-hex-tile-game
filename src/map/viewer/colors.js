"use strict";

/**
 * Tile-name to minimap color mapping. 
 * Colors are represented as [r, g, b] with values 0-255.
 */
export const TILE_COLORS = [
    { match: "snow", color: [0xe1, 0xef, 0xf6] },
    { match: "taiga", color: [0x4d, 0x7b, 0x65] },
    { match: "swamp", color: [0x36, 0x5b, 0x4a] },
    { match: "jungle", color: [0x84, 0xa6, 0x49] },
    { match: "forest", color: [0x3e, 0x6b, 0x43] },
    { match: "hills", color: [0x53, 0x8c, 0x47] },
    { match: "mountain", color: [0x61, 0x62, 0x6b] },
    { match: "wheat", color: [0xb6, 0xa4, 0x44] },
    { match: "grain", color: [0xb6, 0xa4, 0x44] },
    { match: "clay", color: [0x7c, 0x55, 0x42] },
    { match: "dirt", color: [0x9a, 0x6d, 0x4f] },
    { match: "sand", color: [0xfb, 0xdc, 0x7f] },
    { match: "dunes", color: [0xe0, 0xc2, 0x6d] },
    { match: "grass", color: [0x6f, 0xad, 0x42] },
    // Water types — order matters: deep before shallow before generic
    { match: "deep", color: [0x22, 0x51, 0x89] },
    { match: "shallow", color: [0x7a, 0xbc, 0xc2] },
    { match: "water", color: [0x39, 0x7b, 0xb7] },
];

export const FALLBACK_COLOR = [0x44, 0x44, 0x44];

/**
 * Returns the color for a given tile name.
 * @param {string} name - Tile name.
 * @returns {number[]} - [r, g, b] color.
 */
export function tileNameToColor(name) {
    const lower = (name || "").toLowerCase();
    for (const entry of TILE_COLORS) {
        if (lower.includes(entry.match)) return entry.color;
    }
    return FALLBACK_COLOR;
}
