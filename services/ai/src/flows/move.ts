import { z } from 'zod';
import type { GameState, VariantConfig, Difficulty, Move, Player } from '@ttt/engine';
import { applyMove, legalMoves, evaluate } from '@ttt/engine';
import { bestMove as searchBest } from '@ttt/engine';
import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';

export const MoveInput = z.object({
  state: z.any() as z.ZodType<GameState>,
  config: z.any() as z.ZodType<VariantConfig>,
  difficulty: z.enum(['chill', 'balanced', 'sharp']) as z.ZodType<Difficulty>,
});

export const MoveOutput = z.object({
  move: z.object({ r: z.number(), c: z.number() }),
  strategy: z.enum(['llm', 'engine', 'fallback']).optional(),
  reason: z.string().optional(),
});

type Strategy = 'llm' | 'engine' | 'fallback';
interface PlacementMove { r: number; c: number }
interface LlmSuggestion {
  move: PlacementMove | null;
  reason?: string;
}

const MODEL_NAME = process.env.GOOGLE_GENAI_MODEL ?? 'gemini-1.5-flash';
let cachedModel: GenerativeModel | null | undefined;

function ensureModel(): GenerativeModel | null {
  if (cachedModel !== undefined) {
    return cachedModel;
  }
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    cachedModel = null;
    return cachedModel;
  }
  const client = new GoogleGenerativeAI(apiKey);
  cachedModel = client.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction:
      'You are a Tic-Tac-Toe Twist strategist. Respond only with a compact JSON payload like {"move":{"r":0,"c":0},"reason":"..."}.',
  });
  return cachedModel;
}

export async function chooseMove(input: z.infer<typeof MoveInput>): Promise<z.infer<typeof MoveOutput>> {
  const { state, difficulty } = MoveInput.parse(input);
  const player = state.current as Player;
  const placements = getPlacementMoves(state);
  console.info('[ai] chooseMove received request', {
    difficulty,
    boardSize: state.board.length,
    current: player,
    placements: placements.length,
  });
  if (placements.length === 0) {
    console.warn('[ai] No legal placements available');
    return MoveOutput.parse({
      move: { r: 0, c: 0 },
      strategy: 'fallback',
      reason: 'No legal placements available.',
    });
  }

  const engineDepth = depthForDifficulty(difficulty, state.board.length);
  const engineMove = toPlacement(searchBest(state, player, { depth: engineDepth }));
  console.debug('[ai] Engine baseline computed', { depth: engineDepth, engineMove });

  const suggestion = await getLlmSuggestion(state, placements, difficulty).catch((err) => {
    console.warn('[ai] LLM suggestion failed:', err);
    return { move: null } as LlmSuggestion;
  });
  console.info('[ai] LLM suggestion result', {
    llmMove: suggestion.move,
    reason: suggestion.reason,
  });

  const chosen = selectMove(state, player, placements, difficulty, engineMove, suggestion.move);
  const selectedMove = chosen ?? engineMove ?? placements[0];
  const strategy = inferStrategy(selectedMove, engineMove, suggestion.move);
  const reason = strategy === 'llm' ? suggestion.reason : undefined;

  console.info('[ai] chooseMove returning', {
    selectedMove,
    strategy,
    reason,
  });

  return MoveOutput.parse({
    move: { r: selectedMove.r, c: selectedMove.c },
    strategy,
    reason,
  });
}

function selectMove(
  state: GameState,
  player: Player,
  placements: PlacementMove[],
  difficulty: Difficulty,
  engineMove: PlacementMove | null,
  llmMove: PlacementMove | null
): PlacementMove | null {
  switch (difficulty) {
    case 'sharp':
      return pickSharp(state, player, placements, engineMove, llmMove);
    case 'balanced':
      return pickBalanced(state, player, placements, engineMove, llmMove);
    case 'chill':
    default:
      return pickChill(state, player, placements, engineMove, llmMove);
  }
}

function pickSharp(
  state: GameState,
  player: Player,
  placements: PlacementMove[],
  engineMove: PlacementMove | null,
  llmMove: PlacementMove | null
): PlacementMove | null {
  const legalLlm = llmMove && includesMove(placements, llmMove) ? llmMove : null;
  const legalEngine = engineMove && includesMove(placements, engineMove) ? engineMove : null;
  if (legalEngine && legalLlm) {
    const engineScore = evaluatePlacement(state, legalEngine, player);
    const llmScore = evaluatePlacement(state, legalLlm, player);
    return llmScore > engineScore ? legalLlm : legalEngine;
  }
  return legalEngine ?? legalLlm ?? null;
}

function pickBalanced(
  state: GameState,
  player: Player,
  placements: PlacementMove[],
  engineMove: PlacementMove | null,
  llmMove: PlacementMove | null
): PlacementMove | null {
  const legalLlm = llmMove && includesMove(placements, llmMove) ? llmMove : null;
  if (legalLlm) {
    return legalLlm;
  }
  const legalEngine = engineMove && includesMove(placements, engineMove) ? engineMove : null;
  if (legalEngine) {
    return legalEngine;
  }
  return bestByScore(state, player, placements);
}

function pickChill(
  state: GameState,
  player: Player,
  placements: PlacementMove[],
  engineMove: PlacementMove | null,
  llmMove: PlacementMove | null
): PlacementMove | null {
  const legalEngine = engineMove && includesMove(placements, engineMove) ? engineMove : null;
  const legalLlm = llmMove && includesMove(placements, llmMove) ? llmMove : null;
  const safeMoves = placements.filter((move) => evaluatePlacement(state, move, player) > -9000);
  const pool = safeMoves.length ? safeMoves : placements;
  if (legalLlm && includesMove(pool, legalLlm)) {
    if (Math.random() < 0.6) {
      return legalLlm;
    }
  }
  const alternates = legalEngine ? pool.filter((m) => !movesEqual(m, legalEngine)) : pool;
  if (alternates.length) {
    return randomChoice(alternates);
  }
  return legalEngine ?? legalLlm ?? null;
}

