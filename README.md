# Orbital Breach: Eden Protocol

A browser mech adventure built with Three.js and Vite. Escape a rotating orbital station, fight through three escalating sectors of Meridian City, then face ARCHON in a living forest sanctuary. Shatter glass, use jet flight, and grapple across walls, roofs and the hull. The solo game builds as a static website. Multiplayer uses the included Node.js WebSocket server; no API keys are required.

## Run

```sh
npm ci
npm run dev
```

Open Vite's printed URL and click **Begin campaign**. You start safely beside the Kestrel launch console; press **E** nearby to launch the mission. A desktop keyboard, mouse, WebGL 2, and hardware acceleration are required. Escape pauses and releases the cursor. Optional flight training can be enabled on the start screen; Tab skips it and H replays it. Training pauses campaign combat. The pause menu also offers **New campaign**.

## Multiplayer: 3–8 real players

Open **Multiplayer** on the launch screen. Choose a callsign, create a room, and share its six-character code or invitation link. Friends join on their own computers. Every pilot must ready up, and the host can start with **3 to 8 players**. The room displays each equipped build and livery, with full-body portraits and a rotating inspection stage. Choose your equipment in Field Refit before joining; equipment stays locked during the match.

The host chooses **Kestrel, Meridian or Eden**. Each match stays on one world. This first online mode is free-for-all: **15 eliminations or a maximum of 5 minutes**, then standings and a shared return to the lobby. Respawns take four seconds, with three seconds of protection that ends when you fire. Green field-repair stations restore 35 core and 50 shield and recharge after 25 seconds. The score strip and live standings show kills and deaths. Escape opens your room; the shared match keeps running.

Kestrel now has two continuous eight-metre-wide freight circuits outside the promenade, connected through all sixteen docks, with staggered cargo cover and real floor/rail collision. Roof glass, balconies, gantries, solar service panels and open-space tether routes remain available. City and Eden use their existing full playable worlds and eight distinct spawn locations.

`npm run dev` starts **both** the Node server (3001) and Vite (5173). For friends on the same Wi-Fi, everyone should open the printed **LAN address**, not `127.0.0.1`. A room code does not connect separate local servers. For friends on the internet, host the Node app at a shared public HTTPS address:

```sh
npm ci
npm run build
npm start
```

`npm start` serves `dist` and `/socket` together on `PORT` (default 3001), listening on `HOST` (default `0.0.0.0`). Node **22 or newer** is required. `/api/health` reports server health. Use a host with persistent Node processes and WebSocket upgrades. A static Vercel deployment still runs solo modes; online requires a separate live backend. If using a separate backend, set `VITE_MULTIPLAYER_URL=wss://your-server.example/socket` **before building** the client and set the backend's `ALLOWED_ORIGINS=https://your-game.example`. No backend has been deployed by this change.

Rooms and guest identities live in memory. Restarting the server closes them. If the host leaves, another player becomes host. Joining a running match is disabled; an already started match can continue with two players, and ends after a 15-second grace period if only one remains. Disconnected pilots leave the room and can rejoin by code when it returns to the lobby.

The server owns room membership, readiness, projectiles, equipment-derived damage/cooldowns/heat, protection, repairs, health, scores and respawns. Movement is locally predicted and sends poses at 20 Hz; the server checks speed, sequence/life identifiers, range and shared map collision. Other pilots render through a 100 ms interpolation buffer. This is an initial guest multiplayer implementation, without accounts, ranked matchmaking, lag compensation or production anti-cheat. It needs a real 3–8-device playtest before a public competition.

WebSocket framing, three independent clients, lobby/match/rematch, room limits, disconnects, damage, cover, spawns and timers have automated coverage. This environment does not allow listening sockets or provide a browser, so a live TCP/browser match and visual lobby review remain unverified. The `ws` 8.19.0 runtime is vendored under `vendor/ws` with its MIT license so this restricted workspace can build without a registry download.

## Round lengths

Online matches have a **5-minute maximum**. Each campaign chapter, Gauntlet run and AI team operation has a **3-minute maximum**. Optional training pauses the solo clock. A timed-out campaign chapter shows its partial score and offers retry without awarding chapter completion or unlocking the next world. Each new campaign chapter starts a fresh timer. Gauntlet banks its current score at the cap; AI team operations use their existing score-based timeout result.

