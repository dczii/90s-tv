#!/usr/bin/env python3
"""Copy the React Native TV banner/icon into the historical Kotlin app tree.

    python3 tools/make-banner.py

Reads `apps/tv/assets/tv-icon.png` (watch/rest dial) and writes:
  app/src/main/res/drawable-xhdpi/banner.png (320x180)
  app/src/main/res/mipmap-xhdpi/ic_launcher.png (192x192)
"""

from __future__ import annotations

import importlib.util
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_tv():
    path = os.path.join(os.path.dirname(__file__), "make-tv-banner.py")
    spec = importlib.util.spec_from_file_location("make_tv_banner", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


if __name__ == "__main__":
    tv = load_tv()
    icon_px = tv.read_png(tv.ICON_PATH)
    tv.write_png(
        os.path.join(ROOT, "app/src/main/res/drawable-xhdpi/banner.png"),
        tv.banner_from_icon(icon_px),
    )
    tv.write_png(
        os.path.join(ROOT, "app/src/main/res/mipmap-xhdpi/ic_launcher.png"),
        tv.scale(icon_px, 192, 192),
    )
