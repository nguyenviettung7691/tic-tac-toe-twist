Tic-Tac-Toe-Twist

An extendable, single‑player tic‑tac‑toe with twists. Cross‑device UI via NativeScript, shared TypeScript rules/AI engine, and a Genkit-powered AI service for dynamic difficulty and variant support.

---

Brainstorm: Fun Variants and New Rules

- Board Size: 3x3 (classic), 4x4, 5x5, 6x6. Win length configurable (3 or 4).
- Gravity: Pieces fall to the lowest empty cell in the chosen column.
- Wrap (Torus): Lines can wrap across edges (e.g., right edge continues at left).
- Misère: You lose if you make a 3‑in‑a‑row (or required win length).
- Notakto: Both players place X. Creating a line loses. Optionally play on multiple small boards.
- Random Blocks: 1–3 cells blocked at start; cannot play there.
- Double Move: Take two placements on your turn; cannot complete two distinct lines in one turn.
- Row/Col Shift: Once per game, shift a selected row or column by one cell cyclically.
- Power: One‑time “bomb” removes a single opponent piece; cannot be used to immediately win.
- Knight Constraint: Must play a knight’s move away from the opponent’s last move.
- Fog of War: Non‑adjacent cells are hidden until scanned (costs your move).
- Chaos Mode: Each round randomly selects from a curated set of twists.

Combine variants: Players can enable multiple compatible toggles at game start; conflicts are flagged (e.g., Notakto + Misère).

---

Architecture Overview

- apps/mobile (NativeScript Core + TypeScript):
  - Cross‑device UI, animations, result screen, replay.
  - Calls shared rules/AI for local play; calls Genkit AI service for advanced difficulty style.
- packages/engine (TypeScript library):
  - Board model, variant system, rules, win detection.
  - Heuristic evaluator + alpha‑beta minimax (configurable depth).
  - Move generator supports Classic, Board Size, Gravity, Wrap; stubs for complex variants.
- services/ai (Node + Genkit):
  - Exposes a `/move` endpoint and a Genkit Flow `chooseMove`.
  - Hard: algorithmic search. Medium: heuristic search.
- Data and Achievements:
  - Local persistence + optional cloud sync with `@nativescript/firebase` (Auth + Firestore).
  - Data model for profiles, achievements, and match history with replay.

---

Monorepo Layout

.
├─ README.md
├─ package.json            # npm workspaces (engine, AI service)
├─ packages
│  └─ engine
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ src
│        ├─ index.ts
│        ├─ types.ts
│        ├─ board.ts
│        ├─ variants.ts
│        └─ ai
│           ├─ heuristics.ts
│           └─ minimax.ts
├─ services
│  └─ ai
│     ├─ package.json
│     ├─ tsconfig.json
│     ├─ src
│     │  ├─ server.ts
│     │  └─ flows
│     │     └─ move.ts
│     └─ .env.example
└─ apps
   └─ mobile               # Created via NativeScript CLI (instructions below)
      └─ README.md         # Setup guide to generate and link the NS app

---

Setup: Prereqs

- Node.js 18+ and npm 9+.
- NativeScript CLI: `npm i -g nativescript`.
- Android Studio and/or Xcode for device emulators (or real devices).
- For Genkit LLM provider (optional): a provider key (e.g., Google Gemini or OpenAI) and the Genkit CLI.

---

Step 1 — Install and Bootstrap

1) Install dependencies (root workspaces):

   - `npm install`

2) Create the NativeScript app (inside `apps/`):

   - `cd apps`
   - `ns create mobile --template @nativescript/template-blank-ts`
   - `cd mobile && npm install`

3) Add UI goodies and Firebase (optional cloud sync):

   - `npm i @nativescript/firebase-core @nativescript/firebase-auth @nativescript/firebase-firestore`
   - `npm i @nativescript-community/ui-lottie`

