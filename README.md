# Tic-Tac-Toe Twist

> **v0.2.0** — TypeScript monorepo for a mobile tic-tac-toe game with variant rules, power-ups, and an AI opponent powered by Google Gemini + minimax.

## Architecture

| Component | Path | Description |
|-----------|------|-------------|
| **Game Engine** | `packages/engine` | Pure TypeScript library — board model, rules, move generation, heuristics, and minimax with alpha-beta pruning. Published as `@ttt/engine`. |
| **AI Service** | `services/ai` | Node.js + Express + Genkit microservice exposing a `/move` HTTP endpoint. Uses LLM suggestions (Google Gemini) with engine-based fallback. Deployable as a Firebase Cloud Function. |
| **Mobile App** | `apps/mobile` | NativeScript Core app (TypeScript) — game UI, variant selection, achievements, match history, and Firebase authentication. |

The project uses **npm workspaces** (defined in the root `package.json`). Always run `npm install` from the repo root.

## Repository Structure

```
tic-tac-toe-twist/
├── package.json                         # Root workspace config & scripts
├── firebase.json                        # Firebase Cloud Functions config
├── .firebaserc                          # Firebase project link
├── scripts/
│   └── ns-mobile-run.js                 # NativeScript helper (avoids ENOWORKSPACES)
├── patches/                             # patch-package patches
├── packages/
│   └── engine/
│       ├── package.json                 # @ttt/engine
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                 # Public API exports
│           ├── types.ts                 # Core type definitions
│           ├── board.ts                 # Board model, move generation, win detection
│           ├── variants.ts              # Variant defaults & validation
│           └── ai/
│               ├── minimax.ts           # Alpha-beta search with transposition table
│               └── heuristics.ts        # Position evaluation & scoring
├── services/
│   └── ai/
│       ├── package.json                 # @ttt/ai-service
│       ├── tsconfig.json
│       ├── esbuild.config.mjs           # esbuild bundler (produces dist/index.js)
│       ├── .env.example                 # Environment config template
│       └── src/
│           ├── app.ts                   # Shared Express app (routes & middleware)
│           ├── server.ts                # Local dev entry point (app.listen)
│           ├── index.ts                 # Cloud Function entry point (onRequest)
│           ├── genkit.ts                # Genkit flow registration & dev UI
│           └── flows/
│               └── move.ts              # AI decision engine (LLM + engine fallback)
└── apps/
    └── mobile/
        ├── package.json
        ├── tsconfig.json
        ├── App_Resources/
        │   └── Android/src/
        │       └── google-services.json # Firebase config (placeholder)
        └── app/
            ├── app.ts                   # Bootstrap entry point
            ├── app-root.xml             # Frame / router
            ├── app.css                  # Global styles
            ├── config/
            │   └── firebase-client.ts   # Firebase client configuration
            ├── services/
            │   ├── api.ts               # AI service HTTP client
            │   ├── engine.ts            # Local engine wrapper
            │   ├── firebase.ts          # Firebase initialization
            │   ├── navigation.ts        # Router integration
            │   └── notifier.ts          # Toast / alert notifications
            ├── state/
            │   ├── game-store.ts        # Game state management
            │   ├── match-store.ts       # Match history & replay persistence
            │   ├── auth-store.ts        # Authentication (Firebase + guest)
            │   ├── achievement-store.ts # Achievement tracking & unlocks
            │   ├── auth-bindings.ts     # Reactive auth bindings
            │   └── badge-bindings.ts    # Reactive badge / UI bindings
            ├── home/                    # Home page (variant selection, difficulty)
            ├── game/                    # Game page (board UI, move logic, results)
            ├── account/                 # Login, profile, match detail pages
            ├── about/                   # About page
            ├── assets/                  # Images and resources
            └── utils/
                └── game-format.ts       # Display formatting helpers
```

## Quick Start

### Prerequisites

- **Node.js 18+** and npm 9+
- **NativeScript CLI**: `npm i -g nativescript`
- **Android Studio** and/or **Xcode** for emulators (or real devices)
- **Google Gemini API key** (optional — for LLM-powered AI moves)

