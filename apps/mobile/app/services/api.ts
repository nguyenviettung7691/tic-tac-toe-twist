
import { GameState, VariantConfig } from '@ttt/engine';
import { Device } from '@nativescript/core';

export type Difficulty = 'chill' | 'balanced' | 'sharp';

export interface MoveResponse {
  move: { r: number; c: number };
  strategy?: 'llm' | 'engine' | 'fallback';
  reason?: string;
}

export interface MoveRequestBody {
  state: GameState;
  config: VariantConfig;
  difficulty: Difficulty;
}

const DEFAULT_PORT = resolvePort();
const DEFAULT_BASE_URL = resolveDefaultBaseUrl();
const ENV_CONFIGURED_BASE_URL = readEnvBaseUrl();
const MOVE_TIMEOUT_MS = 7000;
const FIRST_MOVE_TIMEOUT_MS = 15000;

let configuredBaseUrl = ENV_CONFIGURED_BASE_URL ?? DEFAULT_BASE_URL;
let resolvedBaseUrl: string | null = null;
let resolvingBaseUrlPromise: Promise<string> | null = null;
let warmupPromise: Promise<void> | null = null;
let hasIssuedMoveRequest = false;

export function getApiBaseUrl() {
  return resolvedBaseUrl ?? configuredBaseUrl;
}

export function setApiBaseUrl(url: string) {
  configuredBaseUrl = normalizeBaseUrl(url);
  resolvedBaseUrl = null;
  resolvingBaseUrlPromise = null;
  hasIssuedMoveRequest = false;
}

export async function requestMove(body: MoveRequestBody): Promise<MoveResponse> {
  const baseUrl = await ensureBaseUrl();
  const timeoutMs = hasIssuedMoveRequest ? MOVE_TIMEOUT_MS : FIRST_MOVE_TIMEOUT_MS;
  hasIssuedMoveRequest = true;
  const response = await fetchWithTimeout(
    `${baseUrl}/move`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Move request failed (${response.status}): ${text}`);
  }

  return (await response.json()) as MoveResponse;
}

export function warmupAiService(): Promise<void> {
  if (resolvedBaseUrl) {
    return Promise.resolve();
  }
  if (!warmupPromise) {
    warmupPromise = ensureBaseUrl()
      .then(() => undefined)
      .catch((err) => {
        console.warn('[ai] Warmup failed', describeProbeError(err));
        throw err;
      })
      .finally(() => {
        warmupPromise = null;
      });
  }
  return warmupPromise;
}

function resolvePort(): number {
  const raw = (globalThis?.process?.env?.API_PORT ?? '').toString();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 9191;
}

function readEnvBaseUrl(): string | null {
  const envValue =
    (globalThis?.process?.env?.API_BASE_URL as string | undefined) ??
    (globalThis as Record<string, unknown>)?.API_BASE_URL;
  if (typeof envValue === 'string' && envValue.trim().length > 0) {
    return normalizeBaseUrl(envValue);
  }
  return null;
}

function resolveDefaultBaseUrl(): string {
  const platform = Device?.os?.toLowerCase?.() ?? '';
  if (platform === 'ios') {
    return normalizeBaseUrl(`http://127.0.0.1:${DEFAULT_PORT}`);
  }
  if (platform === 'android') {
    return normalizeBaseUrl(`http://10.0.2.2:${DEFAULT_PORT}`);
  }
  return normalizeBaseUrl(`http://localhost:${DEFAULT_PORT}`);
}

async function ensureBaseUrl(): Promise<string> {
  if (resolvedBaseUrl) {
    return resolvedBaseUrl;
  }

  if (!resolvingBaseUrlPromise) {
    resolvingBaseUrlPromise = probeBaseUrls()
      .then((baseUrl) => {
        resolvedBaseUrl = baseUrl;
        return baseUrl;
      })
      .catch((err) => {
        resolvedBaseUrl = null;
        throw err;
      })
      .finally(() => {
        resolvingBaseUrlPromise = null;
      });
  }

  return resolvingBaseUrlPromise;
}

async function probeBaseUrls(): Promise<string> {
  const candidates = collectCandidateBaseUrls();
  const attemptErrors: Record<string, unknown> = {};

  for (const baseUrl of candidates) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/health`, { method: 'GET' }, 1500);
      if (response.ok) {
        console.info('[ai] Connected to Genkit service', { baseUrl });
        return baseUrl;
      }
      attemptErrors[baseUrl] = `HTTP ${response.status}`;
    } catch (err) {
      attemptErrors[baseUrl] = describeProbeError(err);
    }
  }

  console.error('[ai] Failed to reach Genkit service', {
    candidates,
    errors: attemptErrors,
  });

  const error = new Error('Unable to reach Genkit AI service.');
  const enrichedError = error as Error & {
    candidates?: string[];
    errors?: Record<string, unknown>;
  };
  enrichedError.candidates = candidates;
  enrichedError.errors = attemptErrors;
  throw error;
}

function collectCandidateBaseUrls(): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  const push = (value: string | null | undefined) => {
    if (!value) {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    const normalized = normalizeBaseUrl(trimmed);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      candidates.push(normalized);
    }
  };

  push(configuredBaseUrl);
  push(DEFAULT_BASE_URL);

  const platform = Device?.os?.toLowerCase?.() ?? '';
  if (platform === 'android') {
    push(`http://10.0.2.2:${DEFAULT_PORT}`);
    push(`http://10.0.3.2:${DEFAULT_PORT}`);
    push(`http://127.0.0.1:${DEFAULT_PORT}`);
  } else if (platform === 'ios') {
    push(`http://127.0.0.1:${DEFAULT_PORT}`);
  }

  push(`http://localhost:${DEFAULT_PORT}`);

  return candidates;
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
    if (!url.port) {
      url.port = `${DEFAULT_PORT}`;
    }
    url.pathname = '';
    url.search = '';
    url.hash = '';
    let normalized = url.toString();
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch (_err) {
    return trimmed;
  }
}

function fetchWithTimeout(input: RequestInfo, init: RequestInit, timeoutMs: number) {
  return new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Request to ${typeof input === 'string' ? input : 'url'} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    fetch(input, init)
      .then((response) => {
        clearTimeout(timer);
        resolve(response);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function describeProbeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return { message: String(error) };
}
