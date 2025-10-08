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

const DEFAULT_MODEL_ORDER = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-exp'
];
const MODEL_CANDIDATES = parseModelCandidates(process.env.GOOGLE_GENAI_MODEL);
const TRANSIENT_RETRY_DELAY_MS = 30_000;
const LLM_SUGGESTION_TIMEOUT_MS = Number(process.env.LLM_SUGGESTION_TIMEOUT_MS ?? '10000');

let activeModelIndex = 0;
let cachedClient: GoogleGenerativeAI | null | undefined;
let cachedModel: GenerativeModel | null | undefined;
let cachedModelName: string | null = null;
let llmRetryAt: number | null = null;
let llmCooldownLogged = false;

function ensureModel(): { model: GenerativeModel | null; name: string | null } {
  if (llmRetryAt !== null) {
    const now = Date.now();
    if (now < llmRetryAt) {
      if (!llmCooldownLogged) {
        console.warn('[ai] Gemini temporarily disabled after recent errors', {
          retryInMs: llmRetryAt - now,
        });
        llmCooldownLogged = true;
      }
      return { model: null, name: null };
    }
    llmRetryAt = null;
    llmCooldownLogged = false;
  }

  const client = getApiClient();
  if (!client) {
    cachedModel = null;
    cachedModelName = null;
    return { model: null, name: null };
  }

  if (cachedModel !== undefined && cachedModelName !== null) {
    return { model: cachedModel, name: cachedModelName };
  }

  if (!MODEL_CANDIDATES.length || activeModelIndex >= MODEL_CANDIDATES.length) {
    cachedModel = null;
    cachedModelName = null;
    return { model: null, name: null };
  }

  const modelName = MODEL_CANDIDATES[activeModelIndex]!;
  cachedModel = client.getGenerativeModel({
    model: modelName,
    systemInstruction:
      'You are a Tic-Tac-Toe Twist strategist. Respond only with a compact JSON payload like {"move":{"r":0,"c":0},"reason":"..."}.',
  });
  cachedModelName = modelName;
  console.info('[ai] Using LLM model', { model: modelName });
  return { model: cachedModel, name: modelName };
}

function getApiClient(): GoogleGenerativeAI | null {
  if (cachedClient !== undefined) {
    return cachedClient;
  }
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    cachedClient = null;
    return cachedClient;
  }
  cachedClient = new GoogleGenerativeAI(apiKey);
  return cachedClient;
}

function resetModelCache() {
  cachedModel = undefined;
  cachedModelName = null;
}

function shouldSwitchModel(error: unknown): boolean {
  if (activeModelIndex >= MODEL_CANDIDATES.length - 1) {
    return false;
  }

  const status = getStatusCode(error);
  const message = toErrorMessage(error);
  const notFound = status === 404 || /not found/i.test(message);

  if (!notFound) {
    return false;
  }

  const previousModel = MODEL_CANDIDATES[activeModelIndex];
  activeModelIndex += 1;
  const nextModel = MODEL_CANDIDATES[activeModelIndex];
  resetModelCache();
  console.warn('[ai] Gemini model unavailable, switching to fallback', {
    previousModel,
    nextModel,
    status,
  });
  return true;
}

function getStatusCode(error: unknown): number | undefined {
  const candidate = error as { status?: unknown; statusCode?: unknown };
  const values = [candidate?.status, candidate?.statusCode];
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function isTransientStatus(status: number | undefined): boolean {
  if (status === undefined) {
    return true;
  }
  if (status >= 500) {
    return true;
  }
  return status === 429;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message ?? String(error);
  }
  return String(error);
}

function describeModelError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const output: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    const status = getStatusCode(error);
    if (status !== undefined) {
      output.status = status;
    }
    return output;
  }
  return { message: String(error) };
}