### 1. Install dependencies

```bash
npm install
```

### 2. Build the game engine

```bash
npm run build:engine
```

This compiles `packages/engine/src` to `packages/engine/dist` and is required before running the mobile app or AI service.

### 3. Start the AI service (development)

```bash
npm run dev:ai
```

The Express API starts on port **9191** and the Genkit Dev UI on port **3100** (when enabled). To configure the LLM provider:

```bash
cd services/ai
cp .env.example .env
# Edit .env and set GOOGLE_GENAI_API_KEY=<your_key>
```

### 4. Run the mobile app

```bash
npm run mobile:android
```

Pass extra NativeScript flags after `--`:

```bash
npm run mobile:android -- --device emulator-5554
```

> **Why the helper script?** Running `ns` directly inside an npm workspace triggers `ENOWORKSPACES` errors. The repo includes `scripts/ns-mobile-run.js` which wraps `ns run` with `--path apps/mobile` and an env tweak to avoid this issue.

## Root Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `build:engine` | `npm run build:engine` | Build `packages/engine` (tsc → `dist/`) |
| `dev:ai` | `npm run dev:ai` | Start AI service dev server + Genkit UI |
| `build:ai` | `npm run build:ai` | Bundle AI service for production (esbuild → `dist/`) |
| `deploy:ai` | `npm run deploy:ai` | Build engine + deploy AI service to Firebase Cloud Functions |
| `mobile:android` | `npm run mobile:android` | Run mobile app on Android via helper script |
| `debug:android` | `npm run debug:android` | Debug mobile app on Android emulator |

## Game Engine (`packages/engine`)

### Public API

The engine is imported as `@ttt/engine`. Key exports:

#### Game Lifecycle

```typescript
createGame(config: VariantConfig): GameState
applyMove(state: GameState, move: Move): GameState
legalMoves(state: GameState): Move[]
checkWinner(state: GameState): Player | 'Draw' | null
```

#### AI

```typescript
bestMove(state: GameState, forPlayer: Player, opts?: { depth?: number; maxMillis?: number }): Move | null
evaluate(state: GameState, forPlayer: Player): number
```

#### Configuration

```typescript
defaultConfig(): VariantConfig
validateConfig(config: VariantConfig): { ok: true } | { ok: false; reason: string }
```

#### Power-Up Helpers

```typescript
canUseDoubleMove(state: GameState): boolean
isDoubleMoveLegal(state: GameState, move: Move): boolean
isDoubleMoveFirstPlacementLegal(state: GameState, move: Move): boolean
canUseBomb(state: GameState): boolean
isBombLegal(state: GameState, move: Move): boolean
canUseLaneShift(state: GameState): boolean
isLaneShiftLegal(state: GameState, move: Move): boolean
```

All types (`Player`, `Cell`, `Move`, `GameState`, `VariantConfig`, `Difficulty`, `PowerUsage`, etc.) are also exported.

### Variant Configuration

The `VariantConfig` interface controls game rules:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `boardSize` | `3 \| 4 \| 5 \| 6` | `3` | Board dimensions (N×N) |
| `winLength` | `3 \| 4` | `3` | Consecutive marks needed to win |
| `misere` | `boolean` | `false` | Inverse win condition (completing a line loses) |
| `gravity` | `boolean` | `false` | Pieces fall to the bottom of the column |
| `wrap` | `boolean` | `false` | Toroidal board (edges wrap around) |
| `randomBlocks` | `number` | `0` | Number of randomly blocked cells at game start |
| `doubleMove` | `boolean` | `false` | Enable double-move power-up (one-time use per player) |
| `laneShift` | `boolean` | `false` | Enable lane-shift power-up |
| `allowRowColShift` | `boolean` | `false` | Allow shifting rows and columns |
| `bomb` | `boolean` | `false` | Enable bomb power-up (destroys a cell) |
| `chaosMode` | `boolean` | `false` | Enable chaos mode |

### AI Engine

