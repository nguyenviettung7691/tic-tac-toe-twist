/**
 * Firebase Cloud Functions entry point.
 *
 * Wraps the shared Express app (`app.ts`) as a Firebase 2nd-gen HTTPS
 * Cloud Function so the AI service can be deployed with:
 *
 *   firebase deploy --only functions
 *
 * Environment:
 *   - NODE_ENV is set to 'production' to disable the Genkit Dev UI.
 *   - GOOGLE_GENAI_API_KEY must be configured as a Firebase secret.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { createApp } from './app.js';

/* ------------------------------------------------------------------ */
/*  Secrets                                                           */
/* ------------------------------------------------------------------ */

/**
 * The Google Generative AI API key, managed via Firebase secrets:
 *   firebase functions:secrets:set GOOGLE_GENAI_API_KEY
 */
const googleGenaiApiKey = defineSecret('GOOGLE_GENAI_API_KEY');

/* ------------------------------------------------------------------ */
/*  Express app                                                       */
/* ------------------------------------------------------------------ */

// Ensure production mode so Genkit Dev UI is skipped
process.env.NODE_ENV = 'production';

const app = createApp();

/* ------------------------------------------------------------------ */
/*  Cloud Function export                                             */
/* ------------------------------------------------------------------ */

export const api = onRequest(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 60,
    minInstances: 0,
    maxInstances: 10,
    secrets: [googleGenaiApiKey],
  },
  app,
);
