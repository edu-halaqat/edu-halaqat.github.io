#!/usr/bin/env python3
"""Build the final, stable Tallam ministry-form export assets.

The repository keeps the official WebP source split into JavaScript chunks.
This builder evaluates those chunks with Node exactly as the browser did,
converts the verified source once to a static PNG, and creates the final
lossless Word/PDF exporter with deterministic integrity checks.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import os
import re
import subprocess
from pathlib import Path

from PIL import Image

BUILD = "20260829-final-png-v1"
WEBP_SHA256 = "977bf87fa55a137b85734c72f0dc86d3c37612dc5d2f7f3fd6234ec0fca4bb6f"
EXPECTED_SIZE = (1414, 2000)


def reconstruct_background(root: Path) -> bytes:
    node_script = r'''
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = process.env.TALLAM_ROOT;
if (!root) throw new Error("TALLAM_ROOT is missing");
const context = { window: {} };
vm.createContext(context);
for (let index = 1; index <= 14; index += 1) {
  const number = String(index).padStart(2, "0");
  const filename = path.join(root, "tallam", "assets", "js", `ministry-bg-${number}.js`);
  vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
}
const parts = context.window.__TallamMinistryBackgroundParts;
if (!Array.isArray(parts) || parts.length < 14) throw new Error("Background chunks are incomplete");
for (let index = 0; index < 14; index += 1) {
  if (typeof parts[index] !== "string" || parts[index].length === 0) {
    throw new Error(`Background chunk ${index + 1} is invalid`);
  }
}
process.stdout.write(parts.slice(0, 14).join(""));
'''
    environment = os.environ.copy()
    environment["TALLAM_ROOT"] = str(root)
    completed = subprocess.run(
        ["node", "-e", node_script],
        check=True,
        capture_output=True,
        text=True,
        env=environment,
    )
    encoded = completed.stdout.strip()
    data = base64.b64decode(encoded, validate=True)
    digest = hashlib.sha256(data).hexdigest()
    if digest != WEBP_SHA256:
        raise RuntimeError(f"Official WebP checksum mismatch: {digest}")
    return data


def write_static_png(root: Path, webp_data: bytes) -> Path:
    destination = root / "tallam" / "assets" / "img" / "ministry-form-background.png"
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(io.BytesIO(webp_data)) as image:
        rgb = image.convert("RGB")
        if rgb.size != EXPECTED_SIZE:
            raise RuntimeError(f"Unexpected official form dimensions: {rgb.size}")
        rgb.save(destination, format="PNG", optimize=True)

    payload = destination.read_bytes()
    if len(payload) < 100_000 or payload[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("Generated official PNG is invalid")
    return destination


def write_final_exporter(root: Path) -> Path:
    source_path = root / "tallam" / "assets" / "js" / "ministry-export-lossless.js"
    destination = root / "tallam" / "assets" / "js" / "ministry-export-final.js"
    source = source_path.read_text(encoding="utf-8")

    source, build_replacements = re.subn(
        r'const EXPORT_BUILD = "[^"]+";',
        f'const EXPORT_BUILD = "{BUILD}";',
        source,
        count=1,
    )
    if build_replacements != 1:
        raise RuntimeError("Could not update exporter build identifier")

    replacement = r'''  function assertIntegrity(snapshot) {
    const { width, height, rgba } = snapshot;
    if (width !== 1414 || height !== 2000 || rgba.length !== width * height * 4) {
      throw new Error("تعذر إنشاء صورة كاملة للاستمارة الرسمية.");
    }

    const pixel = (x, y) => {
      const index = (y * width + x) * 4;
      return [rgba[index], rgba[index + 1], rgba[index + 2]];
    };
    const near = (actual, expected, tolerance = 14) =>
      actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);

    const anchors = [
      [[15, 15], [255, 255, 255]],
      [[1375, 1970], [255, 255, 255]],
      [[710, 1910], [255, 255, 255]],
      [[1200, 1200], [255, 255, 255]],
      [[1000, 450], [194, 214, 155]],
      [[900, 650], [234, 241, 221]]
    ];
    for (const [[x, y], expected] of anchors) {
      if (!near(pixel(x, y), expected)) {
        throw new Error("أوقف النظام التصدير لأن صفحة الاستمارة لم تُرسم بصورة سليمة. حدّث الصفحة ثم أعد المحاولة.");
      }
    }
  }

  async function prepareSignature'''

    pattern = re.compile(
        r"  function assertIntegrity\(snapshot\) \{.*?\n  \}\n\n  async function prepareSignature",
        re.DOTALL,
    )
    source, integrity_replacements = pattern.subn(replacement, source, count=1)
    if integrity_replacements != 1:
        raise RuntimeError("Could not replace exporter integrity check")

    destination.write_text(source, encoding="utf-8", newline="\n")
    return destination


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="Repository root")
    args = parser.parse_args()
    root = Path(args.root).resolve()

    webp = reconstruct_background(root)
    png_path = write_static_png(root, webp)
    exporter_path = write_final_exporter(root)

    print(f"Built {png_path.relative_to(root)} ({png_path.stat().st_size} bytes)")
    print(f"Built {exporter_path.relative_to(root)} ({exporter_path.stat().st_size} bytes)")
    print(f"BUILD={BUILD}")


if __name__ == "__main__":
    main()
