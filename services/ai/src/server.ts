import 'dotenv/config';
import express from 'express';
import getPort, { portNumbers } from 'get-port';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
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

async function startServer() {
  const preferredPort = Number(process.env.PORT || 9191);
  const port = await getPort({ port: portNumbers(preferredPort, preferredPort + 20) });

  if (port !== preferredPort) {
    console.warn(`[server] Port ${preferredPort} is busy; using ${port} instead. Set PORT to override.`);
  }

  httpServer = app.listen(port, () => {
    const address = httpServer?.address() as AddressInfo | null;
    if (address) {
      const host = address.address === '::' ? 'localhost' : address.address;
      const baseUrl = `http://${host}:${address.port}`;
      console.log(`[server] AI service listening on ${baseUrl}`);
      if (host === 'localhost' || host === '127.0.0.1' || host === '::') {
        console.log(`[server] Android emulator base URL: http://10.0.2.2:${address.port}`);
      }
    } else {
      console.log(`[server] AI service listening on port ${port}`);
    }
  });

  httpServer.on('error', (err) => {
    console.error('[server] HTTP server error', err);
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
