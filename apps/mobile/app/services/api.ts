import { GameState, VariantConfig } from '@ttt/engine';

export type Difficulty = 'chill' | 'balanced' | 'sharp';

export interface MoveResponse {
  move: { r: number; c: number };
}

const DEFAULT_BASE_URL = 'http://10.0.2.2:9191';
let apiBaseUrl = globalThis?.process?.env?.API_BASE_URL ?? DEFAULT_BASE_URL;

export function getApiBaseUrl() {
  return apiBaseUrl;
}

export function setApiBaseUrl(url: string) {
  apiBaseUrl = url;
}

export interface MoveRequestBody {
  state: GameState;
  config: VariantConfig;
  difficulty: Difficulty;
}

export async function requestMove(body: MoveRequestBody): Promise<MoveResponse> {
  const response = await fetch(`${getApiBaseUrl()}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Move request failed (${response.status}): ${text}`);
  }

  return (await response.json()) as MoveResponse;
}
