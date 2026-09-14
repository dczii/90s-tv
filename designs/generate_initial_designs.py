#!/usr/bin/env python3
"""Generate the editable Pen.dev source for the initial Android TV concepts."""

import json
from pathlib import Path


OUT = Path(__file__).with_name("timed-youtube-tv.pen")

BG = "#0A101C"
PANEL = "#121C2B"
PANEL_2 = "#192638"
TEXT = "#F5F2EA"
MUTED = "#94A3B8"
ACCENT = "#FF7657"
ACCENT_DARK = "#5B2A25"
AMBER = "#F8C65D"
GREEN = "#65D6A6"
WHITE_10 = "#FFFFFF1A"
WHITE_20 = "#FFFFFF33"

_counter = 0


def node_id(prefix: str) -> str:
    global _counter
    _counter += 1
    return f"{prefix}-{_counter}"


def rect(x, y, width, height, fill=PANEL, radius=24, *, name=None, stroke=None, stroke_width=0):
    node = {
        "id": node_id("rect"),
        "type": "rectangle",
        "name": name,
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "cornerRadius": radius,
        "fill": fill,
    }
    if stroke:
        node.update({"stroke": stroke, "strokeWidth": stroke_width, "strokeAlignment": "inner"})
    return node


def text(content, x, y, size=32, color=TEXT, weight="500", width=None, height=None, align="left", name=None):
    node = {
        "id": node_id("text"),
        "type": "text",
        "name": name,
        "content": content,
        "x": x,
        "y": y,
        "fontFamily": "Inter",
        "fontSize": size,
        "fontWeight": weight,
        "lineHeight": 1.2,
        "fill": color,
        "textAlign": align,
    }
    if width is not None:
        node.update(
            {
                "width": width,
                "textGrowth": "fixed-width" if height is None else "fixed-width-height",
            }
        )
    if height is not None:
        node["height"] = height
        node["textAlignVertical"] = "middle"
    return node


def icon(name, x, y, size=32, color=TEXT):
    return {
        "id": node_id("icon"),
        "type": "icon",
        "library": "Material Symbols Rounded",
        "icon": name,
        "x": x,
        "y": y,
        "width": size,
        "height": size,
        "weight": 500,
        "fill": color,
    }


def button(label, x, y, width, *, focused=False, secondary=False, destructive=False, icon_name=None):
    fill = "#311A1B" if destructive else (PANEL_2 if secondary else ACCENT)
    label_color = "#FF9A83" if destructive else (TEXT if secondary else BG)
    stroke = ACCENT if focused else (WHITE_20 if secondary else fill)
    children = [
        rect(x, y, width, 76, fill, 18, stroke=stroke, stroke_width=4 if focused else 1),
    ]
    label_x = x + 28
    if icon_name:
        children.append(icon(icon_name, x + 24, y + 22, 32, label_color))
        label_x = x + 68
    children.append(text(label, label_x, y + 21, 28, label_color, "700"))
    if focused:
        children.append(text("Press OK", x + width - 136, y + 25, 20, label_color, "600"))
    return children


def chrome(title, section):
    return [
        rect(72, 62, 44, 44, ACCENT, 14),
        icon("timer", 80, 70, 28, BG),
        text("TIMEBOX", 132, 67, 24, TEXT, "800"),
        text(section.upper(), 1570, 72, 18, MUTED, "700", width=260, align="right"),
        text(title, 92, 148, 56, TEXT, "750"),
    ]


def screen(name, x, y, children):
    return {
        "id": node_id("screen"),
        "type": "frame",
        "name": name,
        "x": x,
        "y": y,
        "width": 1920,
        "height": 1080,
        "clip": True,
        "layout": "none",
        "fill": BG,
        "children": children,
    }


