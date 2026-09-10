import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

def create_master_icon(size=2048):
    # Master image 2048x2048 for supersampled crispness
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    
    # Create background squircle
    bg_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg_img)
    
    bg_color = (11, 18, 32, 255) # #0B1220
    radius = int(size * 0.22)
    bg_draw.rounded_rectangle([0, 0, size, size], radius=radius, fill=bg_color)
    
    # Subtle inner gradient ring / border
    border_color = (16, 185, 129, 90) # Emerald accent border
    bg_draw.rounded_rectangle([0, 0, size, size], radius=radius, outline=border_color, width=int(size * 0.012))

    # Inner subtle glow box
    glow_color = (56, 189, 248, 40) # Cyan glow
    bg_draw.rounded_rectangle([int(size * 0.03), int(size * 0.03), int(size * 0.97), int(size * 0.97)], radius=int(radius * 0.88), outline=glow_color, width=int(size * 0.008))

    img.alpha_composite(bg_img)

    # Drawing emblem layer
    emblem = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(emblem)

    cx, cy = size / 2, size * 0.44

    # 1. Outer Hexagon / Shield frame (representing Apex Structure & Nutrition)
    shield_radius = size * 0.32
    shield_pts = []
    for i in range(6):
        angle = math.radians(60 * i - 90)
        sx = cx + shield_radius * math.cos(angle)
        sy = cy + shield_radius * math.sin(angle) * 0.95
        shield_pts.append((sx, sy))

    # Draw outer ring of shield
    draw.polygon(shield_pts, outline=(30, 41, 59, 255), width=int(size * 0.025))

    # 2. Dynamic APEX 'A' Peak
    # Apex peak triangle coords
    top_peak = (cx, cy - size * 0.24)
    left_base = (cx - size * 0.22, cy + size * 0.20)
    right_base = (cx + size * 0.22, cy + size * 0.20)
    
    w = size * 0.075 # Line width

    # Left outer arm (Electric Cyan)
    left_arm = [
        top_peak,
        (top_peak[0] - w * 0.5, top_peak[1] + w * 0.7),
        (left_base[0] - w * 0.5, left_base[1]),
        (left_base[0] + w * 0.5, left_base[1]),
        (top_peak[0], top_peak[1] + w * 1.3)
    ]
    draw.polygon(left_arm, fill=(56, 189, 248, 255)) # #38BDF8 Cyan

    # Right outer arm (Emerald)
    right_arm = [
        top_peak,
        (top_peak[0] + w * 0.5, top_peak[1] + w * 0.7),
        (right_base[0] + w * 0.5, right_base[1]),
        (right_base[0] - w * 0.5, right_base[1]),
        (top_peak[0], top_peak[1] + w * 1.3)
    ]
    draw.polygon(right_arm, fill=(16, 185, 129, 255)) # #10B981 Emerald

    # 3. Dynamic Centerpiece: Vitality Leaf / Flame + Crossbar
    bar_y = cy + size * 0.04
    bar_w = size * 0.30
    bar_h = size * 0.048
    draw.rounded_rectangle([cx - bar_w / 2, bar_y - bar_h / 2, cx + bar_w / 2, bar_y + bar_h / 2], radius=int(bar_h * 0.5), fill=(52, 211, 153, 255))

    # Leaf emblem in the upper inner triangle
    leaf_cx = cx
    leaf_cy = cy - size * 0.07
    leaf_size = size * 0.085

    leaf_poly = [
        (leaf_cx, leaf_cy - leaf_size * 1.5),
        (leaf_cx + leaf_size * 0.85, leaf_cy - leaf_size * 0.2),
        (leaf_cx + leaf_size * 0.45, leaf_cy + leaf_size * 1.1),
        (leaf_cx, leaf_cy + leaf_size * 1.4),
        (leaf_cx - leaf_size * 0.45, leaf_cy + leaf_size * 1.1),
        (leaf_cx - leaf_size * 0.85, leaf_cy - leaf_size * 0.2),
    ]
    draw.polygon(leaf_poly, fill=(16, 185, 129, 255))
    draw.line([(leaf_cx, leaf_cy - leaf_size * 1.2), (leaf_cx, leaf_cy + leaf_size * 1.1)], fill=(255, 255, 255, 220), width=int(size * 0.009))

    # 4. Text "APEX" at the bottom of the logo
    try:
        font_path = "C:/Windows/Fonts/arialbd.ttf"
        font_size = int(size * 0.11)
        font = ImageFont.truetype(font_path, font_size)
    except Exception:
        font = ImageFont.load_default()

    text = "APEX"
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]

    tx = cx - tw / 2
    ty = size * 0.79 - th / 2

    # Draw text with subtle shadow
    draw.text((tx + 2, ty + 4), text, font=font, fill=(0, 0, 0, 150))
    draw.text((tx, ty), text, font=font, fill=(248, 250, 252, 255)) # White #F8FAFC

    # Small subtitle "NUTRITION"
    try:
        sub_font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", int(size * 0.042))
    except Exception:
        sub_font = font

    sub_text = "N U T R I T I O N"
    sbbox = sub_font.getbbox(sub_text)
    stw = sbbox[2] - sbbox[0]
    stx = cx - stw / 2
    sty = size * 0.88

    draw.text((stx, sty), sub_text, font=sub_font, fill=(16, 185, 129, 255)) # Emerald

    img.alpha_composite(emblem)
    return img

def generate_all_icons():
    print("Generating Master Logo...")
    master = create_master_icon(2048)

    os.makedirs("icons", exist_ok=True)

    sizes = {
        "icons/icon-512.png": 512,
        "icons/icon-192.png": 192,
        "icons/apple-touch-icon.png": 180,
        "icons/favicon-32x32.png": 32,
        "icons/favicon-16x16.png": 16,
        "icons/favicon.png": 64,
    }

    for path, sz in sizes.items():
        resized = master.resize((sz, sz), Image.Resampling.LANCZOS)
        resized.save(path, "PNG")
        print(f"Saved {path} ({sz}x{sz})")

    master.resize((32, 32), Image.Resampling.LANCZOS).save("favicon.ico", format="ICO")
    print("Saved favicon.ico")

if __name__ == '__main__':
    generate_all_icons()

