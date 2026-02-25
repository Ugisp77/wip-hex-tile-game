"use strict";

// Resource icons are expected at:
// Tile_icons/resources/<resourceKey>.png
//
// We return resourceKey in lowercase to match typical filenames like "ore.png".
// If your filenames are capitalized, change to return "Grain" etc.

const TILE_TO_RESOURCE_KEY = [
  { contains: ["wheat"], resourceKey: "grain" },
  { contains: ["forest"], resourceKey: "timber" },
  { contains: ["clay"], resourceKey: "brick" },
  { contains: ["hills"], resourceKey: "livestock" },
  { contains: ["mountains", "mountain"], resourceKey: "ore" },
  { contains: ["jungle"], resourceKey: "spices" },
  { contains: ["swamp"], resourceKey: "herbs" },
  { contains: ["taiga"], resourceKey: "furs" }
];

// Returns a resource key string (lowercase) or null if tile has no resources.
export function tileNameToResource(tileName) {
  if (!tileName) return null;
  const s = String(tileName).toLowerCase();

  for (const rule of TILE_TO_RESOURCE_KEY) {
    for (const sub of rule.contains) {
      if (s.includes(sub)) return rule.resourceKey;
    }
  }

  return null;
}
