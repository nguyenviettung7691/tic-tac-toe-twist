import { defineFlow, ReflectionServer } from '@genkit-ai/core';
import { Registry } from '@genkit-ai/core/registry';
import { initNodeFeatures } from '@genkit-ai/core/node';
import { MoveInput, MoveOutput, chooseMove } from './flows/move.js';

initNodeFeatures();

const registry = new Registry();

export const chooseMoveFlow = defineFlow(
  registry,
  {
    name: 'chooseMove',
    inputSchema: MoveInput,
    outputSchema: MoveOutput,
    metadata: {
      description: 'Returns the next move using the Tic-Tac-Toe Twist engine.',
    },
  },
  async (payload) => chooseMove(payload)
);

let reflectionServer: ReflectionServer | null = null;
let reflectionServerPromise: Promise<ReflectionServer | null> | null = null;

function shouldStartDevUi() {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  if (process.env.GENKIT_DISABLE_DEV_UI?.toLowerCase() === 'true') {
    return false;
  }
  return true;
}

export async function startGenkitDevUi() {
  if (!shouldStartDevUi()) {
    return null;
  }
  if (reflectionServerPromise) {
    return reflectionServerPromise;
  }

  const desiredPort = Number(process.env.GENKIT_PORT || 3100);
  const server = new ReflectionServer(registry, {
    port: desiredPort,
    name: 'Tic-Tac-Toe Twist AI',
    configuredEnvs: ['dev'],
  });

  reflectionServerPromise = server
    .start()
    .then(() => {
      reflectionServer = server;
      const actualPort = (server as unknown as { port?: number }).port ?? desiredPort;
      console.log(
        `[genkit] Dev UI ready on http://localhost:${actualPort} (set GENKIT_DISABLE_DEV_UI=true to disable)`
      );
      return server;
    })
    .catch((err) => {
      console.warn('[genkit] Failed to start dev UI:', err);
      reflectionServer = null;
      reflectionServerPromise = null;
      return null;
    });

  return reflectionServerPromise;
}

export async function stopGenkitDevUi() {
  const server = reflectionServer;
  reflectionServer = null;
  reflectionServerPromise = null;
  if (server) {
    await server.stop();
  }
}
