"use strict";

// Creates an outlined version of an image at native pixel scale.
// Outline is 1px, solid, 4-way connectivity, drawn outside sprite bounds.
// Returned canvas is (w+2) x (h+2) with the source image drawn at (1,1).
//
// img must be loaded (naturalWidth/Height > 0).
export function buildOutlinedSpriteCanvas4(img, rgb) {
  const iw = (img.naturalWidth || img.width || 0);
  const ih = (img.naturalHeight || img.height || 0);
  if (iw <= 0 || ih <= 0) return null;

  const rr = Math.max(0, Math.min(255, rgb[0] | 0));
  const gg = Math.max(0, Math.min(255, rgb[1] | 0));
  const bb = Math.max(0, Math.min(255, rgb[2] | 0));

  const ow = iw + 2;
  const oh = ih + 2;

  const src = document.createElement("canvas");
  src.width = ow;
  src.height = oh;
  const sctx = src.getContext("2d", { alpha: true });
  if (!sctx) return null;

  sctx.imageSmoothingEnabled = false;
  sctx.clearRect(0, 0, ow, oh);
  sctx.drawImage(img, 1, 1, iw, ih);

  const srcImg = sctx.getImageData(0, 0, ow, oh);
  const srcData = srcImg.data;

  const out = document.createElement("canvas");
  out.width = ow;
  out.height = oh;
  const octx = out.getContext("2d", { alpha: true });
  if (!octx) return null;

  const outImg = octx.createImageData(ow, oh);
  const outData = outImg.data;

  const idx = (x, y) => (y * ow + x) * 4;

  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const i = idx(x, y);

      // Only draw outline onto transparent pixels
      if (srcData[i + 3] !== 0) continue;

      let touches = false;

      // 4-way neighbors only
      if (x > 0) {
        const ni = idx(x - 1, y);
        if (srcData[ni + 3] !== 0) touches = true;
      }

      if (!touches && x < ow - 1) {
        const ni = idx(x + 1, y);
        if (srcData[ni + 3] !== 0) touches = true;
      }

      if (!touches && y > 0) {
        const ni = idx(x, y - 1);
        if (srcData[ni + 3] !== 0) touches = true;
      }

      if (!touches && y < oh - 1) {
        const ni = idx(x, y + 1);
        if (srcData[ni + 3] !== 0) touches = true;
      }

      if (touches) {
        outData[i + 0] = rr;
        outData[i + 1] = gg;
        outData[i + 2] = bb;
        outData[i + 3] = 255;
      }
    }
  }

  octx.imageSmoothingEnabled = false;
  octx.putImageData(outImg, 0, 0);

  // Draw original sprite on top at (1,1)
  octx.globalCompositeOperation = "source-over";
  octx.drawImage(img, 1, 1, iw, ih);

  return out;
}
