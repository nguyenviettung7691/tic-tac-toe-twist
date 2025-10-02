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

1. **Set the package name** — `apps/mobile/App_Resources/Android/app.gradle` now declares `applicationId "com.tictactoetwist"`. Create the matching Android app in Firebase, or adjust the ID in that file before the first build.
2. **Add google-services.json** — replace the placeholder at `App_Resources/Android/src/google-services.json` with the file Firebase generates after you register the Android app. Keep the same path.
3. **Fill in the Google OAuth client ID** — update `apps/mobile/app/config/firebase-client.ts` with your Google OAuth web client ID (used by Google sign-in).
4. **Share signing hashes with Firebase** — generate the debug SHA-1/SHA-256 fingerprints that Firebase needs using:
   ```sh
   keytool -list -v `
   -alias androiddebugkey `
   -keystore "$env:USERPROFILE\.android\debug.keystore" `
   -storepass android -keypass android
   ```
   > macOS/Linux: replace the keystore path with `~/.android/debug.keystore`.

   Add the fingerprint(s) in the Firebase console so Google sign-in works on emulators and debug builds.
5. (Optional) For release builds also add the iOS config (`GoogleService-Info.plist`) under `App_Resources/iOS` if you target iOS.

Release fingerprints (for production builds):

- Generate or locate your release keystore. If you need to create one, run:
  ```sh
  keytool -genkeypair -v -keystore /path/to/your-release.keystore \
    -alias your_alias -keyalg RSA -keysize 2048 -validity 10000
  ```
  Remember the keystore path, alias, and passwords; you will need them for signing.
- List the SHA fingerprints from that keystore and register them in Firebase alongside the debug ones:
  ```sh
  keytool -list -v -alias your_alias -keystore /path/to/your-release.keystore
  ```
  The command prompts for the store/key passwords and prints both SHA-1 and SHA-256 values. Copy them into Firebase > Project settings > Your apps.
- If you later opt into Google Play App Signing, Google will generate its own signing certificate. Copy the "App signing certificate" SHA fingerprints from the Play Console and add them to Firebase as well so Google Sign-In keeps working in production.

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

Authentication UI:

- The bottom navigation now links to dedicated `login`, `register`, and `profile` screens.
- Avatar state in the ActionBar is driven from Firebase auth; once a user signs in you will see their photo (or initials) on every page.
- Google sign-in uses the native SDK; ensure the OAuth client ID above is configured or the button will surface a configuration error message.

Animations on result screen:

- Use `@nativescript-community/ui-lottie` (confetti animation), and animate board overlays to show the winning line.

Replay:

- Store `moves[]` in match state; step through history to animate playback.