def welcome():
    children = [
        rect(0, 0, 1920, 1080, {"type": "gradient", "gradientType": "radial", "center": {"x": 0.78, "y": 0.42}, "size": {"width": 1.15, "height": 1.15}, "colors": [{"color": "#263A55", "position": 0}, {"color": BG, "position": 1}]}, 0),
        rect(72, 62, 44, 44, ACCENT, 14),
        icon("timer", 80, 70, 28, BG),
        text("TIMEBOX", 132, 67, 24, TEXT, "800"),
        text("A little TV.\nThen a real break.", 108, 258, 76, TEXT, "750", width=900),
        text("Curated YouTube for your home, with clear watch and rest windows.", 112, 470, 30, MUTED, "450", width=700),
    ]
    children += button("Set up with parent PIN", 112, 624, 520, focused=True, icon_name="lock")
    children += [
        icon("info", 112, 760, 24, MUTED),
        text("Time limits apply inside Timebox only.", 150, 759, 22, MUTED, "500"),
        rect(1240, 242, 500, 612, PANEL, 44, stroke=WHITE_10, stroke_width=1),
        rect(1292, 296, 396, 224, {"type": "gradient", "gradientType": "linear", "rotation": 135, "colors": [{"color": "#324862", "position": 0}, {"color": "#172435", "position": 1}]}, 28),
        icon("smart_display", 1450, 372, 72, TEXT),
        text("15:00", 1338, 588, 94, TEXT, "750", width=304, align="center"),
        text("WATCH WINDOW", 1338, 706, 20, AMBER, "750", width=304, align="center"),
    ]
    return children


def timer_setup():
    children = chrome("Set a healthy rhythm", "Parent setup")
    children += [
        text("Choose how long watching lasts and how long the break should be.", 96, 224, 27, MUTED, "450"),
        rect(96, 314, 806, 284, PANEL, 28, stroke=ACCENT, stroke_width=4),
        text("WATCH TIME", 136, 354, 19, AMBER, "750"),
        text("15", 136, 410, 88, TEXT, "750"),
        text("minutes", 276, 464, 27, MUTED, "500"),
        rect(694, 404, 72, 72, PANEL_2, 18, stroke=WHITE_20, stroke_width=1),
        text("−", 694, 411, 44, TEXT, "500", width=72, align="center"),
        rect(782, 404, 72, 72, ACCENT, 18),
        text("+", 782, 411, 44, BG, "700", width=72, align="center"),
        rect(934, 314, 806, 284, PANEL, 28, stroke=WHITE_10, stroke_width=1),
        text("BREAK TIME", 974, 354, 19, GREEN, "750"),
        text("30", 974, 410, 88, TEXT, "750"),
        text("minutes", 1118, 464, 27, MUTED, "500"),
        rect(1532, 404, 72, 72, PANEL_2, 18, stroke=WHITE_20, stroke_width=1),
        text("−", 1532, 411, 44, TEXT, "500", width=72, align="center"),
        rect(1620, 404, 72, 72, PANEL_2, 18, stroke=WHITE_20, stroke_width=1),
        text("+", 1620, 411, 44, TEXT, "700", width=72, align="center"),
        text("CREATE PARENT PIN", 100, 658, 19, MUTED, "750"),
    ]
    for i in range(4):
        children.append(rect(100 + i * 92, 704, 72, 72, PANEL_2, 18, stroke=WHITE_20, stroke_width=1))
        children.append(text("•", 100 + i * 92, 702, 48, TEXT, "700", width=72, align="center"))
    children += button("Save and choose videos", 1262, 878, 478, focused=True, icon_name="arrow_forward")
    return children


def connect():
    children = chrome("Connect YouTube", "Content setup")
    children += [
        text("Use your phone to connect. Timebox requests read-only access.", 96, 224, 27, MUTED, "450"),
        rect(96, 314, 1120, 520, PANEL, 32, stroke=WHITE_10, stroke_width=1),
        rect(144, 366, 40, 40, ACCENT, 20),
        text("1", 144, 366, 22, BG, "750", width=40, height=40, align="center"),
        text("Open", 212, 370, 24, MUTED, "600"),
        text("youtube.com/activate", 212, 414, 40, TEXT, "700"),
        rect(144, 514, 40, 40, ACCENT, 20),
        text("2", 144, 514, 22, BG, "750", width=40, height=40, align="center"),
        text("Enter this code", 212, 518, 24, MUTED, "600"),
        rect(212, 574, 744, 130, PANEL_2, 22, stroke=ACCENT, stroke_width=3),
        text("KJMT  •  RQPA", 212, 601, 54, TEXT, "750", width=744, align="center"),
        rect(1304, 314, 436, 436, "#F5F2EA", 28),
        rect(1366, 376, 312, 312, "#D5D9DC", 8),
        icon("qr_code_2", 1416, 426, 212, BG),
        text("Waiting for approval…", 1304, 784, 22, MUTED, "550", width=436, align="center"),
    ]
    children += button("Use links instead", 96, 878, 314, secondary=True)
    children += button("I’ve approved access", 1296, 878, 444, focused=True, icon_name="check")
    return children


