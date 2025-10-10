# services/ai

Node + Genkit service that exposes the AI move endpoint used by the mobile app.

What this service does
- Hosts an Express API (default port 9191) that exposes `/move` to compute the AI's chosen move for a given game state.
- Provides a Genkit Flow and a development UI (default port 3100) to author/inspect AI flows when enabled.

Quick start (developer)
1. From repository root install dependencies (workspaces):

```bash
npm install
```

2. Copy environment template and configure provider keys (Genkit/LLM provider):

```bash
cd services/ai
copy .env.example .env
# Edit .env and set your provider key(s) and optional PORT/GENKIT_PORT
```

3. Run in development (root):

```bash
npm run dev:ai
# OR from this workspace
npm --workspace services/ai run dev
```

What to expect
- The Express API will listen on `PORT` (defaults to 9191). The Genkit Flow dev UI listens on `GENKIT_PORT` (defaults to 3100). The service will attempt fallback ports if those are taken.
- Mobile Android emulator should call `http://10.0.2.2:9191` by default (see `apps/mobile/app/services/api.ts`).

API contract (important)
- Endpoint: POST /move
- Request body: {
  state: GameState,    // engine game state (moves[], current player, config)
  config?: VariantConfig, // optional game config
  difficulty?: 'chill'|'balanced'|'sharp' // optional difficulty hint
}
- Response: { move: Move }

Notes for agents editing this service
- Preserve the `/move` request/response shape. The mobile app assumes `{ move }` in the JSON response.
- Keep authentication and provider keys in `.env` (do not commit secrets). `.env.example` is the source template.
- If you change the API shape, update `apps/mobile/app/services/api.ts` and the README here so mobile and CI know how to call the service.

Files of interest
- `src/server.ts` — Express server + route wiring.
- `src/genkit.ts` — Genkit flow integration and wiring to the chosen LLM provider.
- `src/flows/move.ts` — Genkit flow that decides move selection and difficulty handling.

Troubleshooting
- Port conflicts: change `PORT`/`GENKIT_PORT` in `.env` or pass env variables when starting.
- If the mobile emulator cannot reach the API, use the host IP mapping for your platform (Android emulator uses `10.0.2.2`).

License and contribution
- Follow the monorepo contribution pattern: small changes, preserve types, and include a short commit message explaining the change and affected files.
