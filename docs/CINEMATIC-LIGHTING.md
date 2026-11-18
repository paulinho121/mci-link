# Cinematic Lighting Director

Tab **CINEMATIC** (F7). Pick a look inspired by a film or a classic
technique, see the scheme, check which of your lights take which role, and
apply it to the real lights with a timed transition.

## Architecture (how it fits the app)

```
CINEMATIC tab ── adaptPreset() ──> Fixture state (dimmer, CCT, tint, HSI)
                                         │  same state the faders change
                                         ▼
                      existing drivers (unchanged protocols)
            amaran Desktop · Bluetooth Mesh · CRMX Bluetooth (Vortex) · DMX
```

- The module never talks to hardware. It writes the console's fixture state;
  the existing drivers send it, each within its own rate limit.
- `src/cinematic/types.ts`: preset model (roles, positions, colour, intensity,
  modifier, distance).
- `src/cinematic/presets.ts`: built-in library (29 looks, 12 categories).
- `src/cinematic/adapt.ts`: maps roles to your lights.
- `src/cinematic/fade.ts`: transitions.
- `src/cinematic/store.ts`: custom looks, favourites, history (this device).
- `src/cinematic/CinematicLighting.tsx`, `LightingScheme.tsx`: the screen.

## Adapting a look to your lights

- Roles are in priority order. With N lights the first N roles get a light.
- A dropped role is merged into the kept accent light whose position is
  closest (2 lights: KEY + "SIDE + BACK"); the merged light shows a note to
  place it between both positions. KEY never absorbs other roles, and FILL is
  never merged (use a bounce or negative fill).
- Colour roles go to full-colour lights, then bi-colour, then daylight.
- Values are clamped to each light's real range (`profileFor`). A light
  without colour gets the closest white and is flagged; no HSI command goes
  to a white-only light.
- One entry per physical light: no duplicate commands.
- Every approximation is shown before applying.

## Applying

1. Only lights with a **live** link are selected by default. Demo lights
   with simulated links are labelled **SIMULATED**; offline lights cannot be
   selected.
2. APPLY SELECTED / APPLY ALL LIVE opens a confirmation with before → after
   per light.
3. After the transition, each light reports its real link state: "Sent via
   …", "Simulated link", or "Not reachable". These protocols do not confirm
   delivery, so the screen says so instead of claiming success.
4. RESTORE PREVIOUS returns the touched lights to their earlier state; TURN
   ALL OFF fades the lights out.

Transitions: cut, 1, 3, 5, 10 s or custom. Steps every 50 ms; slow links
(amaran Desktop: 1 command per light every 200 ms) receive coarser steps.

## Tests

```bash
npm run test:cinematic
```

## Not done yet (next phases)

- Phase 3: drag lights in the visualizer; position presets (front / side /
  back / three-point) combined independently; FX and gels in presets.
- Phase 4: AI Lighting Director (production type, mood, environment →
  suggested setup with explanations).
- Sharing looks between devices (needs a backend; today they stay on this
  device).
- Phase 5: tests with real lights on set.