function depthForDifficulty(difficulty: Difficulty, boardSize: number): number {
  if (difficulty === 'sharp') {
    return boardSize === 3 ? 8 : 6;
  }
  if (difficulty === 'balanced') {
    return boardSize === 3 ? 5 : 4;
  }
  return 2;
}

async function getLlmSuggestion(
  state: GameState,
  placements: PlacementMove[],
  difficulty: Difficulty
): Promise<LlmSuggestion> {
  const model = ensureModel();
  if (!model) {
    console.debug('[ai] LLM model unavailable; skipping suggestion');
    return { move: null };
  }
  console.info('[ai] Requesting LLM suggestion', {
    difficulty,
    placements: placements.length,
  });
  const legalText = placements.map((m) => `(${m.r},${m.c})`).join(', ');
  const prompt = buildPrompt(state, legalText, difficulty);
  const result = await model.generateContent(prompt);
  const text = result.response?.text();
  if (!text) {
    console.warn('[ai] LLM returned empty response');
    return { move: null };
  }
  const parsed = parseSuggestionJson(text);
  if (!parsed) {
    console.warn('[ai] Failed to parse LLM suggestion', text.trim());
    return { move: null, reason: text.trim() };
  }
  const candidate = sanitizePlacement(parsed.move, state.board.length);
  if (!candidate) {
    console.warn('[ai] LLM suggested out-of-bounds move', parsed.move);
    return { move: null, reason: parsed.reason };
  }
  return {
    move: candidate,
    reason: parsed.reason,
  };
}

function buildPrompt(state: GameState, legalText: string, difficulty: Difficulty): string {
  const board = renderBoard(state);
  const difficultyNote =
    difficulty === 'sharp'
      ? 'Play optimally. Aim to win or force a draw when perfect play is possible.'
      : difficulty === 'balanced'
      ? 'Play strong, but a slightly creative alternative to perfect play is acceptable.'
      : 'Keep the game interesting and avoid obvious blunders, but variety is encouraged.';
  return `You are choosing a move for Tic-Tac-Toe Twist. Index rows and columns from 0.
Board size: ${state.board.length}x${state.board.length}
Win length: ${state.config.winLength}
Current player: ${state.current}
Board:
${board}
Legal placements: ${legalText || 'none'}
${difficultyNote}
Respond with a single JSON object like {"move":{"r":number,"c":number},"reason":"short explanation"}.`;
}

function parseSuggestionJson(raw: string): { move: any; reason?: string } | null {
  const json = extractJson(raw);
  if (!json) {
    return null;
  }
  if (typeof json.r === 'number' && typeof json.c === 'number') {
    return { move: { r: json.r, c: json.c }, reason: json.reason ?? json.explanation };
  }
  if (json.move && typeof json.move.r === 'number' && typeof json.move.c === 'number') {
    return { move: json.move, reason: json.reason ?? json.explanation };
  }
  return null;
}

function extractJson(raw: string): any | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  const snippet = raw.slice(start, end + 1);
  try {
    return JSON.parse(snippet);
  } catch {
    try {
      return JSON.parse(snippet.replace(/'/g, '"'));
    } catch {
      return null;
    }
  }
}

function sanitizePlacement(value: any, boardSize: number): PlacementMove | null {
  if (!value) {
    return null;
  }
  const r = Number(value.r);
  const c = Number(value.c);
  if (!Number.isFinite(r) || !Number.isFinite(c)) {
    return null;
  }
  const rr = Math.floor(r);
  const cc = Math.floor(c);
  if (rr < 0 || cc < 0 || rr >= boardSize || cc >= boardSize) {
    return null;
  }
  return { r: rr, c: cc };
}

function getPlacementMoves(state: GameState): PlacementMove[] {
  return legalMoves(state)
    .filter((move) => typeof move.r === 'number' && typeof move.c === 'number')
    .map((move) => ({ r: move.r as number, c: move.c as number }));
}

function toPlacement(move: Move | null | undefined): PlacementMove | null {
  if (!move || typeof move.r !== 'number' || typeof move.c !== 'number') {
    return null;
  }
  return { r: move.r, c: move.c };
}

function inferStrategy(
  chosen: PlacementMove | null,
  engineMove: PlacementMove | null,
  llmMove: PlacementMove | null
): Strategy {
  if (chosen && llmMove && movesEqual(chosen, llmMove)) {
    return 'llm';
  }
  if (chosen && engineMove && movesEqual(chosen, engineMove)) {
    return 'engine';
  }
  return 'fallback';
}

function evaluatePlacement(state: GameState, move: PlacementMove, player: Player): number {
  try {
    const nextState = applyMove(state, { r: move.r, c: move.c });
    return evaluate(nextState, player);
  } catch {
    return -Infinity;
  }
}

function bestByScore(state: GameState, player: Player, moves: PlacementMove[]): PlacementMove | null {
  let best: PlacementMove | null = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const score = evaluatePlacement(state, move, player);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

function includesMove(list: PlacementMove[], move: PlacementMove): boolean {
  return list.some((item) => movesEqual(item, move));
}

function movesEqual(a: PlacementMove | null, b: PlacementMove | null): boolean {
  return !!a && !!b && a.r === b.r && a.c === b.c;
}

function randomChoice<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function renderBoard(state: GameState): string {
  return state.board
    .map((row) => row.map((cell) => (cell === null ? '.' : cell)).join(' '))
    .join('\n');
}
