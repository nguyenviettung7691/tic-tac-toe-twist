Tic-Tac-Toe-Twist — overview

This repository is a TypeScript monorepo containing:

- `apps/mobile` — NativeScript Core mobile app (UI + local flows)
- `packages/engine` — shared TypeScript game engine (board, variants, move generation, heuristics, minimax)
- `services/ai` — Node + Genkit service that exposes an AI `/move` endpoint used by the app

The project uses npm workspaces (root `package.json`) — prefer running install/build commands from the repo root.

Quick start

1) Install dependencies (repo root):

```powershell
npm install
```

2) Build the engine (required before linking into the mobile app):

```powershell
npm run build:engine
```

3) Run the Genkit AI service (development):

```powershell
npm run dev:ai
# or
npm --workspace services/ai run dev
```

4) Run the mobile app (preferred via helper to avoid workspace issues):

```powershell
npm run mobile:android
# append extra ns flags after --, e.g.:
npm run mobile:android -- --device emulator-5554
```

Why the helper script? The repo includes `scripts/ns-mobile-run.js`. It wraps `ns run` and forces `--path apps/mobile` plus an env tweak so calling `ns` from the repo root avoids `ENOWORKSPACES` errors that occur inside npm workspaces.

Important paths & anchors

- `scripts/ns-mobile-run.js` — helper used by `npm run mobile:android`.
- `packages/engine/src` — primary place to edit game logic and AI.
- `packages/engine/package.json` — build and public exports (produces `dist/`).
- `services/ai/src` — Express server + Genkit wiring. `.env.example` is provided.
- `apps/mobile/app/services/api.ts` — mobile client calling `/move`.
- `apps/mobile/App_Resources/Android/src/google-services.json` — Firebase placeholder (replace for Google Sign-In).

Engine public API (anchors)

- `createGame(config: VariantConfig): GameState`
- `generateMoves(state: GameState): Move[]`
- `applyMove(state: GameState, move: Move): GameState`
- `checkWinner(state: GameState): { winner: 'X'|'O'|'Draw'|null }`
- `evaluate(state: GameState, forPlayer: Player): number`
- `bestMove(state: GameState, options?: { depth?: number }): Move`

AI service contract

- POST `/move` (default port 9191). Request `{ state, config?, difficulty? }` → Response `{ move }`.
- Genkit Dev UI runs on `GENKIT_PORT` (default 3100) when enabled. See `services/ai/.env.example`.

Project-specific gotchas

- NativeScript CLI inside a workspace: prefer the helper script or use `ns ... --path apps/mobile` to avoid `ENOWORKSPACES`.
- Engine linkage: `apps/mobile/package.json` references the engine as `file:../../packages/engine`. After `npm run build:engine` you may `cd apps/mobile && npm i ../../packages/engine --save` to re-link in development.
- Firebase: replace `apps/mobile/App_Resources/Android/src/google-services.json` and ensure `apps/mobile/package.json` `nativescript.id` matches your Firebase Android app id.
- Android emulator networking: use `http://10.0.2.2:9191` to reach the AI service running on host.

Useful scripts (root `package.json`)

- `npm run build:engine` — builds `packages/engine` (tsc -> `dist/`).
- `npm run dev:ai` — runs the AI service dev server and Genkit UI.
- `npm run build:ai` — builds the AI service workspace.
- `npm run mobile:android` — helper to run the NativeScript app on Android via `scripts/ns-mobile-run.js`.
- `npm run debug:android` — debug wrapper for the app.

When editing

- Prefer small, focused edits. Game rules belong in `packages/engine/src` and exported types live in `packages/engine/src/types.ts`.
- If you change the `/move` API or move shapes, update `services/ai` and `apps/mobile/app/services/api.ts` accordingly.

Next steps for contributors

1. Build the engine:

```powershell
npm run build:engine
```

2. Run the AI service (separate terminal):

```powershell
npm run dev:ai
```

3. Run the mobile app (helper):

```powershell
npm run mobile:android
```

If you want, I can add smoke-test scripts for `packages/engine` and `services/ai` to automate basic sanity checks.

---

AWS Deployment (proposed)

This project does not currently include deployment manifests. Below are two practical, low-risk options to run the two components on AWS and recommendations for secrets, CI/CD and scaling.

High-level architectures (recommended)

- Option A (recommended for simplicity):
   - `services/ai` → containerized and deployed to ECS Fargate behind an Application Load Balancer (HTTPS). The `packages/engine` code stays bundled inside the `services/ai` image (single deployable unit). Store Genkit/API keys in AWS Secrets Manager and pass them as task environment variables.