4) Link the shared engine into the app:

   - At repo root: `npm run build:engine`
   - In `apps/mobile`: `npm i ../../packages/engine --save`
   - Import as `import { createGame, bestMove } from '@ttt/engine'`.

---

Step 2 — Genkit AI Service

1) Configure provider (example: Google Gemini):

   - `cd services/ai`
   - `copy .env.example .env` to create your `.env`.
   - Then in your new `.env`, set `GOOGLE_GENAI_API_KEY=<your_key>` (or use an OpenAI key after adjusting the provider wiring).

2) Install and run:

   - `npm install`
   - `npm run dev` (runs the Express API on `PORT` 9191 and the Genkit Flow Dev UI on `GENKIT_PORT` 3100; both auto-fall back to the next open port. Set `GENKIT_DISABLE_DEV_UI=true` to skip the UI)

3) Mobile app: set the API base URL (e.g., `http://10.0.2.2:9191` on Android emulator) in a config file and call `/move` with `{ state, config, difficulty }`.

---

Step 3 — Run the Mobile App

- Android: `ns run android` (from `apps/mobile`).
- iOS: `ns run ios` (from `apps/mobile`).

---

Engine API (packages/engine)

- `createGame(config: VariantConfig): GameState`
- `generateMoves(state: GameState): Move[]`
- `applyMove(state: GameState, move: Move): GameState`
- `checkWinner(state: GameState): { winner: 'X'|'O'|'Draw'|null }`
- `evaluate(state: GameState, forPlayer: Player): number`
- `bestMove(state: GameState, options?: { depth?: number }): Move`

Supported today: Classic, Board Size (3–6), Win Length (3–4), Gravity, Wrap. Other variants are declared and validated; some advanced mechanics are left as TODOs in code stubs with clear guards.

---

Difficulty Modes

- Chill: random among safe moves + shallow heuristic (no forks).
- Balanced: heuristic + limited alpha‑beta search.
- Sharp: deeper alpha‑beta or perfect play for 3x3.

---

Result Screen (Mobile)

- Confetti animation via `@nativescript-community/ui-lottie`.
- Match facts: variant toggles, turns, accuracy (blunders), win path overlay.
- Replay: scrub through moves, auto‑play, share gif (stretch goal).
- CTA: Rematch with same variants; change variants; difficulty toggle.

---

Player Data & Achievements

- Local: store profile and progress in app storage; sync when signed in.
- Cloud (optional): Firebase Auth + Firestore via `@nativescript/firebase`.
- Data model:
  - `users/{uid}/profile` — name, avatar, createdAt.
  - `users/{uid}/achievements/{id}` — unlockedAt, progress.
  - `users/{uid}/matches/{matchId}` — config, moves[], winner, duration, createdAt.

Sample Achievements

- First Win, Flawless (no mistakes), Fork Master, Center Skeptic (win without center), Streak 3/5/10, Variant Explorer (play 5 variants), Gravity Guru, Misère Mindset, Chaos Wrangler.

---

NativeScript App Structure (suggested)

apps/mobile/app
- app.ts                      # bootstrap
- app-root.xml                # Frame/Router
- app.css                     # theme
- pages
  - home
    - home-page.xml/ts/css    # variant toggles + difficulty + start
  - game
    - game-page.xml/ts/css    # grid/board, animations, power UI, inline results
  - profile
    - profile-page.xml/ts/css # achievements
- services
  - api.ts                    # calls Genkit AI service
  - storage.ts                # local/Firebase persistence
- state
  - store.ts                  # simple game/app state

---

Security and Sync Notes

- If enabling cloud sync, add Firestore security rules to restrict users to their own data.
- Keep replay payloads compact: store move list + seed; recompute derived stats on demand.

---

Next Steps

1) Generate the NativeScript app under `apps/mobile` and wire the engine.
2) Run the Genkit AI service and test `/move` from the app.
3) Implement UI flows (home → game with inline result + replay).
4) Add achievements tracking, then optional Firebase auth/sync.
5) Iterate on variants and animations.

