"use strict";

// Initial list of known maps. Can be expanded by discovery.
// Initial list of known maps. Can be expanded by discovery.
let MAP_PATHS = [
    "./maps/map.json",
    "./maps/map_small.json",
    "./maps/map_big.json",
    "./maps/map_massive.json"
];

const metadataCache = new Map();
let discoveryDone = false;

/** Reset discovery so the next call to discoverMaps re-scans the maps folder. */
export function resetDiscovery() {
    discoveryDone = false;
}

/**
 * Attempts to discover all maps in the ./maps/ folder.
 * If server listing is unavailable, it filters the known paths by those that exist.
 */
export async function discoverMaps() {
    if (discoveryDone) return MAP_PATHS;

    try {
        const resp = await fetch("./maps/", { cache: "no-store" });
        if (resp.ok) {
            const text = await resp.text();
            // Simple regex to find .json files in an HTML directory listing
            const matches = text.match(/href="([^"]+\.json)"/g);
            if (matches) {
                const foundPaths = matches.map(m => {
                    let p = m.match(/href="([^"]+)"/)[1];
                    if (!p.startsWith("./") && !p.startsWith("/")) p = `./maps/${p}`;
                    return p;
                });
                // Deduplicate and update MAP_PATHS
                MAP_PATHS = [...new Set([...MAP_PATHS, ...foundPaths])];
                console.log("[MapRegistry] Discovered maps via directory listing:", MAP_PATHS);
            }
        }
    } catch (err) {
        console.warn("[MapRegistry] Directory discovery failed, falling back to manual verification:", err);
    }

    // Final fallback: filter MAP_PATHS by those that actually return 200 OK
    const verifiedPaths = [];
    await Promise.all(MAP_PATHS.map(async (path) => {
        try {
            const check = await fetch(path, { method: 'HEAD', cache: "no-store" });
            if (check.ok) verifiedPaths.push(path);
        } catch (e) {
            // ignore errors
        }
    }));

    MAP_PATHS = verifiedPaths;
    discoveryDone = true;
    return MAP_PATHS;
}

/**
 * Fetches only the beginning of a JSON file to extract seed, rows, and cols.
 * This avoids downloading massive map files just for metadata.
 */
export async function fetchMapMetadata(path) {
    if (metadataCache.has(path)) return metadataCache.get(path);

    try {
        // Attempt a Range request to get just the first 8KB
        const resp = await fetch(path, {
            headers: { 'Range': 'bytes=0-8191' },
            cache: "no-store"
        });

        if (!resp.ok && resp.status !== 206) {
            throw new Error(`Failed to fetch ${path}: ${resp.status}`);
        }

        let text = await resp.text();

        // If the Range request returned partial data, it might be invalid JSON (unclosed)
        // We'll try to extract the fields using regex if JSON.parse fails
        let metadata = { path };

        try {
            // Find where the 'tiles' array starts and trim everything after it to make it more likely to parse
            const tilesIndex = text.indexOf('"tiles"');
            if (tilesIndex !== -1) {
                let partialJson = text.substring(0, tilesIndex).trim();
                if (partialJson.endsWith(',')) partialJson = partialJson.slice(0, -1);
                partialJson += "}"; // Close the object
                const parsed = JSON.parse(partialJson);
                metadata.seed = parsed.seed;
                metadata.width = parsed.cols;
                metadata.height = parsed.rows;
            } else {
                // Fallback to regex if we can't find a clean break
                metadata.seed = parseInt(text.match(/"seed"\s*:\s*(\d+)/)?.[1]);
                metadata.width = parseInt(text.match(/"cols"\s*:\s*(\d+)/)?.[1]);
                metadata.height = parseInt(text.match(/"rows"\s*:\s*(\d+)/)?.[1]);
            }
        } catch (e) {
            console.warn(`[MapRegistry] JSON parse failed for ${path}, using regex fallback`);
            metadata.seed = parseInt(text.match(/"seed"\s*:\s*(\d+)/)?.[1]);
            metadata.width = parseInt(text.match(/"cols"\s*:\s*(\d+)/)?.[1]);
            metadata.height = parseInt(text.match(/"rows"\s*:\s*(\d+)/)?.[1]);
        }

        // Derive name from path
        const filename = path.split("/").pop().replace(".json", "");
        metadata.name = filename
            .split(/[_-]/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");

        if (filename === "map") metadata.name = "Default Map";

        metadataCache.set(path, metadata);
        return metadata;
    } catch (err) {
        console.error(`[MapRegistry] Error fetching metadata for ${path}:`, err);
        return { path, name: path.split("/").pop(), error: true };
    }
}

export async function findMapInRegistry(seed, width, height) {
    // Ensure discovery is done
    const paths = await discoverMaps();

    // Check cache first
    for (const meta of metadataCache.values()) {
        if (meta.seed === seed && meta.width === width && meta.height === height) return meta;
    }

    // If not in cache, we have to fetch all known map metadatas
    const allMeta = await Promise.all(paths.map(fetchMapMetadata));
    return allMeta.find(m => m.seed === seed && m.width === width && m.height === height);
}
