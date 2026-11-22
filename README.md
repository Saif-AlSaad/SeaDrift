# DRIFT · Sail the Dusk Sea

A quiet 3D voyage. Sail the dusk sea and gather light before the lamp goes out.

🎮 **[Play Live in Browser](https://saif-alsaad.github.io/SeaDrift/)**  
📱 **[Download Android APK (Direct)](https://github.com/Saif-AlSaad/SeaDrift/releases/latest/download/SeaDrift.apk)** · **[View Releases](https://github.com/Saif-AlSaad/SeaDrift/releases)**

Built with **React 19**, **Three.js**, **Capacitor**, **Vite**, and **Tailwind CSS**.

---

## 🌊 Android & 100% Offline Play

SeaDrift is packaged as a standalone Android app with **full offline support**:
- **Zero External Network Dependencies:** All fonts, 3D meshes, textures, procedural shaders, and audio synthesizers are self-contained inside the app.
- **Works Without Internet:** Play anywhere, including Airplane Mode.
- **Hardware-Accelerated WebGL 2.0:** Native performance running at 60 FPS on Android devices.
- **Orientation & Controls:** Supports both Landscape and Portrait layouts with touch steering (Drag, Tap Buttons, or Device Gyro/Tilt).

### How to Install on Android
1. Download **[SeaDrift.apk](https://github.com/Saif-AlSaad/SeaDrift/releases/latest/download/SeaDrift.apk)** onto your Android device.
2. Tap the downloaded file in your browser or File Manager to install.
   *(If prompted, allow your browser or file manager to "Install unknown apps").*
3. Launch **SeaDrift** from your home screen and enjoy sailing!

---

## 🎨 Visuals & Graphics Upgrade

- **Multi-Directional Gerstner Waves:** Realistic ocean swell with sharp wave peaks and rolling troughs.
- **Wave Subsurface Scattering (SSS):** Golden dusk sunlight naturally penetrates wave crests with translucent emerald/teal rim lighting.
- **Bioluminescent Ocean Wake:** Living plankton sparkle in the boat's wake with electric turquoise illumination.
- **Dynamic Dusk & Starry Sky:** Venus belt twilight gradient opposite sunset, atmospheric corona, and procedural twinkling stars.
- **Physics-Damped Lantern:** Bow lantern sways dynamically with boat banking and wave impacts, casting live point-light reflections.
- **HDR Bloom & Film Tone Mapping:** ACES Filmic tone mapping and bloom post-processing optimized for mobile and desktop GPUs.

---

## 🕹️ Controls

- **Desktop:** `A`/`D` or `←`/`→` to steer · `Space` for burst · `P` to pause.
- **Mobile Touch:** Drag steer across screen or use on-screen rudder buttons.
- **Gyro / Tilt:** Steer by physically tilting your device (configurable in Settings).

---

## 🛠️ Tech Stack & Building

- **Game Engine:** Three.js (WebGL 2.0)
- **UI Framework:** React 19 + TypeScript
- **Mobile Container:** Capacitor Android
- **Styling:** Tailwind CSS v4
- **Bundler:** Vite

### Local Development
```bash
npm install
npm run dev               # Run web dev server
npm run build             # Build production bundle
npm run android:sync      # Sync web build into Android project
```

- **Framework:** React 19
- **3D Graphics:** Three.js
- **Styling:** Tailwind CSS v4
- **Bundler:** Vite
- **Language:** TypeScript
