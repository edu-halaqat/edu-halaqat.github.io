#!/usr/bin/env python3
"""Build Sanabil PWA badges from the institution's existing approved PNG logo."""
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SOURCE = BASE / "assets/logo-sanabil-icon-v6.png"
TARGET = BASE / "assets"
logo = Image.open(SOURCE).convert("RGBA")
bbox = logo.getbbox()
if bbox:
    logo = logo.crop(bbox)

def make(size, maskable=False):
    scale = 4
    S = size * scale
    bg = Image.new("RGBA", (S, S), "#063D41")
    draw = ImageDraw.Draw(bg)
    # Rounded emerald square, subtle golden outline and sufficient icon safe area
    inset = int(S * 0.015)
    draw.rounded_rectangle((inset,inset,S-inset,S-inset),radius=int(S*0.21),
                           fill="#07494C",outline="#D8BD88",width=max(2,int(S*0.013)))
    inner_size = int(S * (0.64 if maskable else 0.76))
    original = logo.copy()
    original.thumbnail((inner_size,inner_size),Image.Resampling.LANCZOS)
    x=(S-original.width)//2
    y=(S-original.height)//2 - int(S*0.016)
    bg.alpha_composite(original,(x,y))
    return bg.convert("RGB").resize((size,size),Image.Resampling.LANCZOS)

make(192).save(TARGET/"sanabil-app-192.png",optimize=True)
make(512).save(TARGET/"sanabil-app-512.png",optimize=True)
make(512,True).save(TARGET/"sanabil-app-maskable-512.png",optimize=True)
print("Created PWA icons 192 and 512 with branded maskable badge")