The minimax module (`ai/minimax.ts`) implements:

- **Alpha-beta pruning** with negamax formulation
- **Transposition table** for caching evaluated positions
- **Iterative deepening** from depth 1 to target depth
- **Move ordering** based on heuristic evaluation for pruning efficiency
- **Timeout support** via `maxMillis` option

Default search depths: **10** for 3×3 boards, **5** for larger boards.

## AI Service (`services/ai`)

### API Contract

**`GET /health`** — Health check.

```json
{ "ok": true }
```

**`POST /move`** — Request an AI move.

Request body:

```json
{
  "state": { /* GameState */ },
  "config": { /* VariantConfig */ },
  "difficulty": "chill" | "balanced" | "sharp"
}
```

Response:

```json
{
  "move": { "r": 0, "c": 0 },
  "strategy": "llm" | "engine" | "fallback",
  "reason": "optional explanation"
}
```

### Strategy Selection

The AI service selects moves through a tiered strategy:

1. **LLM** — Sends the board state to Google Gemini for a move suggestion. Validates the response against legal moves. Falls back on invalid or timed-out responses.
2. **Engine** — Uses the local minimax engine with difficulty-based depth scaling:
   - **Chill**: random legal move + shallow heuristic
   - **Balanced**: heuristic + limited alpha-beta search
   - **Sharp**: deeper alpha-beta or perfect play (3×3)
3. **Fallback** — Returns the first legal move if all other strategies fail.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `9191` | Express server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `GOOGLE_GENAI_API_KEY` | — | Google Gemini API key (enables LLM strategy) |
| `GOOGLE_GENAI_MODEL` | `gemini-2.5-flash-lite` | Gemini model(s), space/comma-separated |
| `LLM_SUGGESTION_TIMEOUT_MS` | `10000` | LLM response timeout in ms |
| `GENKIT_PORT` | `3100` | Genkit Dev UI port |
| `GENKIT_DISABLE_DEV_UI` | — | Set `true` to disable the Genkit Dev UI |
| `NODE_ENV` | — | Set `production` to disable the Dev UI |

## Deploying the AI Service (Firebase Cloud Functions)

The AI service can be deployed as a **Firebase 2nd-generation Cloud Function** so the mobile app can call it over the internet instead of requiring a local dev server.

### Architecture

```
┌─────────────────┐       HTTPS        ┌───────────────────────────────────┐
│  Mobile App     │  ──────────────►   │  Firebase Cloud Function (api)   │
│  (NativeScript) │                    │  ─ Express app (app.ts)          │
│                 │  ◄──────────────   │  ─ /health, /move endpoints     │
└─────────────────┘    JSON response   │  ─ @ttt/engine (bundled)        │
                                       │  ─ Google Gemini LLM            │
                                       └───────────────────────────────────┘
```

The Express app is shared between local development (`server.ts`) and the Cloud Function (`index.ts`). The esbuild bundler inlines all workspace dependencies (including `@ttt/engine`) so Firebase deployment doesn't need npm workspace resolution.

### Prerequisites

- **Firebase CLI**: `npm i -g firebase-tools`
- **Authenticated**: `firebase login`
- **Firebase project**: The repo is linked to `tictactoetwist-472303` via `.firebaserc`

### Configuration

#### 1. Set the Gemini API key as a Firebase secret

```bash
firebase functions:secrets:set GOOGLE_GENAI_API_KEY
# Paste your Google Gemini API key when prompted
```

The Cloud Function entry point (`src/index.ts`) declares this secret using `defineSecret()` so it is automatically injected at runtime.

#### 2. Optional: Set the Gemini model

The default model is `gemini-2.5-flash-lite`. To change it, set the `GOOGLE_GENAI_MODEL` environment variable in the Cloud Function configuration:

```bash
firebase functions:config:set ai.model="gemini-2.5-flash"
```

### Build & Deploy

```bash
# From repo root — builds engine, bundles the function, and deploys
npm run deploy:ai
```

Or step by step:

