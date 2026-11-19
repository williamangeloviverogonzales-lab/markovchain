export type NextWordCandidate = {
  word: string;
  count: number;
  prob: number;
};

export type MarkovChainModel = {
  order: number;        // 1, 2, or 3
  totalTokens: number;
  vocabSize: number;
  uniqueStates: number;
  transitions: Map<string, { total: number; nextCounts: Map<string, number> }>;
};

export type PredictionResult = {
  contextTokens: string[];
  hasEnoughContext: boolean;
  totalTransitions: number;
  candidates: NextWordCandidate[];
};

const KEY_SEP = "\u0000";

export function tokenizeText(rawText: string): string[] {
  return rawText.toLowerCase().match(/\b[\w']+\b/g) ?? [];
}

export function buildMarkovChain(rawText: string, order: number): MarkovChainModel {
  if (!Number.isInteger(order) || order < 1) {
    throw new Error("Context length (order) must be a positive integer.");
  }

  const tokens = tokenizeText(rawText);
  const vocab = new Set(tokens);
  const transitions = new Map<string, { total: number; nextCounts: Map<string, number> }>();

  for (let i = 0; i <= tokens.length - order - 1; i++) {
    const stateKey = tokens.slice(i, i + order).join(KEY_SEP);
    const nextWord = tokens[i + order];

    let stateEntry = transitions.get(stateKey);
    if (!stateEntry) {
      stateEntry = { total: 0, nextCounts: new Map<string, number>() };
      transitions.set(stateKey, stateEntry);
    }

    stateEntry.nextCounts.set(nextWord, (stateEntry.nextCounts.get(nextWord) ?? 0) + 1);
    stateEntry.total += 1;
  }

  return {
    order,
    totalTokens: tokens.length,
    vocabSize: vocab.size,
    uniqueStates: transitions.size,
    transitions,
  };
}

export function predictNextWordPmf(
  model: MarkovChainModel,
  inputText: string
): PredictionResult {
  const allInputTokens = tokenizeText(inputText);
  const contextTokens = allInputTokens.slice(-model.order);

  if (contextTokens.length < model.order) {
    return {
      contextTokens,
      hasEnoughContext: false,
      totalTransitions: 0,
      candidates: [],
    };
  }

  const stateKey = contextTokens.join(KEY_SEP);
  const stateEntry = model.transitions.get(stateKey);

  if (!stateEntry || stateEntry.total === 0) {
    return {
      contextTokens,
      hasEnoughContext: true,
      totalTransitions: 0,
      candidates: [],
    };
  }

  const candidates: NextWordCandidate[] = Array.from(stateEntry.nextCounts.entries())
    .map(([word, count]) => ({
      word,
      count,
      prob: count / stateEntry.total,
    }))
    .sort((a, b) => b.prob - a.prob || a.word.localeCompare(b.word));

  return {
    contextTokens,
    hasEnoughContext: true,
    totalTransitions: stateEntry.total,
    candidates,
  };
}

export type GenerationMode = "sample" | "greedy";

export type GenerationOutcome = {
  words: string[];
  text: string;
  stopReason: "max_steps" | "no_transition" | "insufficient_context";
};

function sampleFromCandidates(candidates: NextWordCandidate[]): NextWordCandidate {
  const r = Math.random();
  let cumulative = 0;

  for (const item of candidates) {
    cumulative += item.prob;
    if (r <= cumulative) {
      return item;
    }
  }

  return candidates[candidates.length - 1];
}

export function generateSequence(
  model: MarkovChainModel,
  seedText: string,
  maxNewWords = 12,
  mode: GenerationMode = "sample"
): GenerationOutcome {
  const seedTokens = tokenizeText(seedText);

  if (seedTokens.length === 0) {
    return {
      words: [],
      text: "",
      stopReason: "insufficient_context",
    };
  }

  const output = [...seedTokens];

  for (let step = 0; step < maxNewWords; step++) {
    const contextSlice = output.slice(-model.order);
    if (contextSlice.length < model.order) {
      return {
        words: output,
        text: output.join(" "),
        stopReason: "insufficient_context",
      };
    }

    const stateKey = contextSlice.join(KEY_SEP);
    const stateEntry = model.transitions.get(stateKey);

    if (!stateEntry || stateEntry.total === 0) {
      return {
        words: output,
        text: output.join(" "),
        stopReason: "no_transition",
      };
    }

    const candidates: NextWordCandidate[] = Array.from(stateEntry.nextCounts.entries())
      .map(([word, count]) => ({
        word,
        count,
        prob: count / stateEntry.total,
      }))
      .sort((a, b) => b.prob - a.prob || a.word.localeCompare(b.word));

    const chosen =
      mode === "greedy" ? candidates[0] : sampleFromCandidates(candidates);

    output.push(chosen.word);
  }

  return {
    words: output,
    text: output.join(" "),
    stopReason: "max_steps",
  };
}