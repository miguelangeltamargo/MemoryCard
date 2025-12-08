#!/usr/bin/env python3
"""
Create a Tahoe-style macOS icon with rounded corners and border.
Requires: pip install Pillow
"""

from PIL import Image, ImageDraw, ImageFilter
import os

def create_tahoe_icon(input_path, output_path, size=1024):
    """
    Create a modern macOS (Tahoe) style icon with:
    - Rounded square background
    - Subtle gradient
    - Drop shadow
    - Centered logo
    """
    # Create a new image with alpha channel
    icon = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(icon)

    # Calculate rounded rectangle dimensions
    # macOS icons use approximately 22.37% corner radius
    corner_radius = int(size * 0.2237)

    # Create rounded rectangle background with gradient
    # Using a blue gradient similar to macOS style
    for y in range(size):
        # Gradient from lighter blue at top to darker at bottom
        r = int(59 + (30 - 59) * (y / size))
        g = int(130 + (90 - 130) * (y / size))
        b = int(246 + (200 - 246) * (y / size))
        color = (r, g, b, 255)

        # Draw horizontal line for gradient
        draw.rectangle([(0, y), (size, y+1)], fill=color)

    # Create rounded corner mask
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([(0, 0), (size, size)], corner_radius, fill=255)

    # Apply mask to create rounded corners
    icon.putalpha(mask)

    # Add subtle border
    border_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    border_draw = ImageDraw.Draw(border_img)
    border_width = max(2, int(size * 0.005))
    border_draw.rounded_rectangle(
        [(border_width//2, border_width//2), (size-border_width//2, size-border_width//2)],
        corner_radius,
        outline=(255, 255, 255, 60),
        width=border_width
    )
    icon = Image.alpha_composite(icon, border_img)

    # Load and center the logo
    try:
        logo = Image.open(input_path).convert('RGBA')

        # Resize logo to fit (about 70% of icon size)
        logo_size = int(size * 0.7)
        logo.thumbnail((logo_size, logo_size), Image.Resampling.LANCZOS)

        # Calculate position to center logo
        logo_x = (size - logo.width) // 2
        logo_y = (size - logo.height) // 2

        # Paste logo onto icon
        icon.paste(logo, (logo_x, logo_y), logo)
    except Exception as e:
        print(f"Warning: Could not load logo: {e}")
        print("Creating icon with background only")

    # Add subtle drop shadow effect
    shadow = Image.new('RGBA', (size + 40, size + 40), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        [(20, 20), (size + 20, size + 20)],
        corner_radius,
        fill=(0, 0, 0, 40)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))

    # Composite shadow and icon
    final = Image.new('RGBA', (size + 40, size + 40), (0, 0, 0, 0))
    final.paste(shadow, (0, 0))
    final.paste(icon, (20, 20), icon)

    # Crop back to original size
    final = final.crop((20, 20, size + 20, size + 20))

    # Save
    final.save(output_path, 'PNG')
    print(f"✓ Created Tahoe-style icon: {output_path}")

if __name__ == '__main__':
    input_file = 'design/mmcd.png'
    output_file = 'design/mmcd_tahoe.png'

    if not os.path.exists(input_file):
        print(f"Error: Input file not found: {input_file}")
        exit(1)

    print("Creating Tahoe-style icon...")
    create_tahoe_icon(input_file, output_file, size=1024)
    print(f"\nIcon created! Use this command to generate all platform icons:")
    print(f"  cd desktop-app && npx @tauri-apps/cli icon ../design/mmcd_tahoe.png")