def content():
    children = chrome("Choose what can play", "Content setup")
    children += [
        text("Only selected sources appear during a watch window.", 96, 224, 27, MUTED, "450"),
        rect(96, 286, 252, 58, ACCENT, 16),
        text("Playlists", 96, 301, 23, BG, "700", width=252, align="center"),
        text("Subscriptions", 382, 302, 23, MUTED, "650"),
        text("Manual link", 604, 302, 23, MUTED, "650"),
    ]
    cards = [
        ("Saturday Cartoons", "24 videos", True, "#38516D"),
        ("Quiet Nature", "18 videos", True, "#35584F"),
        ("Science for Kids", "12 videos", False, "#51456A"),
        ("Family Favorites", "31 videos", False, "#684746"),
    ]
    for i, (title, subtitle, selected, color) in enumerate(cards):
        x = 96 + i * 414
        children += [
            rect(x, 400, 366, 340, PANEL, 26, stroke=ACCENT if selected else WHITE_10, stroke_width=4 if selected else 1),
            rect(x + 18, 418, 330, 180, {"type": "gradient", "gradientType": "linear", "rotation": 145, "colors": [{"color": color, "position": 0}, {"color": PANEL_2, "position": 1}]}, 18),
            icon("play_circle", x + 145, 474, 62, TEXT),
            text(title, x + 24, 628, 26, TEXT, "700", width=318),
            text(subtitle, x + 24, 674, 20, MUTED, "500"),
        ]
        if selected:
            children += [rect(x + 302, 430, 34, 34, ACCENT, 17), icon("check", x + 309, 437, 20, BG)]
    children += [
        text("2 sources selected", 96, 900, 23, TEXT, "650"),
        text("Use ← → to browse  •  OK to select", 96, 940, 19, MUTED, "500"),
    ]
    children += button("Save allowed content", 1292, 892, 448, focused=True, icon_name="check")
    return children


def ready():
    children = [
        rect(0, 0, 1920, 1080, {"type": "gradient", "gradientType": "linear", "rotation": 135, "colors": [{"color": "#30445F", "position": 0}, {"color": "#111B2A", "position": 0.52}, {"color": BG, "position": 1}]}, 0),
        rect(72, 62, 44, 44, ACCENT, 14),
        icon("timer", 80, 70, 28, BG),
        text("TIMEBOX", 132, 67, 24, TEXT, "800"),
        text("Ready when you are.", 110, 282, 64, TEXT, "750"),
        text("Your timer starts only after you continue.", 112, 378, 28, MUTED, "450"),
        rect(112, 468, 572, 146, "#0D1725CC", 26, stroke=WHITE_10, stroke_width=1),
        icon("schedule", 150, 509, 48, AMBER),
        text("15 minutes", 226, 494, 42, TEXT, "750"),
        text("available to watch", 228, 550, 22, MUTED, "500"),
    ]
    children += button("Continue watching", 112, 686, 448, focused=True, icon_name="play_arrow")
    children += [
        text("Parent settings", 112, 798, 21, MUTED, "600"),
        icon("lock", 282, 795, 22, MUTED),
        rect(1120, 186, 636, 704, "#152337CC", 42, stroke=WHITE_10, stroke_width=1),
        rect(1176, 242, 524, 294, "#2A4059", 26),
        icon("smart_display", 1398, 350, 74, TEXT),
        text("Saturday Cartoons", 1180, 596, 34, TEXT, "700"),
        text("Up next from your allowed playlists", 1180, 650, 22, MUTED, "500"),
    ]
    return children


def playback():
    children = [
        rect(0, 0, 1920, 1080, "#172333", 0),
        rect(0, 0, 1920, 1080, {"type": "gradient", "gradientType": "radial", "center": {"x": 0.48, "y": 0.44}, "size": {"width": 0.9, "height": 0.9}, "colors": [{"color": "#466078", "position": 0}, {"color": "#172333", "position": 1}]}, 0),
        icon("smart_display", 856, 430, 208, "#F5F2EA88"),
        rect(1550, 54, 286, 68, "#0A101CDD", 34, stroke=WHITE_20, stroke_width=1),
        icon("schedule", 1580, 72, 30, AMBER),
        text("12:48 left", 1626, 72, 25, TEXT, "700"),
        rect(64, 820, 760, 188, "#0A101CDD", 28),
        text("Saturday Cartoons", 100, 856, 20, AMBER, "750"),
        text("The Clockmaker’s Adventure", 100, 902, 34, TEXT, "700"),
        text("YouTube player controls remain unobscured", 100, 954, 18, MUTED, "500"),
        text("PLAYER AREA", 810, 1022, 16, "#FFFFFF55", "700", width=300, align="center"),
    ]
    return children


