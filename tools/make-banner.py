#!/usr/bin/env python3
"""Generate the Android TV banner and launcher icon.

The banner is not a launcher icon: Google TV's apps row renders `android:banner` at
320x180, and without one the home-row entry is blank (PLAN.md P0, non-negotiable 4).

Regenerate with:

    python3 tools/make-banner.py

Writes app/src/main/res/drawable-xhdpi/banner.png (320x180) and
app/src/main/res/mipmap-xhdpi/ic_launcher.png (192x192). Pure stdlib on purpose — the
build must not grow an image-tooling dependency for two static assets.
"""

import os
import struct
import zlib

BG = (0x0E, 0x10, 0x16)
SCANLINE = (0x14, 0x17, 0x1F)
AMBER = (0xF2, 0xB1, 0x3C)
DIM_AMBER = (0x6B, 0x4E, 0x1B)

FONT = {
    "N": ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "G": [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
    "I": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    "X": ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
    " ": ["....."] * 7,
}

GLYPH_W, GLYPH_H = 5, 7


def blank(w, h, colour):
    return [[colour] * w for _ in range(h)]


def text_width(text, scale, tracking):
    return len(text) * (GLYPH_W * scale + tracking) - tracking


def draw_text(px, text, x, y, scale, colour, tracking):
    cursor = x
    for char in text:
        glyph = FONT[char]
        for row in range(GLYPH_H):
            for col in range(GLYPH_W):
                if glyph[row][col] != "#":
                    continue
                for dy in range(scale):
                    for dx in range(scale):
                        py, pxx = y + row * scale + dy, cursor + col * scale + dx
                        if 0 <= py < len(px) and 0 <= pxx < len(px[0]):
                            px[py][pxx] = colour
        cursor += GLYPH_W * scale + tracking


def draw_rect(px, x0, y0, x1, y1, colour):
    for y in range(max(0, y0), min(len(px), y1)):
        for x in range(max(0, x0), min(len(px[0]), x1)):
            px[y][x] = colour


def write_png(path, px):
    height, width = len(px), len(px[0])
    raw = b"".join(
        b"\x00" + b"".join(struct.pack("BBB", *px[y][x]) for x in range(width))
        for y in range(height)
    )

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(png)
    print(f"{path}  {width}x{height}  {len(png)} bytes")


def scanlines(px):
    for y in range(0, len(px), 3):
        for x in range(len(px[0])):
            px[y][x] = SCANLINE


def banner():
    w, h = 320, 180
    px = blank(w, h, BG)
    scanlines(px)

    # Thin amber frame, inset from the edge so it survives TV overscan cropping.
    draw_rect(px, 12, 12, w - 12, 14, DIM_AMBER)
    draw_rect(px, 12, h - 14, w - 12, h - 12, DIM_AMBER)
    draw_rect(px, 12, 12, 14, h - 12, DIM_AMBER)
    draw_rect(px, w - 14, 12, w - 12, h - 12, DIM_AMBER)

    scale, tracking = 5, 5
    line_one, line_two = "NOSTALGIA", "BOX"
    draw_text(px, line_one, (w - text_width(line_one, scale, tracking)) // 2, 52,
              scale, AMBER, tracking)
    draw_text(px, line_two, (w - text_width(line_two, scale, tracking)) // 2, 100,
              scale, AMBER, tracking)
    return px


def icon():
    size = 192
    px = blank(size, size, BG)
    scanlines(px)
    draw_rect(px, 16, 16, size - 16, 20, DIM_AMBER)
    draw_rect(px, 16, size - 20, size - 16, size - 16, DIM_AMBER)
    draw_rect(px, 16, 16, 20, size - 16, DIM_AMBER)
    draw_rect(px, size - 20, 16, size - 16, size - 16, DIM_AMBER)

    scale, tracking = 12, 8
    draw_text(px, "NB", (size - text_width("NB", scale, tracking)) // 2,
              (size - GLYPH_H * scale) // 2, scale, AMBER, tracking)
    return px


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    write_png(os.path.join(root, "app/src/main/res/drawable-xhdpi/banner.png"), banner())
    write_png(os.path.join(root, "app/src/main/res/mipmap-xhdpi/ic_launcher.png"), icon())
