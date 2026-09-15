#!/usr/bin/env python3
"""Drive LittlePlay through first-run wizard + baby video allowlist."""

from __future__ import annotations

import re
import subprocess
import sys
import time

SERIAL = sys.argv[1] if len(sys.argv) > 1 else "192.168.254.110:39979"
PKG = "com.littleplay.tv"
ACTIVITY = f"{PKG}/.MainActivity"

# Public kids/nursery YouTube videos (stable IDs)
BABY_VIDEOS = [
    "https://www.youtube.com/watch?v=XqZsoesa55w",  # Baby Shark Dance — Pinkfong
    "https://www.youtube.com/watch?v=020g-0hhCAU",  # Baby Shark — CoComelon
    "https://www.youtube.com/watch?v=hq3yfQnllfQ",  # Wheels on the Bus — CoComelon
]


def sh(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["adb", "-s", SERIAL, *args],
        check=check,
        text=True,
        capture_output=True,
    )


def log(msg: str) -> None:
    print(f"[e2e] {msg}", flush=True)


def dump() -> str:
    sh("shell", "uiautomator", "dump", "/sdcard/ui.xml")
    sh("pull", "/sdcard/ui.xml", "/tmp/tv-ui.xml")
    return open("/tmp/tv-ui.xml", encoding="utf-8").read()


def texts(xml: str) -> list[str]:
    return re.findall(r'text="([^"]*)"', xml)


def wait_texts(predicate, timeout: float = 25.0, label: str = "ui") -> str:
    deadline = time.time() + timeout
    last = ""
    while time.time() < deadline:
        last = dump()
        t = texts(last)
        if predicate(t, last):
            return last
        time.sleep(0.7)
    log(f"TIMEOUT waiting for {label}: {texts(last)[:20]}")
    raise SystemExit(1)


def bounds(xml: str, label: str) -> tuple[int, int, int, int] | None:
    esc = re.escape(label)
    patterns = [
        rf'content-desc="{esc}"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
        rf'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*content-desc="{esc}"',
        rf'text="{esc}"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
        rf'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*text="{esc}"',
    ]
    for p in patterns:
        ms = list(re.finditer(p, xml))
        if ms:
            return tuple(map(int, ms[-1].groups()))  # type: ignore[return-value]
    return None


def tap_label(xml: str, label: str, *, scroll_if_low: bool = True) -> bool:
    b = bounds(xml, label) or bounds(xml, f"Digit {label}")
    if not b:
        log(f"miss '{label}'")
        return False
    x1, y1, x2, y2 = b
    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
    if scroll_if_low and cy > 980:
        sh("shell", "input", "swipe", "960", "850", "960", "350", "300")
        time.sleep(0.4)
        xml = dump()
        b = bounds(xml, label) or bounds(xml, f"Digit {label}")
        if not b:
            log(f"miss after scroll '{label}'")
            return False
        x1, y1, x2, y2 = b
        cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
    log(f"tap '{label}' @ {cx},{cy}")
    sh("shell", "input", "tap", str(cx), str(cy))
    return True


def tap_digit(digit: str) -> None:
    """Prefer content-desc Digit N so we never hit unrelated '1'/'2' text."""
    xml = ensure_keypad_visible()
    label = f"Digit {digit}"
    b = bounds(xml, label)
    if not b:
        raise SystemExit(f"missing {label}")
    x1, y1, x2, y2 = b
    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
    log(f"tap {label} @ {cx},{cy}")
    sh("shell", "input", "tap", str(cx), str(cy))


def swipe_up(n: int = 1) -> None:
    for _ in range(n):
        sh("shell", "input", "swipe", "960", "900", "960", "250", "350")
        time.sleep(0.45)


def swipe_down(n: int = 1) -> None:
    for _ in range(n):
        sh("shell", "input", "swipe", "960", "300", "960", "900", "350")
        time.sleep(0.45)


def ensure_metro_and_launch() -> None:
    # reverse must exist before launch for debug APK
    sh("reverse", "tcp:8081", "tcp:8081", check=False)
    sh("shell", "pm", "clear", PKG)
    sh("reverse", "tcp:8081", "tcp:8081", check=False)
    sh("logcat", "-c", check=False)
    sh("shell", "am", "start", "-n", ACTIVITY)
    # wait for JS
    deadline = time.time() + 40
    while time.time() < deadline:
        out = sh("logcat", "-d", check=False).stdout
        if 'Running "main"' in out:
            log("JS Running main")
            break
        if "Unable to load script" in out:
            log("reload after Unable to load script")
            sh("reverse", "tcp:8081", "tcp:8081", check=False)
            sh("shell", "input", "keyevent", "46")
            time.sleep(0.2)
            sh("shell", "input", "keyevent", "46")
            time.sleep(5)
        time.sleep(1)
    else:
        log("JS never started")
        raise SystemExit(1)
    time.sleep(2)
    xml = dump()
    if "loadJSBundleFromAssets" in xml or "Unable to load script" in xml:
        log("redbox — reverse + force restart")
        sh("reverse", "tcp:8081", "tcp:8081", check=False)
        sh("shell", "am", "force-stop", PKG)
        sh("shell", "am", "start", "-n", ACTIVITY)
        time.sleep(10)


def dismiss_logbox() -> None:
    xml = dump()
    if bounds(xml, "Dismiss") or "Open debugger to view warnings" in texts(xml):
        sh("shell", "input", "tap", "960", "180")
        time.sleep(0.35)


