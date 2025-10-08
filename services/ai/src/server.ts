import 'dotenv/config';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createGame, type VariantConfig } from '@ttt/engine';
import { chooseMove, MoveInput, MoveOutput } from './flows/move.js';
import { startGenkitDevUi, stopGenkitDevUi } from './genkit.js';

const app = express();
void startGenkitDevUi();
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

let httpServer: Server | null = null;
let shuttingDown = false;
let warmupPromise: Promise<void> | null = null;

const WARMUP_CONFIG: VariantConfig = {
  boardSize: 3,
  winLength: 3,
  gravity: false,
  wrap: false,
  misere: false,
  randomBlocks: 0,
  doubleMove: false,
  laneShift: false,
  bomb: false,
  chaosMode: false,
};

async function warmupAiEngine(): Promise<void> {
  if (warmupPromise) {
    return warmupPromise;
  }

  const task = (async () => {
    try {
      const warmupState = createGame({ ...WARMUP_CONFIG });
      const payload = MoveInput.parse({
        state: warmupState,
        config: { ...WARMUP_CONFIG },
        difficulty: 'balanced' as const,
      });
      await chooseMove(payload);
      console.info('[server] Warmup request completed');
    } catch (err) {
      console.warn('[server] Warmup request failed', err);
    }
  })();

  warmupPromise = task.finally(() => {
    warmupPromise = null;
  });

  await warmupPromise;
}

async function startServer() {
  const requestedPort = Number(process.env.PORT || 9191);
  if (!Number.isFinite(requestedPort) || requestedPort <= 0) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}`);
  }

  const host = process.env.HOST || '0.0.0.0';

  httpServer = app.listen(requestedPort, host, () => {
    const address = httpServer?.address() as AddressInfo | null;
    if (!address) {
      console.log(`[server] AI service listening on port ${requestedPort}`);
      return;
    }

    const addressText = address.address;
    const isWildcardHost = addressText === '::' || addressText === '0.0.0.0';
    const displayHost = isWildcardHost ? 'localhost' : addressText;
    const baseUrl = `http://${displayHost}:${address.port}`;
    console.log(`[server] AI service listening on ${baseUrl}`);

    if (isWildcardHost || displayHost === 'localhost' || displayHost === '127.0.0.1') {
      console.log(`[server] Android emulator base URL: http://10.0.2.2:${address.port}`);
      console.log(`[server] iOS simulator base URL: http://127.0.0.1:${address.port}`);
    }

    void warmupAiEngine();
  });

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[server] Port ${requestedPort} is already in use. Stop the other process or set PORT to an available value.`
      );
    } else {
      console.error('[server] HTTP server error', err);
    }
    shutdown('HTTP server failed to start', 1).catch(() => process.exit(1));
  });
}

async function shutdown(reason: string, exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.info(`[server] ${reason}`);
  try {
    await stopGenkitDevUi();
  } catch (err) {
    console.warn('[server] Failed to stop Genkit dev UI', err);
  }

  if (httpServer) {
    try {
      await new Promise<void>((resolve, reject) => {
        httpServer!.close((err) => (err ? reject(err) : resolve()));
      });
    } catch (err) {
      console.warn('[server] Error while closing HTTP server', err);
      exitCode = exitCode || 1;
    }
    httpServer = null;
  }

  process.exit(exitCode);
}

const handleSignal = (signal: NodeJS.Signals) => {
  shutdown(`Received ${signal}, shutting down...`).catch((err) => {
    console.error('[server] Error while shutting down', err);
    process.exit(1);
  });
};

process.once('SIGINT', handleSignal);
process.once('SIGTERM', handleSignal);

startServer().catch((err) => {
  console.error('[server] Failed to start', err);
  shutdown('Startup failed', 1).catch(() => process.exit(1));
});