function parseModelCandidates(raw?: string | null): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const push = (value: string | null | undefined) => {
    if (!value) {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    candidates.push(trimmed);
  };

  if (typeof raw === 'string') {
    raw
      .split(/[\s,]+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .forEach((token) => push(token));
  }

  DEFAULT_MODEL_ORDER.forEach((model) => push(model));

  return candidates;
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

  const searchPlan = searchPlanForDifficulty(difficulty, state.board.length);
  const engineMoveRaw = searchBest(state, player, { depth: searchPlan.depth, maxMillis: searchPlan.maxMillis });
  const engineMove = toPlacement(engineMoveRaw);
  const engineScore = engineMove ? evaluatePlacement(state, engineMove, player) : Number.NEGATIVE_INFINITY;
  console.debug('[ai] Engine baseline computed', {
    depth: searchPlan.depth,
    maxMillis: searchPlan.maxMillis ?? null,
    engineMove,
    engineScore,
  });

  const suggestion = await getLlmSuggestion(state, placements, difficulty).catch((err) => {
    console.warn('[ai] LLM suggestion failed:', err);
    return { move: null } as LlmSuggestion;
  });
  const llmScore = suggestion.move ? evaluatePlacement(state, suggestion.move, player) : null;
  console.info('[ai] LLM suggestion result', {
    llmMove: suggestion.move,
    reason: suggestion.reason,
    score: llmScore,
  });

  const chosen = selectMove(
    state,
    player,
    placements,
    difficulty,
    engineMove,
    engineScore,
    suggestion.move,
    llmScore,
    searchPlan.llmTolerance
  );
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
  engineScore: number,
  llmMove: PlacementMove | null,
  llmScore: number | null,
  llmTolerance: number
): PlacementMove | null {
  switch (difficulty) {
    case 'sharp':
      return pickSharp(state, player, placements, engineMove, engineScore, llmMove, llmScore);
    case 'balanced':
      return pickBalanced(state, player, placements, engineMove, engineScore, llmMove, llmScore, llmTolerance);
    case 'chill':
    default:
      return pickChill(state, player, placements, engineMove, engineScore, llmMove, llmScore);
  }
}

function pickSharp(
  state: GameState,
  player: Player,
  placements: PlacementMove[],
  engineMove: PlacementMove | null,
  engineScore: number,
  llmMove: PlacementMove | null,
  llmScore: number | null
): PlacementMove | null {
  const legalLlm = llmMove && includesMove(placements, llmMove) ? llmMove : null;
  const legalEngine = engineMove && includesMove(placements, engineMove) ? engineMove : null;
  const llmValue = legalLlm && llmScore !== null ? llmScore : Number.NEGATIVE_INFINITY;
  const engineValue = legalEngine ? engineScore : Number.NEGATIVE_INFINITY;

  if (legalEngine && legalLlm) {
    return llmValue > engineValue ? legalLlm : legalEngine;
  }
  if (legalEngine) {
    return legalEngine;
  }
  if (legalLlm) {
    return legalLlm;
  }
  return bestByScore(state, player, placements);
}

function pickBalanced(
  state: GameState,
  player: Player,
  placements: PlacementMove[],
  engineMove: PlacementMove | null,
  engineScore: number,
  llmMove: PlacementMove | null,
  llmScore: number | null,
  llmTolerance: number
): PlacementMove | null {
  const legalLlm = llmMove && includesMove(placements, llmMove) ? llmMove : null;
  const legalEngine = engineMove && includesMove(placements, engineMove) ? engineMove : null;

  if (legalLlm && llmScore !== null) {
    if (!legalEngine || !Number.isFinite(engineScore)) {
      return legalLlm;
    }
    if (llmScore + llmTolerance >= engineScore) {
      return legalLlm;
    }
  }

  if (legalEngine) {
    return legalEngine;
  }

  if (legalLlm) {
    return legalLlm;
  }

  return bestByScore(state, player, placements);
}

function pickChill(
  state: GameState,
  player: Player,
  placements: PlacementMove[],
  engineMove: PlacementMove | null,
  engineScore: number,
  llmMove: PlacementMove | null,
  llmScore: number | null
): PlacementMove | null {
  void engineScore;
  void llmScore;
  const legalEngine = engineMove && includesMove(placements, engineMove) ? engineMove : null;
  const legalLlm = llmMove && includesMove(placements, llmMove) ? llmMove : null;
  const safeMoves = placements.filter((move) => evaluatePlacement(state, move, player) > -9000);
  const pool = safeMoves.length ? safeMoves : placements;
  if (legalLlm && includesMove(pool, legalLlm)) {
    if (Math.random() < 0.6) {
      return legalLlm;
    }
  }
  const earlyGame = state.moves.length <= 1;
  if (legalEngine) {
    if (!includesMove(pool, legalEngine)) {
      return legalEngine;
    }
    if (earlyGame || Math.random() < 0.65) {
      return legalEngine;
    }
  }
  const alternates = legalEngine ? pool.filter((m) => !movesEqual(m, legalEngine)) : pool;
  if (alternates.length) {
    return randomChoice(alternates);
  }
  return legalEngine ?? legalLlm ?? null;
}

interface SearchPlan {
  depth: number;
  maxMillis?: number;
  llmTolerance: number;
}

function searchPlanForDifficulty(difficulty: Difficulty, boardSize: number): SearchPlan {
  if (difficulty === 'sharp') {
    return {
      depth: boardSize === 3 ? 10 : 7,
      maxMillis: boardSize === 3 ? 450 : 600,
      llmTolerance: 60,
    };
  }
  if (difficulty === 'balanced') {
    return {
      depth: boardSize === 3 ? 6 : 5,
      maxMillis: boardSize === 3 ? 240 : 320,
      llmTolerance: 180,
    };
  }
  return { depth: boardSize === 3 ? 3 : 2, llmTolerance: 400 };
}

async function getLlmSuggestion(
  state: GameState,
  placements: PlacementMove[],
  difficulty: Difficulty
): Promise<LlmSuggestion> {
  if (difficulty === 'chill') {
    return { move: null };
  }
  const legalText = placements.map((m) => `(${m.r},${m.c})`).join(', ');
  const prompt = buildPrompt(state, legalText, difficulty);
  console.debug('[ai] Gemini prompt\n', prompt);

  while (true) {
    const { model, name } = ensureModel();
    if (!model || !name) {
      console.debug('[ai] LLM model unavailable; skipping suggestion');
      return { move: null };
    }

    console.info('[ai] Requesting LLM suggestion', {
      difficulty,
      placements: placements.length,
      model: name,
    });

    try {
      const result = await withTimeout(
        model.generateContent(prompt),
        LLM_SUGGESTION_TIMEOUT_MS,
        'LLM suggestion',
      );
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
    } catch (err) {
      if (shouldSwitchModel(err)) {
        continue;
      }

      const status = getStatusCode(err);
      const transient = isTransientStatus(status);
      console.warn(
        transient
          ? '[ai] LLM request failed; temporarily disabling Gemini'
          : '[ai] LLM request failed; disabling Gemini integration',
        {
          model: name,
          error: describeModelError(err),
          retryInMs: transient ? TRANSIENT_RETRY_DELAY_MS : undefined,
        }
      );
      resetModelCache();
      if (transient) {
        cachedClient = undefined;
        activeModelIndex = 0;
        llmRetryAt = Date.now() + TRANSIENT_RETRY_DELAY_MS;
        llmCooldownLogged = false;
      } else {
        cachedClient = null;
        activeModelIndex = MODEL_CANDIDATES.length;
        llmRetryAt = null;
        llmCooldownLogged = false;
      }
      return { move: null };
    }
  }
}

function buildPrompt(state: GameState, legalText: string, difficulty: Difficulty): string {
  const board = renderBoard(state);
  const difficultyNote =
    difficulty === 'sharp'
      ? 'Play optimally. Aim to win or force a draw when perfect play is possible.'
      : difficulty === 'balanced'
      ? 'Play strong, but a slightly creative alternative to perfect play is acceptable.'
      : 'Keep the game interesting and avoid obvious blunders, but variety is encouraged.';

  const config = state.config;
  const current = state.current;
  const opponent: Player = current === 'X' ? 'O' : 'X';

  const variantLines: string[] = [];
  if (config.gravity) {
    variantLines.push('Gravity: enabled - any piece you place drops to the lowest empty cell of that column.');
  }
  if (config.wrap) {
    variantLines.push('Wraparound: enabled - winning lines may continue across opposite board edges.');
  }
  if (config.misere) {
    variantLines.push('Misere: enabled - completing a win-length line causes an immediate loss instead of a win.');
  }
  if (config.randomBlocks && config.randomBlocks > 0) {
    variantLines.push(`Random blocks: ${config.randomBlocks} cells were blocked at game start and cannot be played on.`);
  }
  if (config.chaosMode) {
    variantLines.push('Chaos mode: enabled - this match may include randomly selected rule and power twists.');
  }

  const powerLines: string[] = [];
  const powers = state.powers ?? {
    doubleMove: { X: false, O: false },
    laneShift: { X: false, O: false },
    bomb: { X: false, O: false },
  };
  if (config.doubleMove) {
    const used = powers.doubleMove?.[current];
    powerLines.push(`Double Move (${used ? 'used' : 'unused'}): place two marks in one turn as long as both placements are legal.`);
  }
  const laneShiftEnabled = !!(config.laneShift ?? config.allowRowColShift);
  if (laneShiftEnabled) {
    const used = powers.laneShift?.[current];
    powerLines.push(`Lane Shift (${used ? 'used' : 'unused'}): shift an entire row or column by one cell in a cyclic fashion.`);
  }
  if (config.bomb) {
    const used = powers.bomb?.[current];
    powerLines.push(`Bomb (${used ? 'used' : 'unused'}): mark a cell as unusable for both players and remove any mark there.`);
  }

  const extraSections: string[] = [];
  if (variantLines.length) {
    extraSections.push(`Variant rules active:\n${variantLines.join('\n')}`);
  }
  if (powerLines.length) {
    extraSections.push(`One-time powers available to ${current} (AI):\n${powerLines.join('\n')}`);
  }
  const extraContext = extraSections.length ? `${extraSections.join('\n')}\n` : '';

  const movesPlayed = state.moves.length;

  return `You are the AI playing Tic-Tac-Toe Twist. Index rows and columns from 0.
You must play as ${current} on this turn. Place a single mark for ${current}; do not attempt to move or remove existing marks.
Opponent (human) is playing as ${opponent}.
Board size: ${state.board.length}x${state.board.length}
Win length: ${config.winLength}
Moves already played: ${movesPlayed}
Current board ('.' = empty, 'B' = blocked, 'F' = bombed):
${board}
Legal placements: ${legalText || 'none'}
${extraContext}${difficultyNote}
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${ms}ms`);
      (error as Error & { code?: string | number }).code = 'timeout';
      reject(error);
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
