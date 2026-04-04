# Tic-Tac-Toe Twist — Mobile App

NativeScript Core + TypeScript mobile app for Android (and iOS). Uses `@ttt/engine` for local game logic and the AI service (`services/ai`) for remote move computation via Google Gemini + minimax fallback.

**App ID:** `com.tictactoetwist` · **Version:** 1.0.0 · **Min SDK:** 23

## Quick Setup

```powershell
# 1. Install all workspaces from repo root
npm install

# 2. Build the shared engine (produces packages/engine/dist/)
npm run build:engine

# 3. Re-link engine into the mobile app
cd apps/mobile
npm i ../../packages/engine --save
```

## Running the App

### Preferred — via helper script (from repo root)

```powershell
npm run mobile:android
# Pass extra NativeScript flags after --
npm run mobile:android -- --device emulator-5554
```

The helper (`scripts/ns-mobile-run.js`) wraps `ns run` with `--path apps/mobile` and sets `npm_config_location=global` to avoid the npm-workspace `ENOWORKSPACES` error.

### Alternative — NativeScript CLI directly

```powershell
ns run android --path apps/mobile
```

### Debug mode

```powershell
npm run debug:android
```

## App Structure

```
apps/mobile/
├── app/
│   ├── app.ts                     # Bootstrap entry point
│   ├── app-root.xml               # Frame / router
│   ├── app.css                    # Global styles
│   ├── config/
│   │   └── firebase-client.ts     # Firebase client config & OAuth client ID
│   ├── services/
│   │   ├── api.ts                 # AI service HTTP client (/move)
│   │   ├── engine.ts              # Local engine wrapper (createGame, bestMove)
│   │   ├── firebase.ts            # Firebase initialisation
│   │   ├── navigation.ts          # Router integration
│   │   └── notifier.ts            # Toast / alert notifications
│   ├── state/
│   │   ├── game-store.ts          # Game state management (setup, moves, AI)
│   │   ├── match-store.ts         # Match history & replay persistence
│   │   ├── auth-store.ts          # Authentication (Firebase + guest)
│   │   ├── achievement-store.ts   # Achievement tracking & unlocks
│   │   ├── auth-bindings.ts       # Reactive auth bindings
│   │   └── badge-bindings.ts      # Reactive badge / UI bindings
│   ├── home/                      # Home page (variant selection, difficulty)
│   ├── game/                      # Game page (board UI, moves, results)
│   ├── account/                   # Login, profile, match detail pages
│   ├── about/                     # About page
│   ├── assets/                    # Images and resources
│   └── utils/
│       └── game-format.ts         # Display formatting helpers
├── App_Resources/
│   ├── Android/src/
│   │   └── google-services.json   # Firebase config (placeholder)
│   └── iOS/
│       └── Info.plist
├── nativescript.config.ts         # NS config (id, appPath, v8Flags)
└── package.json                   # Dependencies & NS metadata
```

## Engine & AI Integration

| Integration | How | File |
|-------------|-----|------|
| **Engine** | `@ttt/engine` via `file:../../packages/engine` | `app/services/engine.ts` |
| **AI Service** | HTTP POST to `/move` | `app/services/api.ts` |
| **Platform URL** | Android emulator: `http://10.0.2.2:9191`, iOS sim: `http://127.0.0.1:9191` | auto-detected |
| **Timeouts** | 7 s per move, 15 s for first request (warmup) | `app/services/api.ts` |

## Firebase Setup

1. Replace `App_Resources/Android/src/google-services.json` with your real Firebase config.
2. Ensure `nativescript.id` in `package.json` matches the Android app ID in your Firebase project (`com.tictactoetwist`).
3. Update `app/config/firebase-client.ts` with your OAuth client ID for Google Sign-In.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@nativescript/core` | ~8.9.0 | NativeScript runtime |
| `@nativescript/firebase-auth` | ^5.0.2 | Firebase authentication |
| `@nativescript/firebase-core` | ^5.0.2 | Firebase core |
| `@nativescript/firebase-firestore` | ^5.0.2 | Firestore cloud sync |
| `@nativescript/google-signin` | ^2.1.1 | Google Sign-In |
| `@nativescript/theme` | ^3.1.0 | UI theme |
| `@ttt/engine` | file link | Shared game engine |

## Debug APK Build

The current debug build output lives at:

```
platforms/android/app/build/outputs/apk/debug/app-debug.apk
```

A `SHA256SUMS.txt` file is generated alongside the APK for integrity verification:

```powershell
$apk = "apps/mobile/platforms/android/app/build/outputs/apk/debug/app-debug.apk"
$sumFile = "apps/mobile/platforms/android/app/build/outputs/apk/debug/SHA256SUMS.txt"
$expected = (Get-Content $sumFile).Split(" ",[System.StringSplitOptions]::RemoveEmptyEntries)[0].ToLower()
$actual = (Get-FileHash -Algorithm SHA256 $apk).Hash.ToLower()
if ($expected -eq $actual) { "OK: checksum matches" } else { "MISMATCH" }
```

## Release Builds & Signing

Keep keystore files **outside source control**.

```powershell
# Generate a release keystore
keytool -genkeypair -v -keystore tic-tac-toe.keystore -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 -alias tic-tac-toe

# List SHA fingerprints
keytool -list -v -alias tic-tac-toe -keystore .\tic-tac-toe.keystore
```

Add the SHA-1 / SHA-256 values to your Firebase project settings for production Google Sign-In.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `ENOWORKSPACES` when running `ns` | Use `npm run mobile:android` (invokes `scripts/ns-mobile-run.js`) |
| Emulator can't reach AI API | Confirm `services/ai` is running; Android uses `10.0.2.2:9191` |
| Firebase Google Sign-In fails | Replace placeholder `google-services.json` and match app ID |
| Engine changes not picked up | Rebuild: `npm run build:engine`, then re-link from `apps/mobile` |

## See Also

- Root `README.md` — architecture overview and developer workflow
- `packages/engine/README.md` — engine API and build notes
- `services/ai/README.md` — AI service API and setup

