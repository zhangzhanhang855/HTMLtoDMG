#!/usr/bin/env python3
import os
import subprocess
from PIL import Image, ImageDraw, ImageFont

def create_base_icon(size=1024):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rectangle background
    corner_radius = int(size * 0.22)
    bg_box = [int(size * 0.05), int(size * 0.05), int(size * 0.95), int(size * 0.95)]
    draw.rounded_rectangle(bg_box, radius=corner_radius, fill="#13161c", outline="#2b313d", width=int(size * 0.015))

    # Outer vinyl ring
    center = size / 2
    ring_radius = int(size * 0.36)
    draw.ellipse(
        [center - ring_radius, center - ring_radius, center + ring_radius, center + ring_radius],
        outline="#1e232d",
        width=int(size * 0.05)
    )

    # Accent neon ring
    accent_radius = int(size * 0.26)
    draw.ellipse(
        [center - accent_radius, center - accent_radius, center + accent_radius, center + accent_radius],
        outline="#007aff",
        width=int(size * 0.02)
    )

    # Center label circle
    core_radius = int(size * 0.14)
    draw.ellipse(
        [center - core_radius, center - core_radius, center + core_radius, center + core_radius],
        fill="#0a84ff"
    )

    # "JR" Monogram
    font_size = int(size * 0.12)
    try:
        font = ImageFont.truetype("Arial.ttf", font_size)
    except IOError:
        font = ImageFont.load_default()

    text = "JR"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    draw.text((center - text_w / 2, center - text_h / 2 - (size * 0.01)), text, fill="#ffffff", font=font)

    return img

def create_dmg_background(width=660, height=400):
    img = Image.new("RGB", (width, height), "#181a20")
    draw = ImageDraw.Draw(img)

    # Subtle arrow pointing from app to Applications folder
    arrow_color = "#353b48"
    draw.line([(280, 200), (370, 200)], fill=arrow_color, width=4)
    draw.polygon([(365, 190), (385, 200), (365, 210)], fill=arrow_color)

    # Label text
    try:
        font = ImageFont.truetype("Arial.ttf", 16)
    except IOError:
        font = ImageFont.load_default()

    label = "Drag JRmusic to Applications"
    bbox = draw.textbbox((0, 0), label, font=font)
    draw.text(((width - (bbox[2] - bbox[0])) / 2, 60), label, fill="#7f8c8d", font=font)

    os.makedirs("assets", exist_ok=True)
    img.save("assets/dmg_background.png")
    print("DMG background created at assets/dmg_background.png")

def make_icns():
    base_img = create_base_icon(1024)
    iconset_dir = "AppIcon.iconset"
    os.makedirs(iconset_dir, exist_ok=True)

    sizes = [
        (16, "icon_16x16.png"),
        (32, "icon_16x16@2x.png"),
        (32, "icon_32x32.png"),
        (64, "icon_32x32@2x.png"),
        (128, "icon_128x128.png"),
        (256, "icon_128x128@2x.png"),
        (256, "icon_256x256.png"),
        (512, "icon_256x256@2x.png"),
        (512, "icon_512x512.png"),
        (1024, "icon_512x512@2x.png"),
    ]

    for px, name in sizes:
        resized = base_img.resize((px, px), Image.Resampling.LANCZOS)
        resized.save(os.path.join(iconset_dir, name))

    os.makedirs("JRmusic/Resources", exist_ok=True)
    subprocess.run(["iconutil", "-c", "icns", iconset_dir, "-o", "JRmusic/Resources/AppIcon.icns"], check=True)
    subprocess.run(["rm", "-rf", iconset_dir])
    print("AppIcon.icns generated at JRmusic/Resources/AppIcon.icns")

if __name__ == "__main__":
    make_icns()
    create_dmg_background()
