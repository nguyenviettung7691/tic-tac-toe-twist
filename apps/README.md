Tic-Tac-Toe-Twist (NativeScript app)

Generate and run the NativeScript app here, then link the shared engine and call the AI service.

Create the app:

1) From repo root: `cd apps`
2) `ns create mobile --template @nativescript/template-blank-ts`
3) `cd mobile && npm install`

Add optional plugins:

- `npm i @nativescript/firebase-core @nativescript/firebase-auth @nativescript/firebase-firestore`
- `npm i @nativescript-community/ui-lottie`

Link the shared engine:

- From repo root: `npm run build:engine`
- In this folder: `npm i ../../packages/engine --save`

Run the mobile app:

- From repo root: `npm run mobile:android`
- Append extra NativeScript flags after `--`, e.g. `npm run mobile:android -- --device emulator-5554`
- To target other platforms call the helper directly, e.g. `node scripts/ns-mobile-run.js ios --emulator`

> NOTE: Running `ns run android` directly inside `apps/mobile` under npm workspaces triggers `ENOWORKSPACES`. Use the helper script (or pass `--path apps/mobile`) so npm reads a global config instead.

Firebase setup:

- Replace the placeholder config at `App_Resources/Android/src/google-services.json` with your Firebase project's file.
- For release builds also add the iOS config (`GoogleService-Info.plist`) under `App_Resources/iOS` if you target iOS.

Use in code:

```ts
// e.g., in app/pages/game/game-page.ts
import { createGame, bestMove, defaultConfig } from '@ttt/engine';

const config = { ...defaultConfig(), gravity: false, wrap: false };
let state = createGame(config);

// When AI turn:
const mv = bestMove(state, state.current, { depth: 6 });
// apply move through engine utilities in UI handler
```

Call the AI service (Genkit-powered):

```ts
const API_BASE = global.isAndroid ? 'http://10.0.2.2:9191' : 'http://localhost:9191';
const resp = await fetch(`${API_BASE}/move`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ state, config, difficulty: 'balanced' })
});
const json = await resp.json();
// { move: { r, c } }
```

Animations on result screen:

- Use `@nativescript-community/ui-lottie` (confetti animation), and animate board overlays to show the winning line.

Replay:

- Store `moves[]` in match state; step through history to animate playback.

