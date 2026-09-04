import type { Category, Transaction, TransactionType } from "@/types";

// Scoring constants — tune to change inference behavior.
const NAME_MATCH_SCORE = 3;
const HISTORY_HIT_CAP = 5;
const MIN_TOKEN_LENGTH = 3;
const MIN_WINNING_SCORE = 1;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "was", "were",
  "had", "has", "have", "are", "you", "her", "his", "its", "our",
  "per", "via", "off", "out", "new", "got", "buy", "pay", "paid",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(t));
}

export interface InferenceResult {
  category: Category | null;
  /** True when no signal matched and we fell back to a default category. */
  guessed: boolean;
  /** The scope of the winning category, used to flip type when not explicit. */
  inferredType: TransactionType | null;
}

interface KeywordIndex {
  /** token -> categoryId -> occurrence count across transaction history */
  tokenCounts: Map<string, Map<string, number>>;
  /** categoryId -> most recent transaction date (tie-breaking) */
  lastUsed: Map<string, string>;
}

export function buildKeywordIndex(transactions: Transaction[]): KeywordIndex {
  const tokenCounts = new Map<string, Map<string, number>>();
  const lastUsed = new Map<string, string>();

  for (const tx of transactions) {
    const prev = lastUsed.get(tx.categoryId);
    if (!prev || tx.date > prev) lastUsed.set(tx.categoryId, tx.date);

    for (const token of tokenize(tx.description)) {
      let perCategory = tokenCounts.get(token);
      if (!perCategory) {
        perCategory = new Map();
        tokenCounts.set(token, perCategory);
      }
      perCategory.set(tx.categoryId, (perCategory.get(tx.categoryId) ?? 0) + 1);
    }
  }

  return { tokenCounts, lastUsed };
}

function nameMatches(token: string, categoryName: string): boolean {
  for (const word of tokenize(categoryName)) {
    if (word.startsWith(token) || token.startsWith(word)) return true;
  }
  return false;
}

export function inferCategory(
  description: string,
  categories: Category[],
  index: KeywordIndex,
  explicitType: TransactionType | null
): InferenceResult {
  const tokens = tokenize(description);

  // When the type was typed explicitly, only consider compatible categories.
  const candidates = explicitType
    ? categories.filter((c) => c.scope === explicitType || c.scope === "both")
    : categories;

  let best: Category | null = null;
  let bestScore = 0;

  for (const category of candidates) {
    let score = 0;
    for (const token of tokens) {
      if (nameMatches(token, category.name)) score += NAME_MATCH_SCORE;
      const historyCount = index.tokenCounts.get(token)?.get(category.id) ?? 0;
      score += Math.min(historyCount, HISTORY_HIT_CAP);
    }
    if (score > bestScore) {
      best = category;
      bestScore = score;
    } else if (score === bestScore && score > 0 && best) {
      const bestLast = index.lastUsed.get(best.id) ?? "";
      const thisLast = index.lastUsed.get(category.id) ?? "";
      if (thisLast > bestLast) best = category;
    }
  }

  if (best && bestScore >= MIN_WINNING_SCORE) {
    const inferredType: TransactionType | null =
      best.scope === "income" ? "income" : best.scope === "expense" ? "expense" : null;
    return { category: best, guessed: false, inferredType };
  }

  // Fallback: the workspace's default "Other ..." category for the type.
  const type = explicitType ?? "expense";
  const fallback =
    candidates.find(
      (c) => (c.scope === type || c.scope === "both") && c.name.toLowerCase().startsWith("other")
    ) ?? candidates.find((c) => c.scope === type || c.scope === "both") ?? null;

  return { category: fallback, guessed: true, inferredType: null };
}
