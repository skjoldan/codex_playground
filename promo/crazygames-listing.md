# CrazyGames submission — copy/paste sheet

**Upload:** `beamline-crazygames.zip` (from the latest *Test & deploy* run → Artifacts, or `npm run build`).
Entry file: `index.html`. Size ≈ 80 KB. No external requests except the CrazyGames SDK.

## Title
Beamline: Laser Puzzle

## Short description (one line)
Bend the laser with mirrors and wake up every gem — 120 handcrafted-feeling levels of light-bending logic.

## Description
Bend the beam, light every gem! In Beamline you place mirrors to guide a laser through a grid and wake up every
sleepy gem on the board. Sounds simple — until walls block your path, mines must be avoided, glass splitters fork
the beam in two and portals teleport it across the board.

- 120 levels across 6 worlds, each introducing a new twist: mines, splitters and portals
- A gentle start that grows into real brain-teasers
- Earn up to three stars by solving each level within par — plan before you tap!
- Stuck? Use a hint or skip the level
- A fresh daily puzzle with streaks
- Relaxing generative music and satisfying light effects

## How to play / controls
- **Mouse / touch:** tap an empty cell to place a mirror, tap again to flip it, tap a third time to remove it.
- **Keyboard:** arrow keys to move, Space/Enter to place or flip, Z to undo, R to clear the board, H for a hint, Esc to go back.
- Light up all gems without touching a mine to clear the level. Every tap counts as a move — solve within par for ★★★.

## Category & tags
- Category: **Puzzle**
- Tags: logic, laser, mirror, brain, relaxing, casual, mouse, touch, 2D, singleplayer

## Platforms & orientation
Desktop and mobile (touch). Works in landscape and portrait; on landscape the controls sit beside the board.

## Assets in this folder
| File | Use |
| --- | --- |
| `cover-landscape.png` | 1920×1080 cover |
| `cover-portrait.png` | 800×1200 cover |
| `cover-square.png` | 800×800 cover |
| `*-notext.png` | Same covers without the logo, for portals that forbid text |
| `gameplay.mp4` | 30 s, 1920×1080, H.264, silent gameplay video |

## SDK integration (for the QA checklist)
CrazyGames HTML5 SDK v3: `loadingStart/Stop`, `gameplayStart/Stop` around levels and menus, `happytime` on 3-star
solves, `requestAd('midgame')` on Next/Replay, `requestAd('rewarded')` for hints and level skips (opt-in via a
"Stuck?" dialog, reward only on `adFinished`), audio muted during ads, progress saved with `data.setItem`.
