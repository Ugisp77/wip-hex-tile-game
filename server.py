"""
Custom HTTP server for the Hex game.
Serves static files and provides API endpoints for map generation.
"""

import http.server
import json
import os
import re
import sys
import traceback
from pathlib import Path
from urllib.parse import urlparse

# Add the current directory so we can import map.py
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
from map import (
    Config,
    build_tilemap,
    build_numbers,
    elevation_to_dy,
    enforce_dy_limit,
    save_map_json,
)

PORT = 8000


def config_from_params(params: dict) -> Config:
    """Create a Config from a dictionary of UI parameters."""
    import random

    cfg = Config()

    # Basic params
    seed = params.get("seed")
    if seed is None or seed == "" or seed == "random":
        seed = random.randint(1, 999999)
    cfg.seed = int(seed)

    if "width" in params:
        cfg.cols = max(20, min(500, int(params["width"])))
    if "height" in params:
        cfg.rows = max(20, min(500, int(params["height"])))

    # Simplified terrain controls (0.0 - 1.0 range from UI sliders)

    # Landmass Size: 0 = small (high sea_level), 1 = large (low sea_level)
    if "landmassSize" in params:
        t = float(params["landmassSize"])
        cfg.sea_level = 0.60 - 0.25 * t  # 0.60 -> 0.35

    # Continents: 0 = many small, 1 = few large
    if "continents" in params:
        t = float(params["continents"])
        cfg.continental_scale = int(12 + 28 * t)  # 12 -> 40

    # Mountains: 0 = none, 1 = lots
    if "mountains" in params:
        t = float(params["mountains"])
        cfg.mountain_level = 0.90 - 0.25 * t  # 0.90 -> 0.65
        cfg.ridge_mountain_thresh = 0.90 - 0.16 * t  # 0.90 -> 0.74
        cfg.peak_mountain_thresh = 0.95 - 0.14 * t  # 0.95 -> 0.81
        cfg.mountain_peak_keep_prob = 0.10 + 0.30 * t  # 0.10 -> 0.40

    # Hills: 0 = none, 1 = lots
    if "hills" in params:
        t = float(params["hills"])
        cfg.hill_level = 0.80 - 0.30 * t  # 0.80 -> 0.50
        cfg.hill_extra_prob = 0.10 + 0.55 * t  # 0.10 -> 0.65

    # Forests: 0 = sparse, 1 = dense
    if "forests" in params:
        t = float(params["forests"])
        cfg.forest_humid = 0.60 - 0.40 * t  # 0.60 -> 0.20

    # Deserts: 0 = none, 1 = lots
    if "deserts" in params:
        t = float(params["deserts"])
        cfg.hot_temp = 0.80 - 0.30 * t  # 0.80 -> 0.50
        cfg.dry_humid = 0.15 + 0.30 * t  # 0.15 -> 0.45

    # Rivers: 0 = none, 1 = lots (0 -> 12)
    if "rivers" in params:
        t = float(params["rivers"])
        cfg.river_count = int(round(12 * t))

    # Lakes: 0 = none, 1 = many
    if "lakes" in params:
        t = float(params["lakes"])
        cfg.lake_thresh = 1.80 - 0.70 * t  # 1.80 -> 1.10

    return cfg


def generate_preview(params: dict) -> dict:
    """Generate a lightweight tile-type-only preview for the minimap canvas."""
    cfg = config_from_params(params)
    tilemap, elev_smooth, ocean_only, land = build_tilemap(cfg)

    # Convert tilemap to list of lists of strings
    tiles = []
    for r in range(cfg.rows):
        row = []
        for c in range(cfg.cols):
            row.append(str(tilemap[r, c]))
        tiles.append(row)

    return {
        "seed": cfg.seed,
        "rows": cfg.rows,
        "cols": cfg.cols,
        "tiles": tiles,
    }


def generate_full_map(params: dict, name: str) -> dict:
    """Generate the full map and save to the maps folder."""
    cfg = config_from_params(params)
    tilemap, elev_smooth, ocean_only, land = build_tilemap(cfg)

    # Compute elevation displacement
    dy = np.zeros((cfg.rows, cfg.cols), dtype=np.int32)
    for r in range(cfg.rows):
        for c in range(cfg.cols):
            dy[r, c] = elevation_to_dy(cfg, float(elev_smooth[r, c]), bool(ocean_only[r, c]))
    dy = enforce_dy_limit(cfg, dy, ocean_only)

    # Build numbers
    numbers = build_numbers(cfg, tilemap)

    # Sanitize name for filename
    safe_name = re.sub(r'[^\w\s\-]', '', name).strip()
    if not safe_name:
        safe_name = f"generated_{cfg.seed}"
    safe_name = safe_name.replace(' ', '_').lower()

    # Save
    maps_dir = Path("maps")
    maps_dir.mkdir(exist_ok=True)
    path = maps_dir / f"{safe_name}.json"

    save_map_json(cfg, tilemap, dy, numbers, str(path))

    return {
        "success": True,
        "path": f"./maps/{safe_name}.json",
        "seed": cfg.seed,
        "rows": cfg.rows,
        "cols": cfg.cols,
        "name": safe_name,
    }


class GameHandler(http.server.SimpleHTTPRequestHandler):
    """Extended handler with API endpoints for map generation."""

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/generate-preview":
            self._handle_api(generate_preview)
        elif path == "/api/generate-map":
            self._handle_api_with_name(generate_full_map)
        else:
            self.send_error(404, "Not Found")

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        return json.loads(body) if body else {}

    def _handle_api(self, handler_fn):
        try:
            data = self._read_json_body()
            result = handler_fn(data)
            self._send_json(200, result)
        except Exception as e:
            traceback.print_exc()
            self._send_json(500, {"error": str(e)})

    def _handle_api_with_name(self, handler_fn):
        try:
            data = self._read_json_body()
            name = data.pop("name", "unnamed")
            result = handler_fn(data, name)
            self._send_json(200, result)
        except Exception as e:
            traceback.print_exc()
            self._send_json(500, {"error": str(e)})

    def _send_json(self, code: int, obj: dict):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


def run():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    # ThreadingHTTPServer so map generation doesn't block static file serving
    server = http.server.ThreadingHTTPServer(("", PORT), GameHandler)
    print(f"Serving on http://localhost:{PORT}")
    print("Map generation API available at /api/generate-preview and /api/generate-map")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.shutdown()


if __name__ == "__main__":
    run()

