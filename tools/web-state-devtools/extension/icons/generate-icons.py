#!/usr/bin/env python3
"""Generate Web State DevTools extension icons (standalone branding)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent
SIZES = (16, 32, 48, 128)

# Dev-tool palette — not shared with Life OS app brands
BG = (30, 41, 59, 255)       # slate-800
ACCENT = (34, 211, 238, 255)  # cyan-400
NODE = (148, 163, 184, 255)   # slate-400
LINE = (71, 85, 105, 255)    # slate-600


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = max(1, size // 16)
    r = size // 8

    # Rounded tile background
    d.rounded_rectangle(
        (pad, pad, size - pad - 1, size - pad - 1),
        radius=r,
        fill=BG,
    )

    # DOM tree motif: root node + two children + connectors
    cx = size / 2
    node_w = size * 0.28
    node_h = size * 0.14
    root_y = size * 0.28
    child_y = size * 0.62
    left_x = size * 0.28
    right_x = size * 0.72

    def node_box(x: float, y: float, fill: tuple[int, int, int, int]) -> tuple[float, float, float, float]:
        x0 = x - node_w / 2
        y0 = y - node_h / 2
        x1 = x + node_w / 2
        y1 = y + node_h / 2
        nr = max(1, size // 20)
        d.rounded_rectangle((x0, y0, x1, y1), radius=nr, fill=fill)
        return x0, y0, x1, y1

    # Connectors
    sw = max(1, size // 24)
    d.line((cx, root_y + node_h / 2, cx, child_y - node_h), fill=LINE, width=sw)
    d.line((left_x, child_y - node_h / 2, right_x, child_y - node_h / 2), fill=LINE, width=sw)
    d.line((left_x, child_y - node_h / 2, left_x, child_y - node_h), fill=LINE, width=sw)
    d.line((right_x, child_y - node_h / 2, right_x, child_y - node_h), fill=LINE, width=sw)

    node_box(cx, root_y, ACCENT)
    node_box(left_x, child_y, NODE)
    node_box(right_x, child_y, NODE)

    # Capture dot (state indicator)
    dot_r = max(1, size // 16)
    d.ellipse(
        (size - pad - dot_r * 2.5, pad + 1, size - pad - 1, pad + dot_r * 2 + 1),
        fill=ACCENT,
    )

    return img


def main() -> None:
    for s in SIZES:
        path = OUT / f"icon{s}.png"
        draw_icon(s).save(path, format="PNG")
        print(f"wrote {path.name}")


if __name__ == "__main__":
    main()
