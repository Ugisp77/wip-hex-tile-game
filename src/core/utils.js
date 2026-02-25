"use strict";

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function expLerpFactor(dt, speed) {
  return 1 - Math.exp(-dt * speed);
}

export function nowSec() {
  return performance.now() / 1000;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;

    const denom = (yj - yi) || 1e-9;
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / denom + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Deterministic RNG for reproducible tile variant choices
export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= (h >>> 16);
    return h >>> 0;
  };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Player colors
export function hslToRgb(h, s, l) {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp(s, 0, 1);
  const ll = clamp(l, 0, 1);

  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;

  let r1 = 0, g1 = 0, b1 = 0;
  if (hh < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (hh < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (hh < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (hh < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (hh < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }

  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255)
  ];
}

export function makePlayerColors(count) {
  const n = Math.max(1, Math.min(10, Math.floor(count)));
  const out = [];

  // Player 1 always blue
  out.push({ name: "Player 1", rgb: [40, 120, 255] });

  const golden = 137.50776405003785;
  let h = 210;
  for (let i = 1; i < n; i++) {
    h = (h + golden) % 360;
    if (Math.abs(h - 210) < 18) h = (h + 30) % 360;
    const rgb = hslToRgb(h, 0.92, 0.56);
    out.push({ name: `Player ${i + 1}`, rgb });
  }
  return out;
}

export function rgbToCss(rgb, a) {
  const r = clamp(Math.round(rgb[0]), 0, 255);
  const g = clamp(Math.round(rgb[1]), 0, 255);
  const b = clamp(Math.round(rgb[2]), 0, 255);
  const aa = clamp(a, 0, 1);
  return `rgba(${r}, ${g}, ${b}, ${aa})`;
}