```bash
# 1. Build the game engine (required — the bundler inlines it)
npm run build:engine

# 2. Bundle the Cloud Function with esbuild
npm run build:ai

# 3. Deploy to Firebase
firebase deploy --only functions
```

After deployment, the CLI prints the function URL:

```
✔  functions[api(us-central1)]: Successful create/update
   https://api-<hash>-uc.a.run.app
```

### Testing the Deployment

```bash
# Health check
curl https://<function-url>/health
# Expected: {"ok":true}

# Request a move
curl -X POST https://<function-url>/move \
  -H "Content-Type: application/json" \
  -d '{"state":{"board":[[null,null,null],[null,null,null],[null,null,null]],"turn":"X","moveCount":0,"powers":{"X":{"doubleMove":false,"bomb":false,"laneShift":false},"O":{"doubleMove":false,"bomb":false,"laneShift":false}}},"config":{"boardSize":3,"winLength":3,"gravity":false,"wrap":false,"misere":false,"randomBlocks":0,"doubleMove":false,"laneShift":false,"bomb":false,"chaosMode":false},"difficulty":"balanced"}'
```

### Connecting the Mobile App

The mobile app's API client (`apps/mobile/app/services/api.ts`) automatically probes candidate URLs including the Cloud Function URL. To explicitly point the app at your deployed function:

- **Option A** — Set the `API_BASE_URL` environment variable before building the mobile app
- **Option B** — Call `setApiBaseUrl('https://<function-url>')` at app startup
- **Option C** — The app includes the Cloud Function URL as a probe candidate and will auto-discover it if reachable

### Local Development

Local development is **unchanged** — the existing workflow still works:

```bash
npm run dev:ai          # Starts Express on port 9191 + Genkit Dev UI on 3100
```

The Cloud Function entry point (`index.ts`) sets `NODE_ENV=production` to disable the Genkit Dev UI. The local dev entry point (`server.ts`) does not, so the Dev UI remains available during development.

### Project Structure (Cloud Function Files)

| File | Purpose |
|------|---------|
| `firebase.json` | Firebase project configuration (functions source, runtime) |
| `.firebaserc` | Links repo to Firebase project `tictactoetwist-472303` |
| `services/ai/src/app.ts` | Shared Express app — routes and middleware |
| `services/ai/src/index.ts` | Cloud Function entry point — wraps app with `onRequest()` |
| `services/ai/src/server.ts` | Local dev entry point — imports app and calls `listen()` |
| `services/ai/esbuild.config.mjs` | esbuild bundler config — produces `dist/index.js` |

### Cost & Performance Notes

- **Cold starts**: 2nd-gen functions run on Cloud Run. Expect 2–5 s cold-start latency for the first request after idle. The `minInstances: 0` setting means no cost when idle but slower first response.
- **Memory**: Configured at 512 MiB — sufficient for the minimax engine and LLM client.
- **Timeout**: 60 s per request — well within the function limit.
- **Free tier**: Firebase Blaze (pay-as-you-go) plan is required for Cloud Functions. The free tier includes 2 million invocations/month.

## Mobile App (`apps/mobile`)

The NativeScript Core app provides:

- **Home screen** — Variant configuration, difficulty selection, and game start.
- **Game screen** — Interactive board, move validation, AI integration, win/draw detection, confetti animations, and power-up controls.
- **Results** — Match facts (variant toggles, turns, accuracy), win path overlay, and move replay with auto-play.
- **Account** — Firebase authentication (Google Sign-In) with guest mode fallback. Profile page with match history.
- **Achievements** — Unlock tracking with progress indicators, stored locally and synced to Firestore when signed in.

### Key Integration Points

- **Engine**: imported as `@ttt/engine` via `file:../../packages/engine` dependency.
- **AI Service**: `app/services/api.ts` sends HTTP requests to `/move`. The client auto-discovers the service URL using platform-specific defaults (`http://10.0.2.2:9191` for Android emulator, `http://127.0.0.1:9191` for iOS simulator).
- **Firebase**: `@nativescript/firebase-core`, `@nativescript/firebase-auth`, and `@nativescript/firebase-firestore` for authentication and cloud sync. Requires a valid `google-services.json` in `App_Resources/Android/src/`.

