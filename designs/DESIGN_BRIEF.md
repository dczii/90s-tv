# LittlePlay — Design Brief

Source of truth: the shipping TV app under `apps/tv`. Frames in
`designs/littleplay.pen` should match these screens.

## Format

- Android TV / Google TV
- 1920 × 1080 landscape frames
- D-pad navigation only
- Keep primary actions inside a 5% TV safe area
- Large type and obvious focus states readable from three metres away

## Direction

The product should feel calm, protective, and trustworthy rather than punitive. Use a
near-black navy background (`#0A101C`), warm off-white text (`#F5F2EA`), muted slate
surfaces (`#121C2B` / `#192638`), a restrained coral accent (`#FF7657`) for primary
actions, amber (`#F8C65D`) for watch time, and green (`#65D6A6`) for rest. Avoid
YouTube-red branding except where required by YouTube itself.

Use one strong focal action per screen. Focused controls receive a high-contrast coral
border; do not rely on color alone. Keep timer values visible and plain. Remote-driven
focus changes are immediate, without transition delays. There is no parent PIN.

## Screens

1. **Welcome**
   - Brand row (coral mark + LittlePlay)
   - Headline: “A little TV. Then a real break.”
   - Subcopy about curated playlists and watch/rest windows
   - Primary: **Get started**
   - Enforcement note
   - Right: preview card with play glyph and `15:00` / WATCH WINDOW

2. **Timer setup**
   - Section: Parent setup
   - Title: Set a healthy rhythm
   - Two duration steppers: Watch (amber, default 15) and Break (green, default 30)
   - Primary: **Save and choose videos**
   - No PIN

3. **Curated playlists**
   - Section: Content setup
   - Catalog copy (Little Bear, Franklin, Bear in the Big Blue House, and more)
   - Callout: Select one or more playlists
   - Side art + “N shows in the catalog”
   - Primary: **Choose playlists**

4. **Choose / manage playlists**
   - Wizard title: Choose playlists · Settings title: Manage playlists
   - 3-column catalog cards with 16:9 thumbs, checkmark when selected
   - First card takes preferred focus (not Save)
   - Footer: Back, selected count, **Save playlists**
   - Saving from settings returns to Parent settings

5. **Ready / Continue watching**
   - “Ready when you are.”
   - Available minutes card
   - Primary: **Continue watching** (disabled if no playlists)
   - Secondary: Parent settings
   - Right: up-next card with first playlist title

6. **Playback**
   - Full-bleed player
   - Remaining-time pill, upper-right; amber fill in the last 60 seconds
   - Channel number badge, upper-left, aligned with the time pill (`CH` + `02`)
   - Each selected show is a channel, numbered in save order
   - Left / right (or channel up / down) tunes to the previous or next selected show
   - Channel strip along the bottom while tuning, then it hides; the top-left badge stays
   - A channel plays only that show, then loops it
   - Pill and strip are not focusable

7. **Rest timer**
   - Title: Time for a break
   - Green stroke ring that empties with remaining time
   - Large countdown + BREAK REMAINING
   - Secondary: Parent settings

8. **Parent settings**
   - No PIN gate
   - Left: watch/break summary + manage-playlists card
   - Right: current cycle, **Manage playlists** (preferred focus), Edit timer policy,
     Reset current cycle, Done
   - Enforcement note

## Reusable components

- Primary, secondary, and destructive TV buttons with focused/unfocused states
- Duration stepper (amber watch / green break)
- Content card with selected check
- Countdown ring
- Remaining-time pill