## City and movement polish

Meridian uses shaped vehicle bodies, sloped windscreens, round tyres and hubs, framed bus windows and doors, irregular tree crowns, and a shared atlas of transit and storefront graphics. Service alleys have entrances, foundation courses, drains and utility pipes. Facade windows have skyline reflections, reveals and interior silhouettes. Enemy equipment identifies their role: ammunition packs for gunners, optical sensors for lancers and reinforced armour for heavies. Striker blades have metal bodies and illuminated cutting edges.

Walking, braking and direction changes use bounded acceleration; jet steering preserves more momentum. City and Eden enemies ease into new movement directions and retain a body gap around the pilot. Stationary-player pressure does not shrink the Striker's melee range.

The gateways have a curved velocity envelope with travelling pressure rings and inward-flowing particles. Kestrel has eight cyan-framed roof skylights, one at every twelfth bay. Shoot a pane until it shatters, then descend through it into the station. The glass cracks before breaking; the surrounding frame stays solid, and a new campaign restores every pane. Exterior hatch stencils identify the entrances.

**Graphics:** Tether pulls disable radial speed blur and keep air streaks faint. Other movement has a small blur ceiling. Station fill lighting and bloom are tuned so ordinary white hull panels retain detail. Balanced mode adjusts render resolution within 75–100% of its normal pixel ratio after sustained load and restores detail gradually. High keeps its fixed resolution; Performance disables bloom and shadows. The city uses a static spatial index for movement and shot collision candidates; decorative detail remains instanced. These changes do not alter the fixed simulation rate. CPU scene and traversal tests cover the additions; actual FPS and visual quality should be checked on target hardware.

## Launch screen and pilot guide

The launch screen is a live 3D maintenance bay. Drag to spin Cobalt (or use the arrow keys; double-click or Home resets the view), hover **Deploy** to spool the thrusters, and pick one of eight frame paints, or press **L** (or the **Loadout** tile) to open the Field Refit bay, **S** for the Gear Shop, or **M** for the Mission Board. Chapter cards (or keys 1-5; card 5 is Team Ops) preview each chapter, show its briefing and best result, and tint the bay to match. Later chapters unlock as you clear earlier ones, and your paint, unlocks and best results are stored in this browser's local storage (`orbital-breach.profile.v1`). Chapter previews never skip objectives. On pause, the card for the current chapter reads *In progress*, and choosing another unlocked chapter offers to restart there with the suit upgrades a pilot would normally have.

The pilot guide uses four sections: Mission, Your mech, Movement, and Combat. The mission route is illustrated. The other sections show the game's actual 3D models with selectable equipment, movement demonstrations, tether geometry, and enemy profiles. Drag a model or focus its canvas and use Left/Right to rotate it; Home resets its rotation. Arrow keys also navigate the section tabs. Header navigation and the close footer remain visible while guide content scrolls.

The model preview starts when a 3D section is open and stops when the dialog closes. Reduced-motion preferences disable the demonstration animations. A diagram is available if the preview renderer cannot initialize.

## Loadout: the Field Refit bay

Open it from the launch screen (**L**) or in a run (**B**). Ten slots shape how Cobalt looks and, for most of them, how it plays: builds (five ready-made loadouts), headgear, legs, torso, back mount or jetpack, right and left arm, right and left shoulder, plus decals and boost-trail colour, and a Livery tab (eight paints and six light colours). Parts you do not own yet show a price chip and a **Get in shop** button.