def ensure_keypad_visible() -> str:
    """Scroll until Digit 1 is tappable (not clipped at bottom)."""
    dismiss_logbox()
    for _ in range(6):
        xml = dump()
        b = bounds(xml, "Digit 1")
        if not b:
            swipe_up(1)
            continue
        _x1, y1, _x2, y2 = b
        cy = (y1 + y2) // 2
        if cy > 900:
            swipe_up(1)
            continue
        return xml
    return dump()


def enter_pin(digits: str = "1234") -> None:
    dismiss_logbox()
    # Pin pad lives mid-scroll; nudge down so digits are not under LogBox.
    swipe_down(2)
    time.sleep(0.3)
    ensure_keypad_visible()
    for d in digits:
        ensure_keypad_visible()
        tap_digit(d)
        time.sleep(0.45)


def type_url(url: str) -> None:
    # adb `input text` only handles a subset; push via clip + paste keyevent 279.
    sh("shell", "cmd", "clipboard", "set", "text", url)
    time.sleep(0.2)
    sh("shell", "input", "keyevent", "279")  # PASTE


def add_manual_url(url: str) -> None:
    xml = dump()
    # Focus TextInput — look for EditText class
    m = re.search(
        r'class="android.widget.EditText"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
        xml,
    )
    if not m:
        m = re.search(
            r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*class="android.widget.EditText"',
            xml,
        )
    if m:
        x1, y1, x2, y2 = map(int, m.groups())
        sh("shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
        time.sleep(0.4)
    else:
        log("no EditText — tapping mid area")
        sh("shell", "input", "tap", "960", "420")
        time.sleep(0.4)

    type_url(url)
    time.sleep(0.5)
    xml = dump()
    if not tap_label(xml, "Add link"):
        raise SystemExit("Add link missing")
    # wait for selection count to bump or status
    time.sleep(3)
    xml = dump()
    log(f"after add: {[t for t in texts(xml) if 'selected' in t or 'error' in t.lower() or 'Removed' in t or 'Network' in t or t.endswith('selected')]}")
    log(f"status-ish: {texts(xml)[-12:]}")


def main() -> None:
    log(f"device {SERIAL}")
    ensure_metro_and_launch()

    xml = wait_texts(
        lambda t, _: "Set up with parent PIN" in t or "LittlePlay" in t,
        label="welcome",
    )
    tap_label(xml, "Dismiss")
    time.sleep(0.3)
    # preferred focus OK
    sh("shell", "input", "keyevent", "23")
    time.sleep(1.2)
    xml = dump()
    if "Set up with parent PIN" in texts(xml):
        tap_label(xml, "Set up with parent PIN")
        time.sleep(1.2)

    wait_texts(
        lambda t, x: "Parent PIN" in t
        or "Timer setup" in t
        or bounds(x, "Digit 1") is not None,
        label="timer",
    )
    xml = dump()
    tap_label(xml, "Dismiss")
    time.sleep(0.3)
    log("PIN entry — auto-saves (PBKDF2 ~5–30s on TV)")
    dismiss_logbox()
    enter_pin("1234")
    def on_connect(t, x):
        joined = " ".join(t)
        if "Timer setup" in joined or "Saving…" in joined or "Parent PIN" in joined:
            return False
        return (
            bounds(x, "Use links instead") is not None
            or "google.com/device" in joined
            or "Read-only access to playlists" in joined
            or "Connect YouTube" in joined
        )

    xml = wait_texts(on_connect, timeout=120, label="connect after PIN hash")
    t = texts(xml)
    if "crypto" in " ".join(t).lower() or "Property" in " ".join(t):
        raise SystemExit(f"setup error on screen: {t[:20]}")
    if "PINs do not match" in t:
        raise SystemExit("PIN mismatch")
    log(f"connect screen: {texts(xml)[:15]}")
    if not tap_label(xml, "Use links instead"):
        # maybe already on choose
        if "Manual link" not in texts(xml) and "Save allowed content" not in texts(xml):
            raise SystemExit("could not leave connect")
    time.sleep(1.5)

    xml = wait_texts(
        lambda t, _: "Manual link" in t or "Save allowed content" in t or "Add link" in t,
        label="choose content",
    )
    log(f"choose: {texts(xml)[:20]}")
    if "Manual link" in texts(xml):
        tap_label(xml, "Manual link")
        time.sleep(0.5)

    for url in BABY_VIDEOS:
        log(f"adding {url}")
        add_manual_url(url)
        time.sleep(1)

    swipe_up(2)
    xml = dump()
    log(f"before save content: {texts(xml)}")
    if not tap_label(xml, "Save allowed content"):
        raise SystemExit("Save allowed content missing")
    time.sleep(2)

    xml = wait_texts(
        lambda t, _: "Continue watching" in t or "Ready" in " ".join(t) or "Parent settings" in t,
        timeout=20,
        label="ready",
    )
    log(f"ready: {texts(xml)[:25]}")
    if "Continue watching" in texts(xml):
        tap_label(xml, "Continue watching")
        time.sleep(8)

    xml = dump()
    log(f"FINAL texts: {texts(xml)[:40]}")
    focus = sh("shell", "dumpsys", "window", check=False).stdout
    for line in focus.splitlines():
        if "mCurrentFocus" in line:
            log(line.strip())
    pid = sh("shell", "pidof", PKG, check=False).stdout.strip()
    log(f"pid={pid or 'DEAD'}")
    # screenshot
    sh("shell", "screencap", "-p", "/sdcard/e2e-final.png", check=False)
    sh("pull", "/sdcard/e2e-final.png", "/tmp/e2e-final.png", check=False)
    log("screenshot /tmp/e2e-final.png")
    log("DONE")


if __name__ == "__main__":
    main()
