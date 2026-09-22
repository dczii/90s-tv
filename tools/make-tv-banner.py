#!/usr/bin/env python3
"""Composite the Leanback banner from the watch/rest dial icon.

320x180 `android:banner` / config-tv `androidTVBanner`. The launcher icon at
`apps/tv/assets/tv-icon.png` is the authored asset — this script does not
redraw it.

    python3 tools/make-tv-banner.py
"""

from __future__ import annotations

import os
import struct
import zlib

NAVY = (0x0A, 0x10, 0x1C)
OFF_WHITE = (0xF5, 0xF2, 0xEA)

FONT = {
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "I": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
}

GLYPH_W, GLYPH_H = 5, 7

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_PATH = os.path.join(ROOT, "apps/tv/assets/tv-icon.png")
BANNER_PATH = os.path.join(ROOT, "apps/tv/assets/tv-banner.png")


def blank(w, h, colour):
    return [[colour] * w for _ in range(h)]


def paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def read_png(path):
    with open(path, "rb") as handle:
        data = handle.read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"not a PNG: {path}")
    pos = 8
    width = height = bit_depth = color_type = None
    palette = None
    idat = bytearray()
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        tag = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if tag == b"IHDR":
            width, height, bit_depth, color_type, comp, filt, inter = struct.unpack(
                ">IIBBBBB", chunk
            )
            if bit_depth != 8 or inter != 0 or comp != 0:
                raise ValueError("unsupported PNG")
        elif tag == b"PLTE":
            palette = [tuple(chunk[i : i + 3]) for i in range(0, len(chunk), 3)]
        elif tag == b"IDAT":
            idat += chunk
        elif tag == b"IEND":
            break
    raw = zlib.decompress(bytes(idat))
    bpp = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color_type]
    stride = width * bpp
    rows = []
    prev = bytearray(stride)
    i = 0
    for _ in range(height):
        ftype = raw[i]
        i += 1
        filt = raw[i : i + stride]
        i += stride
        recon = bytearray(stride)
        for x in range(stride):
            left = recon[x - bpp] if x >= bpp else 0
            up = prev[x]
            up_left = prev[x - bpp] if x >= bpp else 0
            v = filt[x]
            if ftype == 0:
                recon[x] = v
            elif ftype == 1:
                recon[x] = (v + left) & 255
            elif ftype == 2:
                recon[x] = (v + up) & 255
            elif ftype == 3:
                recon[x] = (v + ((left + up) // 2)) & 255
            elif ftype == 4:
                recon[x] = (v + paeth(left, up, up_left)) & 255
            else:
                raise ValueError(f"filter {ftype}")
        prev = recon
        row = []
        if color_type == 2:
            for x in range(0, stride, 3):
                row.append((recon[x], recon[x + 1], recon[x + 2]))
        elif color_type == 6:
            for x in range(0, stride, 4):
                row.append((recon[x], recon[x + 1], recon[x + 2]))
        elif color_type == 0:
            for x in range(stride):
                row.append((recon[x], recon[x], recon[x]))
        elif color_type == 3:
            for x in range(stride):
                row.append(palette[recon[x]])
        else:
            raise ValueError(f"color type {color_type}")
        rows.append(row)
    return rows


def write_png(path, px):
    height, width = len(px), len(px[0])
    raw = b"".join(
        b"\x00" + b"".join(struct.pack("BBB", *px[y][x][:3]) for x in range(width))
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


def scale(px, nw, nh):
    oh, ow = len(px), len(px[0])
    out = blank(nw, nh, NAVY)
    for y in range(nh):
        y0 = y * oh // nh
        y1 = max(y0 + 1, (y + 1) * oh // nh)
        for x in range(nw):
            x0 = x * ow // nw
            x1 = max(x0 + 1, (x + 1) * ow // nw)
            r = g = b = n = 0
            for yy in range(y0, y1):
                for xx in range(x0, x1):
                    pr, pg, pb = px[yy][xx][:3]
                    r += pr
                    g += pg
                    b += pb
                    n += 1
            out[y][x] = (r // n, g // n, b // n)
    return out


def blit(dst, src, x, y):
    for sy, row in enumerate(src):
        dy = y + sy
        if dy < 0 or dy >= len(dst):
            continue
        for sx, pix in enumerate(row):
            dx = x + sx
            if 0 <= dx < len(dst[0]):
                dst[dy][dx] = pix[:3]


def text_width(text, scale_n, tracking):
    return len(text) * (GLYPH_W * scale_n + tracking) - tracking


def draw_text(px, text, x, y, scale_n, colour, tracking):
    cursor = x
    for char in text:
        glyph = FONT[char]
        for row in range(GLYPH_H):
            for col in range(GLYPH_W):
                if glyph[row][col] != "#":
                    continue
                for dy in range(scale_n):
                    for dx in range(scale_n):
                        py, pxx = y + row * scale_n + dy, cursor + col * scale_n + dx
                        if 0 <= py < len(px) and 0 <= pxx < len(px[0]):
                            px[py][pxx] = colour
        cursor += GLYPH_W * scale_n + tracking


def banner_from_icon(icon_px):
    w, h = 320, 180
    px = blank(w, h, NAVY)
    mark = scale(icon_px, 128, 128)
    blit(px, mark, 16, (h - 128) // 2)
    scale_n, tracking = 3, 3
    line_one, line_two = "LITTLE", "PLAY"
    text_x = 156
    block_h = GLYPH_H * scale_n * 2 + 10
    text_y = (h - block_h) // 2
    draw_text(px, line_one, text_x, text_y, scale_n, OFF_WHITE, tracking)
    draw_text(
        px,
        line_two,
        text_x,
        text_y + GLYPH_H * scale_n + 10,
        scale_n,
        OFF_WHITE,
        tracking,
    )
    return px


def write_banner(icon_path=ICON_PATH, banner_path=BANNER_PATH):
    icon_px = read_png(icon_path)
    write_png(banner_path, banner_from_icon(icon_px))
    return icon_px


if __name__ == "__main__":
    write_banner()
