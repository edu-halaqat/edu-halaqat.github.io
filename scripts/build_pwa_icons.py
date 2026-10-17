#!/usr/bin/env python3
"""Generate high-contrast Sanabil PWA artwork from the official transparent logo.

The original Sanabil mark stays intact. The former dark-green icon background
hid the green pages of the mark; these launch icons use pale mint so the complete
gold-and-green symbol stays legible at Android launcher sizes.

GitHub Pages runs this before packaging the deployed site. Nothing in the
source logo is destructively rewritten.
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
SOURCE = ASSETS / "logo-sanabil-icon-v6.png"

BACKGROUND = "#F1F7F4"
BORDER = "#D8BD88"
# Maskable icons must keep the full logo within a centered safety circle;
# ~60% image footprint ensures no leaves/pages are lost to launcher masks.
SPECS = (
    (192, False, "sanabil-app-192.png", "sanabil-app-visible-192.png"),
    (512, False, "sanabil-app-512.png", "sanabil-app-visible-512.png"),
    (512, True, "sanabil-app-maskable-512.png", "sanabil-app-visible-maskable-512.png"),
)


def extract_logo() -> Image.Image:
    image = Image.open(SOURCE).convert("RGBA")
    alpha = image.getchannel("A").point(lambda value: 255 if value > 12 else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise RuntimeError("The official logo has no visible pixels.")
    logo = image.crop(bbox)
    # Preserve the precise official artwork; remove almost-transparent residue.
    logo.putalpha(logo.getchannel("A").point(lambda value: 0 if value < 12 else value))
    return logo


def make_icon(logo: Image.Image, size: int, maskable: bool) -> Image.Image:
    background = Image.new("RGBA", (size, size), BACKGROUND)
    draw = ImageDraw.Draw(background)
    if not maskable:
        # A subtle gold border recalls the identity used throughout the platform,
        # without competing with the pale background or green Quran pages.
        edge = max(3, round(size * .018))
        inset = max(4, round(size * .03))
        draw.rounded_rectangle(
            (inset, inset, size - inset - 1, size - inset - 1),
            radius=max(12, round(size * .18)),
            outline=BORDER,
            width=edge,
        )
    footprint = .73 if not maskable else .59
    limit = int(round(size * footprint))
    ratio = min(limit / logo.width, limit / logo.height)
    resized = logo.resize(
        (max(1, int(round(logo.width * ratio))),
         max(1, int(round(logo.height * ratio)))),
        Image.Resampling.LANCZOS,
    )
    left = (size - resized.width) // 2
    top = (size - resized.height) // 2
    background.alpha_composite(resized, (left, top))
    return background.convert("RGB")


def main() -> None:
    logo = extract_logo()
    for size, maskable, compatibility_path, versioned_path in SPECS:
        icon = make_icon(logo, size, maskable)
        # Old paths also get replaced in the deployed artifact, so shortcuts
        # installed before the manifest update do not load the low-contrast art.
        for filename in (compatibility_path, versioned_path):
            icon.save(ASSETS / filename, "PNG", optimize=True)
        print(f"PASS {size}x{size} {'maskable' if maskable else 'standard'} "
              f"logo footprint={.59 if maskable else .73:.0%} "
              f"background={BACKGROUND} -> {versioned_path}")
    # Validate actual visible ink, not an arbitrary center pixel. The Quran
    # logo is intentionally not filled at its geometric center, so a single
    # center-vs-corner comparison falsely rejected the previous release.
    from PIL import ImageColor
    background = ImageColor.getrgb(BACKGROUND)
    opaque_count = 0
    contrast_count = 0
    for red, green, blue, alpha in logo.getdata():
        if alpha < 180:
            continue
        opaque_count += 1
        if max(abs(red - background[0]),
               abs(green - background[1]),
               abs(blue - background[2])) >= 70:
            contrast_count += 1
    if opaque_count < 100 or contrast_count < opaque_count // 2:
        raise RuntimeError("Official Sanabil logo lacks sufficient readable contrast.")
    print(f"PASS: {contrast_count} of {opaque_count} opaque logo pixels visibly contrast with background")


if __name__ == "__main__":
    main()
