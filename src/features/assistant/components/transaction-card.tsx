import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BpBox } from "@/shared/components/bp-box";
import type { TransactionType } from "@/types";
import { formatMoney, type MoneyFormat } from "../lib/money";
import { WRITE_CARD_TITLES, type ToolRowState } from "../lib/tool-labels";
import type { ProposalEntry } from "../state/tool-runner";

const OUTCOME: Record<Exclude<ToolRowState, "running">, string> = {
  done: "Confirmed",
  cancelled: "Cancelled",
  error: "Not saved",
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground/60">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm">{children}</dd>
    </div>
  );
}

function Amount({ amount, type, money }: { amount: number; type: TransactionType; money: MoneyFormat }) {
  return (
    <span className={cn("font-mono tabular-nums font-semibold", type === "income" ? "text-emerald-700" : "text-red-600")}>
      {formatMoney(amount, money)}
    </span>
  );
}

function CategoryName({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 shrink-0" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}

interface TransactionCardProps {
  entry: ProposalEntry;
  state: ToolRowState;
  resolving: boolean;
  money: MoneyFormat;
  onConfirm: () => void;
  onCancel: () => void;
}

export function TransactionCard({ entry, state, resolving, money, onConfirm, onCancel }: TransactionCardProps) {
  const titleId = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const { proposal } = entry;

  // A card waiting on the user must not sit below the fold.
  useEffect(() => {
    if (state !== "running") return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    groupRef.current?.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }, [state]);
  const outcome = state === "running" ? null : OUTCOME[state];

  return (
    <BpBox noMarks>
      <div ref={groupRef} role="group" aria-labelledby={titleId}>
        <div className="flex items-baseline justify-between border-b border-border/40 px-4 py-2">
          <span id={titleId} className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
            {WRITE_CARD_TITLES[entry.tool]}
          </span>
          {outcome !== null && (
            <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground/60">{outcome}</span>
          )}
        </div>
        <dl className="flex flex-col gap-1.5 px-4 py-3">
          {proposal.kind === "add" && (
            <>
              <Row label="Amount">
                <Amount amount={proposal.draft.amount} type={proposal.draft.type} money={money} />
              </Row>
              <Row label="Type">{proposal.draft.type}</Row>
              <Row label="Category">
                <CategoryName name={proposal.category.name} color={proposal.category.color} />
              </Row>
              <Row label="Description">{proposal.draft.description}</Row>
              <Row label="Date">{formatDate(proposal.draft.date, money.locale)}</Row>
              {proposal.draft.notes.length > 0 && <Row label="Notes">{proposal.draft.notes}</Row>}
            </>
          )}
          {proposal.kind === "update" &&
            proposal.changes.map((change) => (
              <Row key={change.field} label={change.label}>
                <span className="font-mono tabular-nums">
                  {change.before} → {change.after}
                </span>
              </Row>
            ))}
          {proposal.kind === "delete" && (
            <>
              <Row label="Amount">
                <Amount amount={proposal.transaction.amount} type={proposal.transaction.type} money={money} />
              </Row>
              <Row label="Category">
                {proposal.category === undefined ? (
                  "Uncategorized"
                ) : (
                  <CategoryName name={proposal.category.name} color={proposal.category.color} />
                )}
              </Row>
              <Row label="Description">{proposal.transaction.description}</Row>
              <Row label="Date">{formatDate(proposal.transaction.date, money.locale)}</Row>
              {proposal.attachmentCount > 0 && (
                <p className="font-mono text-[10px] tracking-wider text-destructive">
                  Also deletes {proposal.attachmentCount} {proposal.attachmentCount === 1 ? "receipt" : "receipts"}
                </p>
              )}
            </>
          )}
        </dl>
        {state === "running" && (
          <div className="flex justify-end gap-2 border-t border-border/40 px-4 py-2">
            <Button
              size="sm"
              variant={proposal.kind === "delete" ? "destructive" : "default"}
              onClick={onConfirm}
              disabled={resolving}
            >
              Confirm
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel} disabled={resolving}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </BpBox>
  );
}