### Data Model (Firestore)

- `users/{uid}/profile` — name, avatar, createdAt
- `users/{uid}/achievements/{id}` — unlockedAt, progress
- `users/{uid}/matches/{matchId}` — config, moves[], winner, duration, createdAt

## Development Notes

### Engine Linkage

`apps/mobile/package.json` references the engine as `file:../../packages/engine`. After rebuilding the engine, re-link from the mobile app directory:

```bash
npm run build:engine
cd apps/mobile
npm i ../../packages/engine --save
```

### Firebase Setup

1. Replace the placeholder `apps/mobile/App_Resources/Android/src/google-services.json` with your Firebase project config.
2. Ensure the `nativescript.id` in `apps/mobile/package.json` (`com.tictactoetwist`) matches the Android app ID in your Firebase project.

### Android Emulator Networking

The Android emulator uses `10.0.2.2` to reach the host machine. The mobile app's API client handles this automatically, but if running the AI service on a custom port, update accordingly.

## Building & Releasing the Debug APK

### Prerequisites

- Root dependencies installed (`npm install`)
- Engine built (`npm run build:engine`)
- Android SDK + emulator or device configured
- NativeScript CLI installed (`npm i -g nativescript`)

### Build Steps

```powershell
# 1. Install dependencies
npm install

# 2. Build the shared engine
npm run build:engine

# 3. Build the debug APK via NativeScript
npm run mobile:android
```

The debug APK is produced at:

```
apps/mobile/platforms/android/app/build/outputs/apk/debug/app-debug.apk
```

Build metadata is in `output-metadata.json` alongside the APK:

```json
{
  "applicationId": "com.tictactoetwist",
  "variantName": "debug",
  "versionCode": 1,
  "versionName": "1.0.0"
}
```

### Integrity Verification

A `SHA256SUMS.txt` file is generated next to the APK for checksum verification:

```powershell
# Verify the debug APK checksum (PowerShell)
$apk = "apps/mobile/platforms/android/app/build/outputs/apk/debug/app-debug.apk"
$sumFile = "apps/mobile/platforms/android/app/build/outputs/apk/debug/SHA256SUMS.txt"
$expected = (Get-Content $sumFile).Split(" ",[System.StringSplitOptions]::RemoveEmptyEntries)[0].ToLower()
$actual = (Get-FileHash -Algorithm SHA256 $apk).Hash.ToLower()
if ($expected -eq $actual) { "OK: checksum matches" } else { "MISMATCH" }
```

### Debug APK Release Strategy

1. **Build** — Run `npm run mobile:android` from repo root. The NativeScript helper script handles workspace isolation automatically.
2. **Verify** — Compare `SHA256SUMS.txt` against the built APK to confirm build integrity.
3. **Distribute** — Share `app-debug.apk` for testing. Debug builds are signed with the Android debug keystore and are suitable for emulators and sideloading to test devices.
4. **Document** — The `output-metadata.json` file records `applicationId`, `versionCode`, `versionName`, and `variantName` for traceability.

### Release (Signed) Builds

For production release builds, a release keystore is required. Keep keystore files **outside source control**.

```powershell
# Generate a release keystore
keytool -genkeypair -v -keystore tic-tac-toe.keystore -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 -alias tic-tac-toe

# List SHA fingerprints (add to Firebase project settings)
keytool -list -v -alias tic-tac-toe -keystore .\tic-tac-toe.keystore
```

Add the SHA-1 / SHA-256 fingerprints to your Firebase project for production Google Sign-In.

### Editing Guidelines

- Game rules and logic belong in `packages/engine/src`. Exported types live in `types.ts`.
- If you change the `/move` API shape or move types, update both `services/ai` and `apps/mobile/app/services/api.ts`.
- Avoid editing NativeScript UI markup (`*.xml`) without testing on a device or emulator.
- Do not change app IDs or bundle identifiers without updating Firebase config and `apps/mobile/package.json`.

