#!/usr/bin/env python3
"""Build the final, stable Tallam ministry-form export assets.

The repository keeps the official WebP source split into small JavaScript chunks.
This builder reconstructs that source, converts it once to a static PNG, and
creates the final exporter from the lossless exporter while replacing the old
false-positive integrity rule with deterministic anchor checks.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import re
from pathlib import Path

from PIL import Image

BUILD = "20260829-final-png-v1"
WEBP_SHA256 = "4123590b8e5038ec8aae70c37f57c863ccedd56dbfc1d01fedf0238c146cdd7e"
EXPECTED_SIZE = (1414, 2000)
BASE64_LITERAL = re.compile(r'"([A-Za-z0-9+/=]+)"')


def reconstruct_background(root: Path) -> bytes:
    parts: list[str] = []
    for index in range(1, 15):
        path = root / "tallam" / "assets" / "js" / f"ministry-bg-{index:02d}.js"
        text = path.read_text(encoding="utf-8")
        literals = BASE64_LITERAL.findall(text)
        if not literals:
            raise RuntimeError(f"Could not read official background chunk: {path}")
        # Some large chunks are split into several adjacent JavaScript string
        # literals joined with `+`; collect every Base64-only literal in order.
        parts.append("".join(literals))

    data = base64.b64decode("".join(parts), validate=True)
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
