# Native app (iPhone, iPad, Android)

The same Cine Light OS interface, packaged with [Capacitor](https://capacitorjs.com).
In the native app Bluetooth goes through the phone's own Bluetooth stack
(`@capacitor-community/bluetooth-le`), so it works on **iPhone and iPad**,
which have no Bluetooth for web pages. No https, no certificate warning.

- App id: `com.hubstudio.cinelight` (in `capacitor.config.json`)
- Native projects: `android/` and `ios/`
- Bluetooth code: `src/services/ble/transport.ts` picks the native backend
  in the app and Web Bluetooth in the browser.

After any change to the interface:

```bash
npm run build
```

```bash
npx cap sync
```

## Android (on this PC)

Needs Android Studio (already installed here).

1. `npx cap open android` opens the project in Android Studio.
2. Plug in the phone/tablet with USB debugging on, and press **Run**.

Or build an APK from the terminal (`JAVA_HOME` must point to Android Studio's
`jbr` folder):

```bash
cd android && ./gradlew assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`. Copy it
to the device and open it to install. Android asks to allow apps from that
source the first time.

## iPhone / iPad (needs a Mac)

Apple only builds iOS apps on a Mac with Xcode.

1. Copy the project to the Mac (or clone it), then run `npm install`,
   `npm run build` and `npx cap sync ios`.
2. `npx cap open ios` opens Xcode.
3. In **Signing & Capabilities**, choose your Apple team. A free Apple ID
   runs the app on your own device for 7 days; the Apple Developer Program
   (US$ 99/year) is needed for TestFlight and the App Store.
4. Plug in the iPhone/iPad, pick it as the target and press **Run**. On the
   device, trust the developer in Settings → General → VPN & Device
   Management.

Permissions already set in `ios/App/App/Info.plist`: Bluetooth, and local
network (to reach amaran Desktop).

## Using it

Same flow as in the browser: **PAIR LIGHT → BLUETOOTH → LOAD MESH FILE →
CONNECT VIA BLUETOOTH**. The phone shows a list of lights nearby; pick any
one. Get the mesh file with `npm run ble:export-mesh` on the PC (see
`docs/BLE-MESH.md`) and send it to the device privately (cable, AirDrop):
it controls your lights.