def resting():
    children = chrome("Time for a break", "Rest window")
    children += [
        text("The player is off. Step away, stretch, or find something fun to do.", 96, 224, 27, MUTED, "450", width=850),
        {
            "id": node_id("ring"),
            "type": "ellipse",
            "x": 698,
            "y": 318,
            "width": 524,
            "height": 524,
            "innerRadius": 0.88,
            "fill": PANEL_2,
        },
        {
            "id": node_id("arc"),
            "type": "ellipse",
            "x": 698,
            "y": 318,
            "width": 524,
            "height": 524,
            "innerRadius": 0.88,
            "startAngle": 90,
            "sweepAngle": 228,
            "fill": GREEN,
        },
        text("24:17", 760, 492, 84, TEXT, "750", width=400, align="center"),
        text("BREAK REMAINING", 760, 604, 19, GREEN, "750", width=400, align="center"),
        icon("lock", 914, 692, 32, MUTED),
        text("Nothing will play until the break ends.", 660, 888, 24, MUTED, "500", width=600, align="center"),
        text("When it reaches zero, you’ll still choose when to continue.", 610, 930, 20, MUTED, "450", width=700, align="center"),
        icon("settings", 96, 942, 24, MUTED),
        text("Parent settings", 134, 940, 20, MUTED, "600"),
    ]
    return children


def settings():
    children = chrome("Parent settings", "PIN verified")
    children += [
        rect(96, 244, 1080, 680, PANEL, 28, stroke=WHITE_10, stroke_width=1),
        text("WATCH & BREAK", 136, 286, 18, MUTED, "750"),
        icon("schedule", 136, 350, 32, AMBER),
        text("Watch window", 194, 350, 26, TEXT, "650"),
        text("15 minutes", 874, 350, 25, TEXT, "700", width=250, align="right"),
        rect(136, 414, 1000, 1, WHITE_10, 0),
        icon("self_improvement", 136, 460, 32, GREEN),
        text("Break window", 194, 460, 26, TEXT, "650"),
        text("30 minutes", 874, 460, 25, TEXT, "700", width=250, align="right"),
        rect(136, 524, 1000, 1, WHITE_10, 0),
        text("CONTENT", 136, 568, 18, MUTED, "750"),
        icon("video_library", 136, 628, 32, TEXT),
        text("Manage allowed content", 194, 628, 26, TEXT, "650"),
        text("2 sources", 874, 628, 23, MUTED, "600", width=250, align="right"),
        rect(136, 692, 1000, 1, WHITE_10, 0),
        icon("account_circle", 136, 738, 32, TEXT),
        text("Connected YouTube account", 194, 738, 26, TEXT, "650"),
        text("Connected", 874, 738, 23, GREEN, "700", width=250, align="right"),
        rect(1230, 244, 510, 324, PANEL, 28, stroke=ACCENT, stroke_width=4),
        text("CURRENT CYCLE", 1270, 286, 18, MUTED, "750"),
        text("12:48", 1270, 344, 64, TEXT, "750"),
        text("watch time remaining", 1270, 428, 22, MUTED, "500"),
    ]
    children += button("Edit timer policy", 1262, 612, 446, focused=True, icon_name="tune")
    children += button("Reset current cycle", 1262, 712, 446, destructive=True, icon_name="restart_alt")
    children += button("Done", 1458, 892, 250, secondary=True)
    return children


document = {
    "version": "2.17",
    "variables": {
        "color.background": {"type": "color", "value": BG},
        "color.panel": {"type": "color", "value": PANEL},
        "color.text": {"type": "color", "value": TEXT},
        "color.muted": {"type": "color", "value": MUTED},
        "color.accent": {"type": "color", "value": ACCENT},
        "color.warning": {"type": "color", "value": AMBER},
        "color.success": {"type": "color", "value": GREEN},
    },
    "children": [
        screen("01 — Welcome", 0, 0, welcome()),
        screen("02 — Timer setup", 2040, 0, timer_setup()),
        screen("03 — Connect YouTube", 4080, 0, connect()),
        screen("04 — Choose content", 6120, 0, content()),
        screen("05 — Continue watching", 0, 1200, ready()),
        screen("06 — Playback", 2040, 1200, playback()),
        screen("07 — Rest timer", 4080, 1200, resting()),
        screen("08 — Parent settings", 6120, 1200, settings()),
    ],
}

OUT.write_text(json.dumps(document, indent=2) + "\n")
print(f"Wrote {OUT}")
