# @ttt/ai-service

Node.js + Express + Genkit microservice that computes AI moves for Tic-Tac-Toe Twist. Uses Google Gemini LLM suggestions with engine-based minimax fallback.

**Version:** 0.4.0 · **Default port:** 9191 · **Genkit Dev UI:** 3100

## Quick Start

```bash
# 1. Install workspaces from repo root
npm install

# 2. Build the engine (required dependency)
npm run build:engine

# 3. Configure environment
cd services/ai
copy .env.example .env
# Edit .env — set GOOGLE_GENAI_API_KEY for LLM moves

# 4. Start dev server (from repo root)
npm run dev:ai
# OR from this workspace
npm --workspace services/ai run dev
```

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `node --loader ts-node/esm --watch src/server.ts` | Dev server with watch mode |
| `build` | `tsc -p tsconfig.json` | Compile to `dist/` |
| `start` | `node dist/server.js` | Run production build |

## Source Layout

```
services/ai/
├── package.json            # @ttt/ai-service v0.4.0
├── tsconfig.json
├── .env.example            # Environment template
└── src/
    ├── server.ts           # Express server, routing, warmup
    ├── genkit.ts           # Genkit flow registration & dev UI
    └── flows/
        └── move.ts         # AI decision engine (LLM + engine fallback)
```

## API Contract

### `GET /health`

```json
{ "ok": true }
```

### `POST /move`

Request body:

```json
{
  "state": { /* GameState from @ttt/engine */ },
  "config": { /* VariantConfig (optional) */ },
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

Input is validated with Zod schemas. Invalid requests return a 400 error.

## Strategy Selection

The service selects moves through a tiered strategy:

| Priority | Strategy | Description |
|----------|----------|-------------|
| 1 | **LLM** | Sends board state to Google Gemini. Validates response against legal moves. Falls back on invalid or timed-out responses. |
| 2 | **Engine** | Uses local minimax engine with difficulty-based depth scaling. |
| 3 | **Fallback** | Returns first legal move if all strategies fail. |

### Difficulty Mapping (Engine Strategy)

| Difficulty | Behaviour |
|------------|-----------|
| `chill` | Random legal move + shallow heuristic |
| `balanced` | Heuristic + limited alpha-beta search |
| `sharp` | Deep alpha-beta or perfect play (3×3) |

### LLM Configuration

- **Model candidates** (tried in order): `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.0-flash-lite`, …
- Configurable via `GOOGLE_GENAI_MODEL` (space/comma-separated list)
- Model cache with automatic fallback on 404 errors
- Transient retry cooldown: 30 s on server errors
- Suggestion timeout: 10 s (configurable via `LLM_SUGGESTION_TIMEOUT_MS`)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `9191` | Express server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `GOOGLE_GENAI_API_KEY` | — | Google Gemini API key (enables LLM strategy) |
| `GOOGLE_GENAI_MODEL` | `gemini-2.5-flash-lite` | Gemini model(s), space/comma-separated |
| `LLM_SUGGESTION_TIMEOUT_MS` | `10000` | LLM response timeout in ms |
| `GENKIT_PORT` | `3100` | Genkit Dev UI port |
| `GENKIT_DISABLE_DEV_UI` | — | Set `true` to disable the Genkit Dev UI |
| `NODE_ENV` | — | Set `production` to disable Dev UI |

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@ttt/engine` | ^0.4.0 | Shared game engine (minimax, rules) |
| `express` | ^4.19.2 | HTTP server |
| `zod` | ^3.23.8 | Request validation |
| `@genkit-ai/core` | ^1.19.2 | Genkit flow framework |
| `@google/generative-ai` | ^0.11.0 | Google Gemini SDK |

## Mobile Client Connectivity

| Platform | URL |
|----------|-----|
| Android emulator | `http://10.0.2.2:9191` |
| iOS simulator | `http://127.0.0.1:9191` |

The mobile app auto-discovers the URL — see `apps/mobile/app/services/api.ts`.

## Server Behaviour

- On startup, the server performs a warmup by computing a move for a default 3×3 board.
- The Genkit Dev UI starts automatically unless `NODE_ENV=production` or `GENKIT_DISABLE_DEV_UI=true`.
- Fallback ports are attempted if the configured port is already in use.

## Editing Guidance

- **Preserve the `/move` request/response shape.** The mobile app depends on `{ move }` in the JSON response.
- Keep secrets in `.env` — never commit API keys. `.env.example` is the source template.
- If you change the API shape, update `apps/mobile/app/services/api.ts` and this README.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Port conflict | Change `PORT`/`GENKIT_PORT` in `.env` or pass env vars |
| Mobile emulator can't reach API | Use host IP mapping: Android `10.0.2.2`, iOS `127.0.0.1` |
| LLM moves always failing | Check `GOOGLE_GENAI_API_KEY` in `.env`; service falls back to engine |

## See Also

- Root `README.md` — architecture overview
- `packages/engine/README.md` — engine API consumed by this service
- `apps/README.md` — mobile app that calls this service
