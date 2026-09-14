#!/usr/bin/env python3
"""Generate the Leanback banner and launcher icon for apps/tv.

320x180 banner (android:banner / config-tv androidTVBanner) and 1024x1024
icon. Pure stdlib PNG — same approach as tools/make-banner.py.
"""

import os
import struct
import zlib

NAVY = (0x0E, 0x10, 0x16)
SCANLINE = (0x14, 0x17, 0x1F)
CORAL = (0xE0, 0x7A, 0x5F)
OFF_WHITE = (0xF4, 0xEF, 0xE6)
DIM_CORAL = (0x6B, 0x3A, 0x32)

FONT = {
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    "C": [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
    "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "I": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    "M": ["#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "V": ["#...#", "#...#", "#...#", "#...#", ".#.#.", ".#.#.", "..#.."],
    "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
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
    px = blank(w, h, NAVY)
    scanlines(px)
    draw_rect(px, 12, 12, w - 12, 14, DIM_CORAL)
    draw_rect(px, 12, h - 14, w - 12, h - 12, DIM_CORAL)
    draw_rect(px, 12, 12, 14, h - 12, DIM_CORAL)
    draw_rect(px, w - 14, 12, w - 12, h - 12, DIM_CORAL)
    draw_rect(px, 24, h - 28, w - 24, h - 22, CORAL)

    scale, tracking = 3, 3
    line_one, line_two = "TIMED", "YOUTUBE TV"
    draw_text(px, line_one, (w - text_width(line_one, scale, tracking)) // 2, 48,
              scale, OFF_WHITE, tracking)
    draw_text(px, line_two, (w - text_width(line_two, scale, tracking)) // 2, 84,
              scale, OFF_WHITE, tracking)
    return px


def icon():
    size = 1024
    px = blank(size, size, NAVY)
    scanlines(px)
    draw_rect(px, 64, 64, size - 64, 80, DIM_CORAL)
    draw_rect(px, 64, size - 80, size - 64, size - 64, DIM_CORAL)
    draw_rect(px, 64, 64, 80, size - 64, DIM_CORAL)
    draw_rect(px, size - 80, 64, size - 64, size - 64, DIM_CORAL)
    draw_rect(px, 160, size - 200, size - 160, size - 160, CORAL)

    scale, tracking = 28, 16
    draw_text(px, "TV", (size - text_width("TV", scale, tracking)) // 2,
              (size - GLYPH_H * scale) // 2 - 20, scale, OFF_WHITE, tracking)
    return px


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    write_png(os.path.join(root, "apps/tv/assets/tv-banner.png"), banner())
    write_png(os.path.join(root, "apps/tv/assets/tv-icon.png"), icon())
