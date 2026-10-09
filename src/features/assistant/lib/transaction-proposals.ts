import type { Category, Transaction, TransactionType } from "../../../types/index.js";
import { isIsoDate } from "../../../lib/dates.js";
import { formatDate } from "../../../lib/format.js";
import { ASSISTANT_LIMITS } from "../contract/limits.js";
import type { AddTransactionInput, DeleteTransactionInput, UpdateTransactionInput } from "../contract/types.js";
import { findCategory, inferType, scopeAllows, scopeError, unknownCategoryError, type Validation } from "./categories.js";
import { formatMoney, roundToCurrency, type MoneyFormat } from "./money.js";

export interface TransactionDraft {
  type: TransactionType;
  amount: number;
  categoryId: string;
  description: string;
  date: string;
  notes: string;
}

export type ChangedField = "amount" | "type" | "category" | "description" | "date" | "notes";

export interface FieldChange {
  field: ChangedField;
  label: string;
  before: string;
  after: string;
}

export interface AddProposal {
  kind: "add";
  draft: TransactionDraft;
  category: Category;
}
export interface UpdateProposal {
  kind: "update";
  before: Transaction;
  after: Transaction;
  changes: FieldChange[];
  category: Category;
}
export interface DeleteProposal {
  kind: "delete";
  transaction: Transaction;
  category: Category | undefined;
  attachmentCount: number;
}
export type TransactionProposal = AddProposal | UpdateProposal | DeleteProposal;

const NOT_FOUND = "Transaction not found. Use findTransactions to look it up first.";

function checkAmount(raw: number, money: MoneyFormat): Validation<number> {
  const amount = roundToCurrency(raw, money);
  if (!Number.isFinite(amount) || amount <= 0 || amount > ASSISTANT_LIMITS.maxAmount) {
    return {
      ok: false,
      error: `The amount must be more than 0 and at most ${formatMoney(ASSISTANT_LIMITS.maxAmount, money)}.`,
    };
  }
  return { ok: true, value: amount };
}

function checkText(raw: string, field: "description" | "notes"): Validation<string> {
  const value = raw.trim();
  const max = field === "description" ? ASSISTANT_LIMITS.descriptionMax : ASSISTANT_LIMITS.notesMax;
  if (field === "description" && value.length === 0) return { ok: false, error: "The description cannot be empty." };
  if (value.length > max) return { ok: false, error: `The ${field} can be at most ${max} characters.` };
  return { ok: true, value };
}

function resolveTyped(
  categoryName: string,
  requested: TransactionType | undefined,
  fallback: TransactionType | undefined,
  categories: readonly Category[],
): Validation<{ category: Category; type: TransactionType }> {
  const category = findCategory(categories, categoryName);
  if (category === undefined) return { ok: false, error: unknownCategoryError(categoryName, categories, requested) };
  const type = requested ?? (category.scope === "both" && fallback !== undefined ? fallback : inferType(category));
  if (!scopeAllows(category, type)) return { ok: false, error: scopeError(category, type, categories) };
  return { ok: true, value: { category, type } };
}

export function buildAddProposal(
  input: AddTransactionInput,
  ctx: { categories: readonly Category[]; today: string; money: MoneyFormat },
): Validation<AddProposal> {
  const amount = checkAmount(input.amount, ctx.money);
  if (!amount.ok) return amount;
  const description = checkText(input.description, "description");
  if (!description.ok) return description;
  const notes = checkText(input.notes ?? "", "notes");
  if (!notes.ok) return notes;
  const date = input.date ?? ctx.today;
  if (!isIsoDate(date)) return { ok: false, error: `"${date}" is not a real date. Use YYYY-MM-DD.` };
  const typed = resolveTyped(input.categoryName, input.type, undefined, ctx.categories);
  if (!typed.ok) return typed;
  return {
    ok: true,
    value: {
      kind: "add",
      category: typed.value.category,
      draft: {
        type: typed.value.type,
        amount: amount.value,
        categoryId: typed.value.category.id,
        description: description.value,
        date,
        notes: notes.value,
      },
    },
  };
}

