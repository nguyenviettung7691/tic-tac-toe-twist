import express from 'express';
import { chooseMove, MoveInput, MoveOutput } from './flows/move.js';

/**
 * Shared Express application used by both the local dev server (`server.ts`)
 * and the Firebase Cloud Function entry point (`index.ts`).
 *
 * Defines the `/health` and `/move` routes without starting an HTTP listener
 * so the caller can decide how to serve it.
 */
export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.post('/move', async (req, res) => {
    try {
      const parsed = MoveInput.parse(req.body);
      const out = await chooseMove(parsed);
      MoveOutput.parse(out);
      res.json(out);
    } catch (e: any) {
      res.status(400).json({ error: e.message ?? 'Invalid input' });
    }
  });

  return app;
}
