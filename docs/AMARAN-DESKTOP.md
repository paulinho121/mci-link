# amaran Desktop driver

Cine Light OS controls real amaran / Aputure lights through the **official
amaran OpenAPI** (https://tools.sidus.link/openapi/docs/usage). amaran
Desktop talks to the lights; Cine Light OS talks to amaran Desktop over a
WebSocket on port `12345`.

## Requirements

- amaran Desktop open on a PC, with the lights already paired in it.
- An OpenAPI secret key issued by Sidus (base64, 32 bytes). Never commit it.
- The PC clock must be correct: tokens are only valid for 10 s.

## Pairing in the app

1. Fader Bay → **PAIR LIGHT** → **AMARAN DESKTOP**.
2. Host `127.0.0.1` if amaran Desktop is on the same PC, otherwise that PC's
   LAN IP. Port `12345`. Paste the secret key.
3. **CONNECT** reads `get_fixture_list` + `get_node_config` +
   `get_system_effect_list`, then **IMPORT ALL** or pick one light.

## What gets sent

| Console | OpenAPI request |
|---|---|
| Power off / on | `set_sleep` |
| Dimmer (after curve, grand master, blackout) | `set_intensity` (0–1000) |
| CCT + tint | `set_cct` (`gm` 0–200, 100 = neutral; tint −0.1 → 90) |
| HSI | `set_hsi` (or `set_rgb` on RGB-only lights) |
| Colour XY / gel | `set_rgb` (or `set_hsi`) |
| FX (cop, fire, paparazzi, lightning, tv, pulse, strobe) | `set_system_effect` when the light has it |

- One request per light every 200 ms at most, because the light drops
  anything faster. Only the latest state is sent.
- Changes made in amaran Desktop or on the light (`*_changed` events) move
  the console faders.
- A heartbeat every 4 s detects a dead connection; the app retries every 3 s
  and resends the current state when it comes back.

Code: `src/services/sidus/client.ts` (socket, token, heartbeat) and
`src/services/sidus/driver.ts` (state → commands, events → state).

## Testing without lights

```bash
npm run mock:amaran
```

Starts a fake amaran Desktop with three lights on `ws://0.0.0.0:12345`. Use
the DEV key at the top of `scripts/mock-amaran-desktop.mjs`. That key only
works with the mock. `MOCK_APP_CHANGES=1` simulates someone moving a light in
amaran Desktop every 12 s.

## Known limits

- **Identify:** the API has no identify request, so the console blinks the
  intensity instead.
- **Effect parameters:** depth and speed of built-in effects are not exposed
  by the API.
- **Persistence:** imported lights are not saved yet and must be imported
  again after a reload.
- **https:** an app served over https cannot open `ws://` to another machine.
