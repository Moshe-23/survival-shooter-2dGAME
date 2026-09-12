# JUMBO.RU — Top-Down Survival Shooter

A top-down 2D survival shooter built with **pure HTML5 Canvas** — no libraries, no build tools, no dependencies. Survive in an infinite open world against escalating zombie hordes: manage hunger and thirst, scavenge supplies, buy from the trader, build walls and doors, and drive a car through enemies.

> **PLAY LIVE:** [github-pages-link] (append in the Enabled GitHub Pages URL after deployment)

---

## Features

- **Infinite open world.** Walk to the edge of the map and enter the next zone. Map 1 is custom art (`shotgun.jpg`), maps 2–4 roll eastward, everything else is procedurally generated.
- **Enemy AI with vision.** Zombies only attack when they see you (field of view + raycast line of sight — walls block vision). Lose line of sight and they remember your position for ~3.5s, then go back to roaming.
- **4 enemy types + boss:**
  - Regular zombie — slow and steady.
  - Runner — fast but fragile.
  - Tank brute — huge, slow, takes 2 full shotgun mags.
  - **Doom guy** — circles you and fires fast tracer rifles; **boss soldier** — chases you down and fires 3-shot red tracer bursts (700 HP) with a boss HP bar on screen.
- **Survival stats.** HP, 💧 thirst and 🍊 food drain over time — run out and you start losing health. Food & water heal +5 HP and restore the stat 3× slower. Radiation ☢ currently passive.
- **Shop & trader.** The trader sits on the home-base map. Press **E** near the shop to open a menu to **BUY / SELL / TRADE** (UI is ready, trading comes later).
- **Building.** Press **F** for build mode. Place **wooden walls (1)**, **stone walls (2)** or **doors (3)** on a 48px grid. Walls snap together and block players, enemies, bullets and the car.
- **Drivable car.** Enter with **E**. WASD driving with acceleration, braking, reverse, speed-dependent steering, drifting on high speed, tire tracks, exhaust puffs, engine revs and camera shake. Runs over normal enemies; a boss takes 120 damage.
- **Grenades.** RMB throws a grenade with a 3.5s fuse — big AoE damage and scorch marks that fade in 7s.
- **Juicy feedback.** Blood stains baked into the map, shell casings, muzzle flash, damage numbers, hit markers, camera shake, screen flash on damage, procedural WebAudio sound effects, looped background music.
- **Your own character.** Your uploaded portrait is rendered in-game and in the inventory screen.

## Controls

| Key | Action |
|---|---|
| **WASD** | Move |
| **Mouse** | Aim |
| **LMB (hold)** | Fire shotgun |
| **RMB** | Throw grenade |
| **R** | Reload (or auto-reload) |
| **E** | Interact: enter/exit car, open/close doors, pick up supplies, open shop |
| **Q / TAB** | Inventory (eat / drink) |
| **F** | Build mode: walls & doors |
| **SPAWN** | Teleport back to home base (5s countdown) |
| **H** | Toggle controls guide |
| **ESC / P** | Pause & sound settings |
| **M** | Sound on/off |
| **- / +** | Volume |

## Tech Stack

- **Vanilla JavaScript (ES5-compatible)** — procedural drawing, pixel decoding, world streaming
- **HTML5 Canvas** — all rendering, no engine
- **CSS3** — HUD, menus, shop UI
- **WebAudio API** — procedural SFX + looped music sample

No libraries, no bundlers, no server needed. Works from any static host.

## Run Locally

The game is fully static — just open `index.html` in a browser.

Or serve it:

```bash
python -m http.server 8000
# then open http://localhost:8000/
```

(There's also a `server.py` wrapper that adds the correct MIME types.)

## Project Structure

```
survival-shooter/
├── index.html          # markup + HUD (HP, thirst, food, radiation, time, kills)
├── css/style.css       # UI styles
├── js/
│   ├── utils.js        # math helpers
│   ├── audio.js        # procedural WebAudio SFX
│   ├── assets.js       # image loading, world cell system (enterCell), map cache
│   ├── effects.js      # particles: blood, casings, flashes, floating text
│   ├── player.js       # player: rendering, movement, shooting
│   ├── enemy.js        # enemies: vision/AI, zombies, doom guy, boss
│   ├── buildings.js    # building: walls (stone/wood), doors, collisions
│   ├── vehicle.js      # car: physics, tire tracks, exhaust, enemy ramming
│   └── main.js         # game loop, camera, HUD, map transitions, shop
└── assets/             # maps, sprites, sounds, your custom character/shop art
```

## Notes

- Two assets intentionally have swapped names (kept as-is): `assets/shotgun.jpg` is actually **map 1**, and `assets/map.webp` is the **shotgun sprite**. The code accounts for this (see `js/assets.js`).
- Character portrait, shop building and trader are custom images; enemies and character animations are drawn procedurally on canvas.