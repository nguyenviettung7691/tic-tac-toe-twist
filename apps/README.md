Tic-Tac-Toe-Twist (NativeScript mobile app)

This folder contains the NativeScript Core + TypeScript mobile app that uses `@ttt/engine` for game logic and `services/ai` for the Genkit-powered move endpoint.

Quick setup

1. From repo root install workspaces:

```powershell
npm install
```

2. Build and link the shared engine before running the app (engine must be built so `dist/` is available):

```powershell
npm run build:engine
cd apps/mobile
npm i ../../packages/engine --save
```

Running the app

- Preferred (from repo root, uses helper to avoid workspace ENOWORKSPACES):

```powershell
npm run mobile:android
# Add extra ns flags after --, e.g.:
npm run mobile:android -- --device emulator-5554
```

- Alternative: run `ns` directly but include `--path` to avoid workspace issues:

```powershell
ns run android --path apps/mobile
```

Firebase notes

- Replace the placeholder `apps/mobile/App_Resources/Android/src/google-services.json` with your Firebase Android config when you need Google Sign-In.
- Ensure `apps/mobile/package.json` contains the `nativescript.id` that matches your Firebase Android app (default: `com.tictactoetwist`).
- Update `apps/mobile/app/config/firebase-client.ts` with your OAuth client ID for Google sign-in.

Engine & AI integration

- The mobile app imports the engine as `@ttt/engine` (see `apps/mobile/package.json`).
- The mobile app calls the AI service at `/move`. Android emulator mapping: `http://10.0.2.2:9191` (service default). See `apps/mobile/app/services/api.ts`.

Helpful file anchors

- `app/app.ts` — app bootstrap
- `app/services/api.ts` — calls `/move` on the AI service
- `app/state/match-store.ts` — match/move persistence and replay handling
- `App_Resources/Android/src/google-services.json` — Firebase placeholder

Troubleshooting

- If `ns` errors with `ENOWORKSPACES`, use the helper script `scripts/ns-mobile-run.js` (this is what `npm run mobile:android` invokes).
- If the emulator can't reach the AI API, confirm `services/ai` is running and use `10.0.2.2:9191` from Android.

Testing and debug

- Debugging helper (root):

```powershell
npm run debug:android
```

Release builds & signing

- For release signing and Firebase production SHA fingerprints follow the usual keytool commands — keep keystore files outside source control.

PowerShell keytool examples (copyable)

Generate a release keystore:

```powershell
keytool -genkeypair -v -keystore tic-tac-toe.keystore -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 -alias tic-tac-toe
```

List SHA fingerprints from a keystore:

```powershell
keytool -list -v -alias tic-tac-toe -keystore .\tic-tac-toe.keystore
```

Add the printed SHA-1 / SHA-256 values to your Firebase project settings so Google Sign-In works in production.

PowerShell: extract only SHA-1 or SHA-256 (copyable)

```powershell
# SHA-1 only
(& keytool -list -v -alias tic-tac-toe -keystore .\tic-tac-toe.keystore) -match 'SHA1:\s*([0-9A-Fa-f:]*)' | Out-Null; $matches[1]

# SHA-256 only
(& keytool -list -v -alias tic-tac-toe -keystore .\tic-tac-toe.keystore) -match 'SHA256:\s*([0-9A-Fa-f:]*)' | Out-Null; $matches[1]
```

Where to look for more details

- Root `README.md` — overall architecture and developer workflow.
- `packages/engine/README.md` — engine API and build notes.
- `services/ai/README.md` — AI service API and setup.