- Option B (service separation):
   - `services/ai` → ECS Fargate (or Lambda+API Gateway for lower traffic).
   - `packages/engine` → publish as a Lambda Layer (or a small HTTP microservice in ECS) so other services can call the engine via Lambda or HTTP. Use this if you need independent autoscaling for compute-heavy evaluation.

Why these choices

- ECS Fargate is straightforward for Node services that require long-running connections, Genkit flows, and predictable networking.
- Packaging the engine inside the AI container (Option A) minimizes cross-service complexity and is easiest to CI/CD. Use Option B if you want the engine to scale separately or share it across many services.

Secrets & configuration

- Keep provider keys (Genkit/LLM keys) in AWS Secrets Manager or SSM Parameter Store (SecureString). Grant the ECS task role or Lambda execution role permission to read the secret.
- Use environment variables in ECS Task Definitions or Lambda configuration to pass non-secret settings (PORT, DIFFICULTY defaults) and reference secrets at runtime.

Quick example: containerize `services/ai` and push to ECR (PowerShell)

1) Prepare a `Dockerfile` in `services/ai/` (simple Node container). Example Dockerfile snippet (add to repo before using):

```
FROM node:18-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV NODE_ENV=production
EXPOSE 9191
CMD ["node", "dist/server.js"]
```

2) Build, tag and push to ECR (example commands):

```powershell
# create ECR repo (one-time)
aws ecr create-repository --repository-name tic-tac-toe-ai --region us-east-1

# build and tag
docker build -t tic-tac-toe-ai:latest services/ai
$accountId = (aws sts get-caller-identity --query Account --output text)
$repo = "$accountId.dkr.ecr.us-east-1.amazonaws.com/tic-tac-toe-ai"
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $repo
docker tag tic-tac-toe-ai:latest $repo:latest
docker push $repo:latest
```

3) Deploy to ECS Fargate
- Use AWS Copilot (`copilot init`) or an AWS CloudFormation / Terraform template to create an ECS service, ALB, and auto-scaling. Copilot commands are quick:

```powershell
copilot init --app ttt --svc ai --dockerfile services/ai/Dockerfile --deploy
```

Engine packaging options

- Option A (bundle): keep `packages/engine` compiled inside `services/ai` image. Build step in CI: `npm run build:engine` then copy `packages/engine/dist` into the image. Simple and recommended for initial deployments.

- Option B (Lambda Layer): publish `packages/engine` as a Lambda Layer for other Lambda functions to consume. Example (PowerShell):

```powershell
# build the engine
npm run build:engine

# prepare layer directory
mkdir layer_temp; mkdir layer_temp\nodejs; npm pack packages/engine --pack-destination .\layer_temp\nodejs
# create a layer zip (ensure nodejs/node_modules/@ttt/engine structure)
Compress-Archive -Path layer_temp\* -DestinationPath engine-layer.zip

# publish layer
$layerArn = aws lambda publish-layer-version --layer-name ttt-engine-layer --zip-file fileb://engine-layer.zip --compatible-runtimes nodejs18.x --query 'LayerVersionArn' --output text
Write-Host "Published layer: $layerArn"
```

CI/CD recommendations

- Use GitHub Actions to build images, run tests (if added), and push images to ECR. Use an Actions job that:
   1. Runs `npm ci` at repo root
   2. Runs `npm run build:engine`
   3. Builds Docker image for `services/ai` and pushes to ECR
   4. Deploys via Copilot or triggers CloudFormation/Terraform apply.
- Store AWS credentials in GitHub Secrets and use least-privilege IAM for the CI role.

Security & IAM

- Create an ECS Task Role with permissions to read Secrets Manager secrets and optionally to call other AWS services.
- If you publish the engine to CodeArtifact or use CodeBuild, create a CI role that can publish artifacts and push to ECR.

Cost & scaling notes

- Start with small Fargate tasks (0.25–0.5 vCPU) and scale based on CPU/Request metrics.
- Lambda is cheaper for infrequent calls but may be more complex if Genkit dependencies require long-lived connections.

Next steps I can implement

- Add a sample `Dockerfile` under `services/ai/` and a minimal `ecs-copilot` manifest.
- Create a GitHub Actions workflow template to build & push the AI image and build the engine.
- Add a simple CloudFormation or Terraform sample for ECS + ALB.

Tell me which of the above you'd like me to implement and I will create the required files and CI templates.

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

3) Add Firebase (cloud sync):

   - `npm i @nativescript/firebase-core @nativescript/firebase-auth @nativescript/firebase-firestore`

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

- Confetti animation with CSS.
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

- First Win, Flawless (no mistakes), Fork Master, Center Skeptic (win without center), Streak 3/5/10, Variant Explorer (play 5 variants), Gravity Guru, Misere Mindset, Chaos Wrangler.

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