- **Parts.** Nine headgear designs (stock visor, recon, crest, dome, cyclops, war mask, halo, fin and the ARCHON crown), six leg frames (reverse-joint biped, quad, heavy, tread, sprinter, hover), three torsos, back mounts including four jetpacks (ring, turbine, wing pack, phoenix) or a bare back, eleven arm weapons (each arm takes any of them, or nothing) and eight shoulder mounts (missile, rotary gun, mortar, swarm rack, chaff, hornet, phalanx, howitzer), eight decals and six boost-trail colours. Every part has a role, a maker and stat bars; the totals and the before/after change of the part under the cursor update as you browse. Headgear, decals and trails are mostly cosmetic: heads stay within ±10% of stock handling.
- **Effect on play.** Armour sets how much damage you take, mass and the leg frame set your speed, the torso and back mount set heat room and cooling, and the back mount sets boost. Arms fire the weapon they carry (damage, pellets, spread, splash, heat and cooldown all come from the part); **G** fires both shoulders, each on its own cooldown, and a shoulder gun keeps firing while G is held. The factory build plays exactly as before.
- **When it takes effect.** On the launch pad, between waves, and whenever no hostile is within 45 m and you have not been hit for six seconds, a refit applies at once. Under fire it is saved and applied on your next spawn.
- **The screen.** A live 3D preview on a service pad (drag to turn, wheel to zoom) frames the slot you are editing, with call-outs and leader lines on the mech and a rendered thumbnail for every part. Keys: `1`-`9` and `0` pick a slot, `Up`/`Down` part, `Left`/`Right` slot, `R` random, `F` factory, `S` shop, `Enter` fit, `Esc` back (discards unfitted changes). Your build, paint and lights are saved with your profile. Fitting only uses parts you own; anything unowned falls back to the factory part.

## The mission

ARCHON has sealed Earth's last seed archive behind a network of machine-controlled gates. Iris guides the last pilot through three connected chapters.

1. **Kestrel Station:** activate the launch console, defeat two Strikers and a lighter Bulwark sentry, and recover their green gate cells. Cross the awakened gateway to Meridian.
2. **Meridian City:** fight through three sectors of streets, cover and accessible rooftops. Clear each encounter, then press E at its marked uplink. Each relay refits the suit and unlocks the next, harder encounter. The third relay opens the Eden gate at the north end of the avenue.
3. **Eden:** defend the forest against a mixed squad. After a short warning, ARCHON arrives with escorts. Defeat the commander and its escorts, then press E at the Heart Tree archive. Eden remains available for exploration afterward.

Threat rises from tier 1 to tier 6, with larger mixed squads, stronger armor and damage, and shorter attack intervals. Encounters have finite rosters. Defeated campaign enemies stay defeated rather than respawning indefinitely.

Each city relay grants another 12% weapon-damage bonus. After the second relay, missile recharge drops from 7 to 5 seconds and dash recharge from 2.4 to 1.6 seconds. Relays restore core and shields and establish the next chapter checkpoint.

Progress, defeated enemies, collected cells, upgrades, and window breaches survive deaths during the current session. Reloading starts a new mission; checkpoints are not stored on disk. Dialogue appears as Iris and ARCHON transmissions. The gates advance the story in one direction.

Kestrel's opening offers an optional guided route: breach the marked glass, tether to the exterior landing pad, flank the Bulwark, then collect the gate cells and cross the portal. The route never adds a progression lock. The introductory Bulwark has 120 core and 45 shield, while later Bulwarks retain their normal strength. Training remains optional.

**Bulwark counterplay:** the front armor takes 22% damage from direct body hits (head hits take 50%). Destroying its shield arm removes this protection. The visible orange rear reactor is real hit geometry: direct hits from behind deal 2.5× damage and bypass energy shields. Bulwarks turn at a limited rate and fire only when facing their target, giving a grapple flank time to work. Explosions retain normal damage. These rules apply to campaign and Team Ops Bulwarks.

A reactor kill awards 100 extra points. If the pilot is airborne, it also fully recharges the dash; grounded kills, splash damage and training kills do not grant that recharge. Restoring each city relay gradually switches on that district's signs, windows and street lighting, with the third relay restoring the north district as the gate opens.

## Scoring, ranks and the Gauntlet

Every chapter is a scored run. Kills score by enemy type (striker 100, gunner 150, lancer 200, bulwark 300, ARCHON 2,500). Chain kills inside four seconds to raise a combo multiplier from 1x to 4x, and earn bonuses for headshots and airborne kills. The HUD shows the live score, a combo meter and a par-time reference; floating popups show each award.

