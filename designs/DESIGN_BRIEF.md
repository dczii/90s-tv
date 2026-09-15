# LittlePlay — Initial Design Brief

## Format

- Android TV / Google TV
- 1920 × 1080 landscape frames
- D-pad navigation only
- Keep primary actions inside a 5% TV safe area
- Large type and obvious focus states readable from three metres away

## Direction

The product should feel calm, protective, and trustworthy rather than punitive. Use a
near-black navy background, warm off-white text, muted slate surfaces, a restrained
coral accent for primary actions, and amber only for time warnings. Avoid YouTube-red
branding except where required by YouTube itself.

Use one strong focal action per screen. Focused controls receive a high-contrast border
and subtle elevation; do not rely on color alone. Keep timer values visible and plain.
Remote-driven focus changes should be immediate, without transition delays.

## Initial screens

1. **Welcome / Parent setup**
   - Product name and concise explanation
   - “Set up with parent PIN” primary action
   - Small enforcement-limit note

2. **Timer setup**
   - Watch duration and rest duration steppers
   - Example defaults: 15 minutes watch, 30 minutes rest
   - PIN creation and confirmation
   - “Save and choose videos” primary action

3. **Connect YouTube**
   - Device-code authorization URL and large code
   - QR placeholder as a secondary convenience
   - “Use links instead” secondary action
   - Read-only permission explanation

4. **Choose allowed content**
   - Tabs for Playlists, Subscriptions, and Manual link
   - Large poster rows with check states
   - Persistent selected count
   - “Save allowed content” primary action

5. **Ready / Continue watching**
   - Selected content artwork in the background with a dark scrim
   - “15 minutes available” as the main message
   - “Continue watching” primary action
   - No autoplay

6. **Playback**
   - Full-bleed 16:9 player placeholder
   - Minimal remaining-time pill in the upper-right
   - Brief title/playlist overlay suitable for remote invocation
   - No app controls layered over required YouTube controls

7. **Rest timer**
   - Player completely absent
   - Large circular countdown and “Time for a break”
   - Calm explanation of what happens when the timer reaches zero
   - Parent settings entry kept visually secondary

8. **Parent settings**
   - PIN-gated screen
   - Timer policy summary
   - Manage allowed content
   - Connect/disconnect account
   - Reset current cycle as a deliberate destructive action

## Reusable components

- Primary, secondary, and destructive TV buttons with focused/unfocused states
- Duration stepper
- PIN entry cells
- Countdown ring
- Content card with selected state
- Remaining-time pill
- TV-safe dialog
