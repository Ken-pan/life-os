#!/usr/bin/env python3
"""Generate shape-optimized Life OS brand icon derivatives.

Shapes
------
- squircle: full app icon artwork (PWA, apple-touch, OG)
- circle:   center emblem crop for inline UI + favicon
- maskable: squircle on solid plate with safe-zone padding (Android adaptive)

Usage:
  python3 scripts/generate-life-os-brand-icons.py                 # 全部既有 app
  python3 scripts/generate-life-os-brand-icons.py --app music     # 只重建一个
  python3 scripts/generate-life-os-brand-icons.py --bootstrap reading
      # PLAT.GEN.2: 新 app 从 app.manifest.json 生成中性占位 master
      # (themeColor 底 + wordmarkAccent 首字母) → 全套派生 → 注入 webmanifest
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[1]

# Center circle diameter as fraction of source square (inner felt patch).
CIRCLE_DIAMETER_RATIO = 0.64

# Maskable: artwork occupies this fraction inside the 512 canvas.
MASKABLE_ARTWORK_RATIO = 0.78

DARK_PLATE = (13, 13, 14, 255)


def circle_crop(im: Image.Image, diameter_ratio: float = CIRCLE_DIAMETER_RATIO) -> Image.Image:
    w, h = im.size
    d = int(min(w, h) * diameter_ratio)
    cx, cy = w // 2, h // 2
    left, top = cx - d // 2, cy - d // 2
    cropped = im.crop((left, top, left + d, top + d))
    mask = Image.new("L", (d, d), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, d - 1, d - 1), fill=255)
    out = Image.new("RGBA", (d, d), (0, 0, 0, 0))
    out.paste(cropped, (0, 0), mask)
    return out


def resize_square(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.Resampling.LANCZOS)


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    im.save(path, format="PNG", optimize=True)


def make_maskable(im: Image.Image, size: int = 512, plate: tuple[int, int, int, int] = DARK_PLATE) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), plate)
    art_size = int(size * MASKABLE_ARTWORK_RATIO)
    art = resize_square(im, art_size)
    offset = (size - art_size) // 2
    canvas.paste(art, (offset, offset), art)
    return canvas


def generate_set(source_dark: Path, source_light: Path, out_dir: Path, *, prefix: str = "") -> dict:
    """Generate all derivatives for one app into out_dir."""
    dark = Image.open(source_dark).convert("RGBA")
    light = Image.open(source_light).convert("RGBA")

    dark_circle = circle_crop(dark)
    light_circle = circle_crop(light)

    p = lambda name: out_dir / f"{prefix}{name}" if prefix else out_dir / name

    # --- Squircle (app / PWA / system) ---
    for size, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")]:
        save_png(resize_square(dark, size), p(name))

    save_png(make_maskable(dark, 512), p("icon-512-maskable.png"))

    # --- Favicon (circle, dark only) ---
    for size, name in [(32, "favicon-32.png"), (16, "favicon-16.png")]:
        save_png(resize_square(dark_circle, size), p(name))

    # --- Inline UI brand marks (circle, theme-aware) ---
    for size, suffix in [(96, "96"), (64, "64"), (48, "48")]:
        save_png(resize_square(dark_circle, size), p(f"brand-circle-dark-{suffix}.png"))
        save_png(resize_square(light_circle, size), p(f"brand-circle-light-{suffix}.png"))

    # --- Notifications / media session (squircle) ---
    save_png(resize_square(dark, 192), p("notify-192.png"))

    # --- Extension / compact squircle ---
    for size, name in [(128, "icon-128.png"), (48, "icon-48.png"), (32, "icon-32.png"), (16, "icon-16.png")]:
        save_png(resize_square(dark_circle, size), p(name))

    # Keep full masters for reference / OG
    save_png(dark, p("icon-dark.png"))
    save_png(light, p("icon-light.png"))

    return {
        "out_dir": str(out_dir.relative_to(REPO)),
        "circle_ratio": CIRCLE_DIAMETER_RATIO,
        "files": sorted(x.name for x in out_dir.glob("*.png")),
    }


def hex_to_rgba(value: str) -> tuple[int, int, int, int]:
    v = value.lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    return (int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16), 255)


def make_placeholder_master(letter: str, plate_hex: str, accent_hex: str, size: int = 1024) -> Image.Image:
    """中性占位 master: 圆角方形底板 + 居中首字母(落在 64% 圆裁剪安全区内)。"""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    radius = int(size * 0.22)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=hex_to_rgba(plate_hex))
    font = ImageFont.truetype(str(REPO / "NotoSansCJKsc-Regular.otf"), int(size * 0.42))
    draw.text((size / 2, size / 2), letter, font=font, fill=hex_to_rgba(accent_hex), anchor="mm")
    return im


def patch_webmanifest(app_id: str, manifest: dict) -> None:
    """把 PWA 必需字段与 icons 数组注入 apps/<id>/static/manifest.webmanifest。"""
    path = REPO / f"apps/{app_id}/static/manifest.webmanifest"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    data.update(
        {
            "id": "/",
            "name": manifest["name"],
            "short_name": manifest["shortName"],
            "description": manifest["description"]["zh"],
            "start_url": "/",
            "scope": "/",
            "display": "standalone",
            "display_override": ["standalone", "minimal-ui"],
            "orientation": "portrait-primary",
            "background_color": manifest["themeColor"]["dark"],
            "theme_color": manifest["themeColor"]["dark"],
            "lang": manifest.get("locale", "zh-CN"),
            "dir": "ltr",
            "categories": manifest.get("categories", ["utilities"]),
            "icons": [
                {"src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
                {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                {
                    "src": "/icon-512-maskable.png",
                    "sizes": "512x512",
                    "type": "image/png",
                    "purpose": "maskable",
                },
            ],
        }
    )
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def bootstrap_app(app_id: str) -> dict:
    """PLAT.GEN.2: 从 app.manifest.json 生成占位 master + 全套派生 + webmanifest。"""
    manifest_path = REPO / f"apps/{app_id}/app.manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"缺少 {manifest_path} — 先跑 create-life-os-app.mjs {app_id}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    accent = manifest.get("wordmarkAccent") or {"light": "#5b6a79", "dark": "#a9b6c4"}
    theme = manifest["themeColor"]
    letter = manifest["shortName"][0].upper()
    out = REPO / f"apps/{app_id}/static"

    dark_master = make_placeholder_master(letter, theme["dark"], accent["dark"])
    light_master = make_placeholder_master(letter, theme["light"], accent["light"])
    save_png(dark_master, out / "icon-dark.png")
    save_png(light_master, out / "icon-light.png")

    info = generate_set(out / "icon-dark.png", out / "icon-light.png", out)
    patch_webmanifest(app_id, manifest)
    return info


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", help="只处理一个既有 app(如 music)")
    parser.add_argument("--bootstrap", metavar="ID", help="新 app: 从 manifest 生成占位图标全套")
    args = parser.parse_args()

    if args.bootstrap:
        info = bootstrap_app(args.bootstrap)
        print(f"bootstrap {args.bootstrap}: {len(info['files'])} files -> {info['out_dir']}")
        print("占位图标已生成; 定稿品牌时替换 icon-dark.png / icon-light.png 后重跑 --app 即可。")
        return

    apps = {
        "planner": {
            "dark": REPO / "apps/planner/static/icon-dark.png",
            "light": REPO / "apps/planner/static/icon-light.png",
            "out": REPO / "apps/planner/static",
        },
        "fitness": {
            "dark": REPO / "apps/fitness/static/icon-dark.png",
            "light": REPO / "apps/fitness/static/icon-light.png",
            "out": REPO / "apps/fitness/static",
        },
        "music": {
            "dark": REPO / "apps/music/static/icon-dark.png",
            "light": REPO / "apps/music/static/icon-light.png",
            "out": REPO / "apps/music/static",
        },
        "finance": {
            "dark": REPO / "apps/finance/public/assets/brand/icon-dark.png",
            "light": REPO / "apps/finance/public/assets/brand/icon-light.png",
            "out": REPO / "apps/finance/public/assets/brand",
        },
        "home": {
            "dark": REPO / "apps/home/static/icon-dark.png",
            "light": REPO / "apps/home/static/icon-light.png",
            "out": REPO / "apps/home/static",
        },
        "aios": {
            "dark": REPO / "apps/aios/static/icon-dark.png",
            "light": REPO / "apps/aios/static/icon-light.png",
            "out": REPO / "apps/aios/static",
        },
    }

    if args.app:
        if args.app not in apps:
            raise SystemExit(f"未知 app: {args.app}(可选: {', '.join(apps)};新 app 用 --bootstrap)")
        apps = {args.app: apps[args.app]}

    summary = {}
    for app_id, cfg in apps.items():
        summary[app_id] = generate_set(cfg["dark"], cfg["light"], cfg["out"])

    # Finance browser extension (circle for toolbar, squircle for store listing)
    if "finance" in apps:
        brand = REPO / "apps/finance/public/assets/brand"
        ext_icons = REPO / "apps/finance/extension/icons"
        ext_popup = REPO / "apps/finance/extension/popup"
        for size in (16, 32, 48, 128):
            src = brand / f"icon-{size}.png"
            dst = ext_icons / f"icon{size}.png"
            dst.write_bytes(src.read_bytes())
        (ext_popup / "brand-mark.png").write_bytes((brand / "brand-circle-dark-64.png").read_bytes())

    if not args.app:
        manifest_path = REPO / "docs/assets/life-os-logos/icon-manifest.json"
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {manifest_path}")
    for app_id, info in summary.items():
        print(f"  {app_id}: {len(info['files'])} files -> {info['out_dir']}")


if __name__ == "__main__":
    main()
