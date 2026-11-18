# Deploy on Vercel

The web app is a static Vite build. Settings live in `vercel.json`, so
Vercel needs nothing else: no environment variables, no server.

1. Vercel → **Add New → Project** → import `paulinho121/mci-link`.
2. Framework, install (`npm ci`), build (`npm run build`) and output (`dist`)
   come from `vercel.json`. Click **Deploy**.
3. Production deploys follow the **Production Branch** (Settings →
   Environments → Production). Every other pushed branch gets a Preview URL.

## What works online

| Feature | On Vercel (https) |
|---|---|
| Console, faders, presets, control screen | Yes |
| Creamsource Vortex over CRMX Bluetooth | Yes: Chrome / Edge (PC, Android), Bluefy (iPhone/iPad) |
| amaran / Aputure over Bluetooth Mesh | Yes, same browsers; load the mesh file on the device |
| amaran Desktop (OpenAPI, `ws://`) | **No**: an https page cannot open `ws://` on the LAN. Use the app on the PC (`npm run dev`) or the native app |

Bluetooth needs a tap to open the picker, and the browser forgets the light
after a reload: pair again after reloading.

`.vercelignore` keeps `android/`, `ios/` and `docs/` out of the upload. The
mesh keys file (`*.local.json`) is git-ignored and never deployed.