When a chapter ends, a results screen adds a time bonus against par, an accuracy bonus (20 or more shots), and a survival bonus that shrinks with damage taken and each time you are downed. The total earns an **S**, **A**, **B** or **C** rank (S at each chapter's target score, A at 70% of it, B at 45%). Your best score and rank per chapter are saved, with a Retry button. Training and fast-forwarded chapters never award a rank.

Finishing Eden unlocks **The Gauntlet**, a three-minute survival mode in the city with a fully upgraded suit and three lives. Waves are fixed so runs are comparable: the roster grows from strikers and gunners to lancers and bulwarks, squads grow to six, threat climbs every wave, and every fifth wave is an ARCHON commander with escorts. Each cleared wave banks 250 points; a short refit separates waves. Ranks follow waves reached (B at 4, A at 8, S at 12), and your best wave and score are saved.

The Gauntlet is fought in a purpose-built **arena** on Meridian Avenue: the light eases to floodlit dusk, floodlight cones and a big scoreboard (wave, score, lives, your best) frame the avenue, and the spawn shutters at the north end open at the start of every wave. The arena adds no collision and no real-time lights.

## Gear Shop and credits

Press **S** on the launch screen (or the **Gear Shop** tile, or **S** inside the Field Refit) to spend credits on gear. A new pilot starts with 300 credits and the starter kit (14 free items: the factory parts, the stock visor and the default paints). The shop sells 63 more across nine tabs (headgear, legs, jetpacks, arm guns, shoulder mounts, torsos, paint and lights, decals, boost trails) from 40 to 1,200 credits in six tiers (common, field grade, elite, prototype, legendary).

- Each item has baked 3D thumbnails and a try-on preview on your own mech before you buy. It is marked OWNED, EQUIPPED or LOCKED; BUY is disabled with a reason when you cannot afford it, and purchases of 400 credits or more ask for a second press. The whole screen works from the keyboard; `Esc` returns to the Field Refit with your unfitted changes intact.
- **Earning credits.** Chapters and the Gauntlet pay credits from your kills, score and a win bonus (capped per run), and the results screen shows what you earned and your balance. **Team operations pay the most** (a win scales with the opposition's skill; see above). Credits are saved with your profile; saves from before the shop keep what they were wearing and receive the starter kit and 300 credits.
- Locked paints on the launch screen open the shop on that paint.

## Team operations and the Mission Board

Card **05 · Team Ops** on the launch screen (or the **Mission Board** button, or **M**) opens the board. Arena posters and card thumbnails are captured from the actual 3D worlds once per board visit, then cached while choosing an operation, team or skill level. Objective stats, squad roles and selected states remain visible beside the deployment controls. Pick an operation, pick your side, set how good the other team is, and deploy:

| Operation | Arena | Mode | Squads | First to |
| --- | --- | --- | --- | --- |
| Grove Skirmish | Eden sanctuary | Team deathmatch | 3 v 3 | 20 |
| Meridian Crossfire | Meridian Avenue | Team deathmatch | 4 v 4 | 30 |
| Beacon Run | Meridian Avenue | Hold the beacon | 4 v 4 | 90 points |
| Hold the Heart Tree | Eden sanctuary | Hold the beacon | 4 v 4 | 90 points |
| Avenue War | Meridian Avenue | Team deathmatch (elite opposition) | 5 v 5 | 45 |

- **Teams.** You choose **COBALT** or **OXBLOOD**. You spawn with your squad at your end of the arena; your squadmates and the opposing squad are AI pilots with callsigns (RAZOR, TALON, VESPER... against CINDER, WRAITH, HOLLOW...). Both sides field the same machine mix, so a result reflects play rather than the draw. There is no friendly fire.
- **Opposition skill.** ROOKIE, VETERAN or ELITE changes the AI's aim error, fire rate, reaction time, health and damage. Your allies always fight at a fixed veteran level. Harder opposition pays more credits.
- **Modes.** Team deathmatch is first to the limit. In *Hold the beacon* the ring in the middle is captured by having more pilots in it than the enemy (a bigger lead captures faster; a tie freezes it); the owning team scores points every second and kills score too.
- **Rules of the match.** A 4-second countdown, then downed pilots (including you) redeploy after a few seconds with a short spawn shield. If time runs out the higher score wins; equal scores are a draw. You cannot leave the arena.
- **Results and credits.** A standings table, your kills, deaths and headshots, an S/A/B/C rank (a loss never ranks above C) and **credits** (a win pays most, kills add, harder opposition multiplies). Credits go to the same balance the shop spends. Your side, skill choice, last operation and per-operation records are kept separately from the campaign save (`orbital-breach-ops-v1`).
- The **Campaign** tab on the board lists the four story missions with their objectives, ranks and locks.

Team operations run on the Meridian and Eden maps only. The station ring uses its own curved-gravity physics and is not an arena.

## Opponents

| Enemy | Appearance and attack | Response |
| --- | --- | --- |
| Striker | Slim orange frame, blades, fast close-range attacks | Strafe and dash away from its charge |
| Gunner | Red armored frame, four-round bursts that keep tracking you | Break line of sight, jink, or dash |
| Lancer | Violet frame, long weapon, antenna and warning sight line | Move after its aim locks: an amber tick and a beep on your damage ring warn you even if it is off-screen |
| Bulwark | Broad olive armor, shield plate, slow explosive rounds, orange rear reactor | Grapple behind it; rear reactor hits bypass shields. Airborne reactor kills recharge dash |
| ARCHON | Large dark frame, luminous crown, volleys and marked ground strikes | Escape red rings; attack its exposed core |

## Combat feel

Enemy fire is meant to be dangerous and readable. These rules apply to campaign enemies, the Gauntlet and Team Ops bots alike (`src/combat-feel.js`):

- **Real aim.** Rounds are aimed at the true intercept point of a moving pilot (not a fixed guess), scaled by the machine's skill, then thrown inside a small cone that tightens with accuracy and loosens against a fast mover. Walking in a straight line is punished; changing direction, dashing and breaking line of sight still work.
- **Volleys, not single shots.** Gunners fire four timed rounds that re-aim between shots and stop when you step behind cover; the Archon throws two five-bolt fans; Lancers and Bulwarks fire single heavy rounds. Opening shots arrive about a second after the fight starts.
- **Aggressive movement.** Enemies strafe in unpredictable, randomly timed bursts instead of weaving on a sine wave, and press in when a pilot stands still.
- **Visible, loud bullets.** Enemy rounds are long, fat, haloed bolts with a muzzle flash and a short point light, a positional report (louder and panned by direction), and an impact flash where they hit scenery.
- **Hit feedback.** A ring around the crosshair points at whoever hit you (cyan for shield hits, red for hits to the core, amber for a Lancer lock-on, a faint tick for a near miss); the screen flashes by damage; the camera shakes and kicks away from the hit; a dedicated shield-break cue plays and "SHIELD DOWN" shows; and below 60% core integrity the edges pulse red with a heartbeat that quickens as it drops.
- **Near misses.** Rounds that whip past within about 2.7 m crack past the nearer ear and nudge the camera, so being shot at is felt even when nothing connects.
- **Shields.** Shields wait 5 seconds after the last hit before recharging, then recover at 18 per second.
- **HUD calm.** The control hints fade after the first 45 seconds of a run.

The numbers live in `ENEMY_TYPES` (`src/encounters.js`) and `src/combat-feel.js`; `tests/combat-feel.test.js` guards them (every machine must hit hard enough to matter, none can erase the pilot with one trigger pull, Strikers must stay outside body contact).

Jet-equipped strikers, gunners and lancers follow a pilot toward rooftop height. Ground navigation routes around nearby cover. ARCHON enters a faster ground-strike phase below half core integrity, shown by its boss bar.

## Controls

| Action | Input |
| --- | --- |
| Move / aim | W A S D / mouse |
| Left arm / right arm weapon | Left / right mouse button |
| Jump; hold for jet ascent | Space |
| Descend in flight | Ctrl |
| Boost | Shift |
| Directional thruster dash | X |
| Fire / release the grappling tether | C or middle mouse button |
| Toggle magnetic boots / detach from a surface | F |
| Roll in free flight | Q / E |
| Use the gateway or seed archive | E |
| Shoulder mounts (hold for shoulder guns) | G |
| Open the loadout bay (L on the launch screen) | B |
| Vent weapon heat | R |
| First-person / chase camera | V |
| Skip / replay on-screen lessons | Tab / H |
| Pause / release cursor | Escape |

Aim the tether at a solid wall, ceiling, tree trunk, floor, or station hull. Its hook travels to the anchor, accelerates the reel up to 36 m/s, brakes before arrival, then locks the boots to the surface. C cancels an active pull while preserving momentum; a blocked path releases automatically. Canceling the hook before it reaches a surface preserves magnetic boots. Movement follows the attached surface; F detaches it. The cable automatically retracts shortly after attachment, while magnetic contact persists until detached or the surface is left.

Jump toward the middle of a window while moving or boosting to shatter it and step onto an exterior balcony. The solid sill remains collidable, so a standing walk does not pass through it. Gunfire and tether tension can also break the glass. Openings remain in both rendered geometry and collision/visibility state, and can be used in either direction. Amber airlocks remain available as another route. Breaking glass preserves your boot setting, and a tether breach briefly carries you clear of the sill before boot assistance resumes. Press F to choose free flight.

## Exterior routes

Continuous port and starboard balconies run outside the windows around the full ring. Reinforced glass rails stop ordinary walking at the outer edge. Jump or fly over them deliberately to leave the deck.

Eight docking rooms on each side connect the balconies to narrow gantries and marked landing pads. Door lighting, numbered signs, cyan approach strips, and roof H markings identify the routes. Dock roofs, the main hull roof, and solar service panels also accept landings and tether anchors. With boots enabled, supported landings settle onto the surface; movement, jumping, and camera orientation use the current contact surface. Unsupported space remains free flight.

The flight HUD distinguishes deck contact, descent with boot assistance, and open space. Training lists the next unfinished action and keeps the story objective paused until lessons end or Tab is pressed. Enemy labels are limited and avoid overlapping each other or instruction cards. Corridor and dock signs are readable from either direction.

## Included

- A complete 96-bay station ring, interior/exterior traversal, two continuous balconies, 16 docking rooms with gantries and landing pads, solar arrays, a reactor, destructible glass, individual crack states, and 3D glass shards.
- Tether travel, reeling, release momentum, surface-relative magnetic walking, smooth ceiling inversion, jet flight, boost, jump, and dash.
- Two independent weapons with moving projectiles, swept hit detection, missiles, heat, damage feedback, detachable enemy limbs, armor debris, and shield rewards.
- Assault wardens that close in, ranged wardens that strafe, and station enemies that route through airlocks to pursue a pilot outside, clear exterior roofs, and enter occupied docking rooms through doorways while keeping space between allies. Mixed squads pursue across city streets and forest terrain; jet-equipped enemies can contest rooftop positions.
- The Kestrel interior dressed after the footage: white ceramic corridors with orange ribs, guide lanes and ceiling light strips, big stencilled **SECTION nn** numbers and zone names (Dock A/B, Hydroponics, Promenade, Reactor, Freight) with the HUD reading `ZONE · SECTION nn`, green-framed airlocks, hydroponics racks and trees, freight stacks, reactor pylons and KHI cargo crates. It is decoration only: collision, windows and cover are unchanged.
- A real loadout system (see above): 21 parts across seven slots, data-driven weapons and shoulder mounts, per-build handling, an in-game refit, and a Field Refit screen with a live preview, call-outs, thumbnails and saved livery.
- Beveled armor, brushed/worn metal materials, mechanical hinges and pistons, weapon carry handles and vents, and articulated gait, aim, recoil, flight and thruster animations.
- **Meridian, rebuilt as a lived-in city.** Batched architecture with procedural windows, grime and moss, cracked and overgrown paving, wet puddles that reflect the sky, shopfronts, overhead wires, steam vents, drifting dust and ash, wrecked cars and buses, a sky dome with sun glow, clouds and a skyline fading into haze. Cover is registered as before (173 collision boxes, every original tower, roof and gate box kept; spawn, relays and the gateway lane are tested as clear), and the whole city draws in 15 instanced batches.
- Street-level dressing for Meridian: abandoned vehicles and jersey barriers that work as cover, bus shelters, lamps, street trees, glowing billboards, lit windows, rooftop plant and skybridges. All of it is generated in code and batched into two extra instanced draw calls through per-instance colour.
- **Eden, rebuilt as a lived-in valley.** Six tree species plus a hero Heart Tree, shrubs, ferns, grass, wildflowers, mushrooms, moss, vines and fallen logs; a worn path, crags and a waterfall escarpment, a stream with a bridge, a pond with lily pads and reeds; collapsed arches, a crashed pod, solar panels, a toppled mast and ruined walls; an archive grove with dais, standing stones, lanterns and glow blooms; a sky dome with layered ridgelines, god-rays, pollen, fireflies, butterflies and distant birds, with wind-swayed vegetation. Terrain collision, the path, spawn, archive, gateway and bot clearings are unchanged.
- Mission objectives, distance markers, radio messages, contextual prompts, radar, heat/cooldown indicators, pause, synthesized sound, quality settings, and operating-system reduced-motion preferences.
- Fixed simulation ticks preserve game speed at lower frame rates. Repeated scene elements and projectiles are instanced; explosion lighting uses a fixed pool.

This is a single-player prototype against bots: team operations put you and AI squadmates against an AI team, but every pilot other than you is computer-controlled. Online multiplayer, matchmaking, touch controls, recorded dialogue, and production character art are not implemented. The mechanical characters and scenery are modeled/generated in code; they are not photorealistic scanned assets. Space flight remains station-relative rather than a full inertial spacecraft simulation.

## Vercel

Import this directory as a Vercel project. `vercel.json` configures the Vite framework, `npm run build`, and the `dist` output directory. No environment variables are required.

Official Vite deployment guidance: https://vercel.com/docs/frameworks/frontend/vite

The project has not been deployed or linked to a Vercel project.

## Verification

```sh
npm test
npm run build
```

Tests exercise movement, combat, frame-rate independence, enemy pursuit/separation, safe spawning, lessons, destructible-window collision/visibility, jump breaches, tether travel and ceiling attachment, tether breaches, camera inversion, Eden terrain/raycasting, and the complete console-to-city-to-boss-to-archive campaign path, distinct enemy silhouettes, real enemy-volley damage, warned-shot dodging, timed blast avoidance, city roof landings, tier scaling, refits, finite rosters, and checkpoint preservation. Exterior regression checks cover both balcony landings, window-to-balcony breaches, all 16 doorway/gantry routes, rail and wall collision at speed, roof jumping, finite platform boundaries, and tether returns from space. HUD checks cover crowded labels and unfinished lesson prompts. CPU scene checks cover geometry validity, batching, animation, projectile instances, and light-pool stability. Scoring rules, combo multipliers, rank thresholds, profile persistence and corrupt-storage recovery, the Gauntlet wave generator, lives and results flow, and the draw-call budget of the dressed city are covered as well.

Earlier solo/AI builds were driven end to end in headless Chrome 156 with a scripted harness: menu states at several window sizes (no overlaps at 1280x720, 1440x900 and 1920x1080), a deploy into each chapter, the HUD, results screens and the Gauntlet loop with its arena, the Gear Shop (buy, equip, persist), and full team operations in both Meridian and Eden (Mission Board, deploy, a live AI-versus-AI fight, the pilot shooting, dying and redeploying, pause and resume, results and credits), with a clean console and about 55-60 fps. It has **not** been played by a person on a real display, so feel, difficulty and frame rate on a physical GPU are unverified. In development builds `window.__game` exposes the running game for such scripts; it is stripped from production builds.

## Source

- `src/game.js`: game loop, input, realm changes, combat, enemies and traversal integration.
- `src/world.js`: station, destructible-window registration, mechs, weapons and materials.
- `src/launch-deck.js` / `src/launch-menu.css`: maintenance-bay menu scene, character framing and campaign launch interface.
- `src/pilot-guide.js` / `src/pilot-guide.css`: illustrated guide, model inspector, control demonstrations and enemy profiles.
- `public/guide/mission-route.svg`: original vector mission illustration.
- `src/city.js`: Meridian architecture, streets, roof and building collision, uplinks and gateway.
- `src/encounters.js`: enemy classes, attack stats, chapter rosters, the Gauntlet wave generator, tiers and relay locations.
- `src/eden.js`: sanctuary landscape, terrain, obstacles, water and archive.
- `src/props.js`: portals, glass/cracks, relay cells and tether geometry.
- `src/station-layout.js` / `src/station-constants.js`: shared station dimensions, exterior surfaces, and solid collision volumes.
- `src/exterior.js`: instanced balcony, compartment, gantry, pad, rail, and solar service geometry.
- `src/physics.js`: station collision, visibility, surface normals and damage.
- `src/grapple.js`: hook flight, reeling, surface attachment and release.
- `src/mission.js`: story state, relay/warden objectives, Gauntlet waves/lives and Iris messages.
- `src/tactics.js` / `src/animation.js`: enemy steering and articulated animation.
- `src/onboarding.js`: action-driven control lessons.
- `src/effects.js`: ammunition, impacts, explosions, glass/armor debris and audio.
- `src/hud-layout.js`: enemy-label priorities, overlap rejection, and HUD exclusion zones.
- `src/ui.js` / `src/style.css`: HUD, objectives, prompts, radio and menus.
- `src/city-props.js`: procedural street dressing and per-instance tints for Meridian.
- `src/city-layout.js` / `src/city-arch.js` / `src/city-batch.js` / `src/city-shaders.js` / `src/city-sky.js` / `src/city-life.js`: Meridian's street plan, building facades, instanced batching, procedural window/ground/puddle shaders, sky dome and ambient dust, steam and wires.
- `src/gauntlet-arena.js`: the Gauntlet arena (scoreboard, floodlights, spawn gates, dusk), switched on by the game for that mode only.
- `src/eden-*.js`: the sanctuary, split into terrain, layout, flora, water, sky, ruins, shrine and wildlife modules behind the unchanged `src/eden.js` entry point. `src/eden-cull.js` culls off-screen vegetation and swaps far plants, trees and blooms for cheaper copies each frame (the live frame went from about 1.8M to 0.7M triangles in headless measurements); a test keeps it under budget.
- `src/scoring.js` / `src/chapters.js`: scoring rules, ranks, par times and chapter data shared by the menu, HUD and results screen.
- `src/profile.js`: saved paint, light colour, build, unlocks and best results, with validation of stored data.
- `src/parts.js`: every part, the presets and the stat maths that turn a build into gameplay multipliers (pure data, no DOM or Three.js).
- `src/mech-parts.js`: the geometry for legs, torsos, back mounts, arm guns and shoulder pods, plus in-place mech swapping and disposal.
- `src/loadout.js` / `src/loadout.css`: the Field Refit screen and its preview renderer.
- `src/shop.js` / `src/shop.css`: the Gear Shop screen, its thumbnails and try-on preview.
- `src/shop-items.js`: every item's price, tier and category, the starter kit and the credit payout rules (pure data).
- `src/livery.js`: paint, light colour, decal and boost-trail data shared by the mech builder, the loadout screen and the shop.
- `src/team-ops.js`: team operations as pure data and rules: teams, skills, arenas, rosters, the scoreboard, beacon capture, ranks, payouts and the saved record.
- `src/combat-feel.js`: shared enemy ballistics (intercept lead, aim cone, volley shapes), damage-feel and danger maths, tuned and unit-tested.
- `src/combat-hud.js` / `src/combat-hud.css`: directional damage ring, near-miss and lock-on ticks, low-health pulse.
- `src/team-battle.js`: runs a team operation: builds both squads, steers and fires every AI pilot, bullets, respawns, the beacon, the countdown and the result.
- `src/mission-board.js` / `src/mission-board.css`: the Mission Board (operation list, team and skill pickers, squad rosters, campaign tab) and the team-mode HUD styles.
- `src/station-decor.js` / `src/station-zones.js` / `src/station-atlas.js`: the station's panelling, stencils, airlocks and zone dressing, and the section/zone map behind the HUD label.
- `src/launch-controls.js`: drag, keyboard and idle behaviour for the launch-bay camera.
- `src/results.css`: results screen, combo meter and score popups.
- `tests/`: CPU scene, simulation and mission checks.

## Assets and credits

Geometry, surface textures, planet imagery, environment, and audio are generated by this project's code. No art, code, or audio was extracted from the reference recording.

Three.js is MIT-licensed; notices are in `public/licenses`. Teko and Rajdhani use the SIL Open Font License 1.1; notices are beside the bundled fonts, sourced from the user's local font library.

Authoring used relevant portions of the existing Sites workflow and local Claude frontend-design and Vercel CLI skills. Hosting targets Vercel as requested.
