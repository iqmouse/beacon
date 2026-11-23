#!/usr/bin/env python3
"""Deterministic Beacon icons: dark rounded tile, amber beacon dot with a
soft glow, translucent light cone. Pure stdlib (zlib+struct) PNG writer."""
import zlib, struct, math, os

BG = (15, 27, 34)       # #0F1B22
AMBER = (240, 178, 78)  # #F0B24E

def make(size):
    px = bytearray()
    r_corner = size * 0.22
    cx, cy, r_dot = size / 2, size * 0.40, size * 0.12
    glow = size * 0.30
    for y in range(size):
        row = bytearray()
        for x in range(size):
            dx = max(r_corner - x, x - (size - 1 - r_corner), 0)
            dy = max(r_corner - y, y - (size - 1 - r_corner), 0)
            if dx * dx + dy * dy > r_corner * r_corner:
                row += bytes((0, 0, 0, 0)); continue
            r, g, b = BG
            if y > cy:
                t = (y - cy) / (size - cy)
                half = size * (0.06 + 0.34 * t)
                if abs(x - cx) < half:
                    a = 0.22 * (1 - 0.3 * t)
                    r = r + (AMBER[0] - r) * a
                    g = g + (AMBER[1] - g) * a
                    b = b + (AMBER[2] - b) * a
            d = math.hypot(x - cx, y - cy)
            if d < glow:
                a = max(0.0, 1 - d / glow) ** 2 * 0.55
                r = r + (AMBER[0] - r) * a
                g = g + (AMBER[1] - g) * a
                b = b + (AMBER[2] - b) * a
            if d < r_dot:
                r, g, b = AMBER
            row += bytes((int(r), int(g), int(b), 255))
        px += b'\x00' + row
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) +
            chunk(b'IDAT', zlib.compress(bytes(px), 9)) + chunk(b'IEND', b''))

for size, name in [(180, 'apple-touch-icon.png'), (32, 'favicon.png')]:
    path = os.path.join('dist', name)
    open(path, 'wb').write(make(size))
    print(name, os.path.getsize(path), 'bytes')
