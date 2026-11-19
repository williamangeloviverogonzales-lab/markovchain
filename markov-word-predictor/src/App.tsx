import { useEffect, useMemo, useState } from "react";
import {
  buildMarkovChain,
  generateSequence,
  predictNextWordPmf,
  type GenerationMode,
} from "./lib/markov";

type CorpusOption = {
  id: string;
  label: string;
  path: string;
};

const CORPORA: CorpusOption[] = [
  { id: "preamble", label: "PH Preamble (Short)", path: "/corpora/preamble.txt" },
  { id: "taylor", label: "Taylor Swift Lyrics", path: "/corpora/taylor_swift.txt" },
  { id: "sherlock", label: "Sherlock Holmes", path: "/corpora/sherlock.txt" },
  { id: "bible", label: "The Bible", path: "/corpora/bible.txt" },
];

const CONTEXT_ORDERS = [1, 2, 3] as const;

export default function App() {
  // 1. State hooks
  const [selectedCorpusId, setSelectedCorpusId] = useState<string>(CORPORA[0].id);
  const [order, setOrder] = useState<1 | 2 | 3>(1);
  const [inputText, setInputText] = useState<string>("");
  const [corpusText, setCorpusText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Sentence generator state
  const [genMode, setGenMode] = useState<GenerationMode>("sample");
  const [maxWords, setMaxWords] = useState<number>(12);
  const [generatedText, setGeneratedText] = useState<string>("");
  const [stopReason, setStopReason] = useState<string>("");

  const activeCorpus =
    CORPORA.find((c) => c.id === selectedCorpusId) ?? CORPORA[0];

  // 2. Load selected .txt corpus
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(activeCorpus.path)
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load ${activeCorpus.path}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) {
          setCorpusText(text);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load corpus.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeCorpus.path]);

  // 3. Build Markov chain & compute next-word PMF
  const model = useMemo(() => {
    if (!corpusText) return null;
    return buildMarkovChain(corpusText, order);
  }, [corpusText, order]);

  const prediction = useMemo(() => {
    if (!model) {
      return {
        contextTokens: [],
        hasEnoughContext: false,
        totalTransitions: 0,
        candidates: [],
      };
    }
    return predictNextWordPmf(model, inputText);
  }, [model, inputText]);

  // 4. Event handlers
  const handleAppendWord = (word: string) => {
    const trimmed = inputText.trimEnd();
    setInputText(trimmed ? `${trimmed} ${word} ` : `${word} `);
  };

  const handleGenerate = () => {
    if (!model) return;
    const result = generateSequence(model, inputText, maxWords, genMode);
    setGeneratedText(result.text);

    if (result.stopReason === "insufficient_context") {
      setStopReason(`Enter at least ${order} starting word(s) first.`);
    } else if (result.stopReason === "no_transition") {
      setStopReason("Stopped early: reached a state with no outgoing transitions.");
    } else {
      setStopReason(`Generated ${maxWords} step(s) using ${genMode} mode.`);
    }
  };

  // 5. Render UI
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 font-sans text-slate-900">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Markov Next-Word Predictor (k-Word Context)
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Choose a text corpus and how many previous words (k = 1, 2, 3) define the current state.
        </p>
      </header>

      <section className="mb-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Corpus (.txt)
          </label>
          <select
            value={selectedCorpusId}
            onChange={(e) => setSelectedCorpusId(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
          >
            {CORPORA.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Context Window (Previous Words)
          </span>
          <div className="mt-1.5 flex gap-2">
            {CONTEXT_ORDERS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setOrder(k)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  order === k
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {k} {k === 1 ? "Word" : "Words"}
              </button>
            ))}
          </div>
        </div>
      </section>

      {model && !loading && (
        <div className="mb-6 flex flex-wrap gap-4 rounded-lg bg-slate-100 px-4 py-2.5 text-xs text-slate-700">
          <span>
            <strong>Tokens:</strong> {model.totalTokens.toLocaleString()}
          </span>
          <span>
            <strong>Vocabulary:</strong> {model.vocabSize.toLocaleString()}
          </span>
          <span>
            <strong>Unique {order}-word states:</strong> {model.uniqueStates.toLocaleString()}
          </span>
        </div>
      )}

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label
          htmlFor="word-input"
          className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Type Your Phrase / Word(s)
        </label>
        <input
          id="word-input"
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={
            order === 1
              ? "Type a word, e.g., we"
              : `Type at least ${order} words...`
          }
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-indigo-500 focus:outline-none"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="font-medium">Active {order}-word state:</span>
          {prediction.contextTokens.length > 0 ? (
            <code className="rounded bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">
              ({prediction.contextTokens.join(", ")})
            </code>
          ) : (
            <span className="italic text-slate-400">none yet</span>
          )}
        </div>
      </section>

      {loading && <p className="text-sm text-slate-500">Loading and indexing corpus...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Possible Next Words & Conditional Probabilities
              </h2>
              {prediction.totalTransitions > 0 && (
                <span className="text-xs text-slate-500">
                  Observed transitions: {prediction.totalTransitions}
                </span>
              )}
            </div>

            {!prediction.hasEnoughContext ? (
              <p className="text-sm text-slate-500">
                Enter at least <strong>{order}</strong>{" "}
                {order === 1 ? "word" : "words"} to form a {order}-word Markov state.
              </p>
            ) : prediction.candidates.length === 0 ? (
              <p className="text-sm text-amber-700">
                No observed transitions for{" "}
                <code>({prediction.contextTokens.join(", ")})</code> in{" "}
                <strong>{activeCorpus.label}</strong>. Try another phrase or lower the word count.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                      <th className="py-2 pr-4">Next Word</th>
                      <th className="py-2 px-4">Count</th>
                      <th className="py-2 px-4">Probability</th>
                      <th className="py-2 pl-4">Distribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prediction.candidates.map((item) => (
                      <tr
                        key={item.word}
                        className="border-b border-slate-100 hover:bg-slate-50"
                      >
                        <td className="py-2 pr-4 font-medium">
                          <button
                            type="button"
                            onClick={() => handleAppendWord(item.word)}
                            title="Click to append this word"
                            className="rounded px-1.5 py-0.5 text-indigo-700 hover:bg-indigo-50"
                          >
                            {item.word}
                          </button>
                        </td>
                        <td className="py-2 px-4 text-slate-600">
                          {item.count} / {prediction.totalTransitions}
                        </td>
                        <td className="py-2 px-4 font-mono text-slate-800">
                          {item.prob.toFixed(4)}
                        </td>
                        <td className="py-2 pl-4">
                          <div className="h-2.5 w-36 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-indigo-500"
                              style={{ width: `${Math.max(item.prob * 100, 2)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Construct a Sequence from the Chain</h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={genMode}
                  onChange={(e) => setGenMode(e.target.value as GenerationMode)}
                  className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-sm"
                >
                  <option value="sample">Random Sampling</option>
                  <option value="greedy">Greedy (Top-1)</option>
                </select>

                <select
                  value={maxWords}
                  onChange={(e) => setMaxWords(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-sm"
                >
                  <option value={8}>8 words</option>
                  <option value={12}>12 words</option>
                  <option value={20}>20 words</option>
                </select>

                <button
                  type="button"
                  onClick={handleGenerate}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Generate
                </button>
              </div>
            </div>

            {generatedText && (
              <div className="mt-3 rounded-lg bg-slate-50 p-3">
                <p className="text-base leading-relaxed text-slate-900">{generatedText}</p>
                <p className="mt-1.5 text-xs text-slate-500">{stopReason}</p>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}