interface ExistingCtx {
  categories: readonly Category[];
  seenIds: ReadonlySet<string>;
  workspaceId: string;
}

function checkExisting(id: string, found: Transaction | undefined, ctx: ExistingCtx): Validation<Transaction> {
  if (!ctx.seenIds.has(id) || found === undefined || found.id !== id || found.workspaceId !== ctx.workspaceId) {
    return { ok: false, error: NOT_FOUND };
  }
  return { ok: true, value: found };
}

export function buildUpdateProposal(
  input: UpdateTransactionInput,
  ctx: ExistingCtx & { before: Transaction | undefined; money: MoneyFormat },
): Validation<UpdateProposal> {
  const existing = checkExisting(input.transactionId, ctx.before, ctx);
  if (!existing.ok) return existing;
  const before = existing.value;
  const beforeCategory = ctx.categories.find((c) => c.id === before.categoryId);

  const amount =
    input.amount === undefined ? { ok: true as const, value: before.amount } : checkAmount(input.amount, ctx.money);
  if (!amount.ok) return amount;
  const description =
    input.description === undefined
      ? { ok: true as const, value: before.description }
      : checkText(input.description, "description");
  if (!description.ok) return description;
  const notes = input.notes === undefined ? { ok: true as const, value: before.notes } : checkText(input.notes, "notes");
  if (!notes.ok) return notes;
  const date = input.date ?? before.date;
  if (!isIsoDate(date.slice(0, 10))) return { ok: false, error: `"${date}" is not a real date. Use YYYY-MM-DD.` };

  let category: Category;
  let type: TransactionType;
  if (input.categoryName !== undefined) {
    const typed = resolveTyped(input.categoryName, input.type, before.type, ctx.categories);
    if (!typed.ok) return typed;
    category = typed.value.category;
    type = typed.value.type;
  } else {
    if (beforeCategory === undefined) {
      return { ok: false, error: "This transaction's category no longer exists. Name a category to move it to." };
    }
    category = beforeCategory;
    type = input.type ?? before.type;
    if (!scopeAllows(category, type)) return { ok: false, error: scopeError(category, type, ctx.categories) };
  }

  const after: Transaction = {
    ...before,
    amount: amount.value,
    description: description.value,
    notes: notes.value,
    date,
    type,
    categoryId: category.id,
  };
  const money = (v: number) => formatMoney(v, ctx.money);
  const date10 = (v: string) => formatDate(v, ctx.money.locale);
  const changes: FieldChange[] = [];
  if (after.amount !== before.amount) {
    changes.push({ field: "amount", label: "Amount", before: money(before.amount), after: money(after.amount) });
  }
  if (after.type !== before.type) changes.push({ field: "type", label: "Type", before: before.type, after: after.type });
  if (after.categoryId !== before.categoryId) {
    changes.push({ field: "category", label: "Category", before: beforeCategory?.name ?? "Uncategorized", after: category.name });
  }
  if (after.description !== before.description) {
    changes.push({ field: "description", label: "Description", before: before.description, after: after.description });
  }
  if (after.date !== before.date) {
    changes.push({ field: "date", label: "Date", before: date10(before.date), after: date10(after.date) });
  }
  if (after.notes !== before.notes) changes.push({ field: "notes", label: "Notes", before: before.notes, after: after.notes });
  if (changes.length === 0) return { ok: false, error: "No changes to make: the transaction already has those values." };

  return { ok: true, value: { kind: "update", before, after, changes, category } };
}

export function buildDeleteProposal(
  input: DeleteTransactionInput,
  ctx: ExistingCtx & { transaction: Transaction | undefined; attachmentCount: number },
): Validation<DeleteProposal> {
  const existing = checkExisting(input.transactionId, ctx.transaction, ctx);
  if (!existing.ok) return existing;
  return {
    ok: true,
    value: {
      kind: "delete",
      transaction: existing.value,
      category: ctx.categories.find((c) => c.id === existing.value.categoryId),
      attachmentCount: ctx.attachmentCount,
    },
  };
}
