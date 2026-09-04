import { MoreHorizontal, Paperclip, Pencil, Trash2, Repeat2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BpBox } from "@/shared/components/bp-box";
import { formatCurrency, formatDate } from "@/lib/format";
import type { TransactionWithCategory } from "../hooks/use-transactions";

interface TransactionTableProps {
  transactions: TransactionWithCategory[];
  currency: string;
  locale: string;
  isLoading: boolean;
  attachmentCounts?: Map<string, number>;
  onEdit: (tx: TransactionWithCategory) => void;
  onDelete: (tx: TransactionWithCategory) => void;
}

const colHead = "font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground";

export function TransactionTable({
  transactions,
  currency,
  locale,
  isLoading,
  attachmentCounts,
  onEdit,
  onDelete,
}: TransactionTableProps) {
  if (isLoading) {
    return (
      <BpBox>
        <Table>
          <TableHeader>
            <TableRow className="border-b border-foreground/20">
              {["Description", "Category", "Date", "Type", "Amount", ""].map((h) => (
                <TableHead key={h} className={colHead}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i} className="border-b border-foreground/8">
                {Array.from({ length: 6 }).map((__, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-3.5 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </BpBox>
    );
  }

  if (transactions.length === 0) {
    return (
      <BpBox>
        <Table>
          <TableHeader>
            <TableRow className="border-b border-foreground/20">
              <TableHead className={colHead}>Description</TableHead>
              <TableHead className={colHead}>Category</TableHead>
              <TableHead className={colHead}>Date</TableHead>
              <TableHead className={colHead}>Type</TableHead>
              <TableHead className={`${colHead} text-right`}>Amount</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={6} className="h-32 text-center font-mono text-[11px] text-muted-foreground/50 tracking-wider">
                No transactions found.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </BpBox>
    );
  }

  return (
    <BpBox>
      <Table>
        <TableHeader>
          <TableRow className="border-b border-foreground/20 hover:bg-transparent">
            <TableHead className={colHead}>Description</TableHead>
            <TableHead className={colHead}>Category</TableHead>
            <TableHead className={colHead}>Date</TableHead>
            <TableHead className={colHead}>Type</TableHead>
            <TableHead className={`${colHead} text-right`}>Amount</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((tx, idx) => (
            <TableRow
              key={tx.id}
              className="border-b border-foreground/8 hover:bg-muted/30 transition-colors duration-100 stagger-item"
              style={{ animationDelay: `${idx * 25}ms` } as React.CSSProperties}
            >
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{tx.description}</span>
                    {tx.isRecurring && (
                      <Repeat2 className="size-3 text-muted-foreground/40 shrink-0" />
                    )}
                    {(attachmentCounts?.get(tx.id) ?? 0) > 0 && (
                      <span className="flex items-center gap-0.5 font-mono text-[10px] text-muted-foreground/50 shrink-0">
                        <Paperclip className="size-3" />
                        {attachmentCounts!.get(tx.id)}
                      </span>
                    )}
                  </div>
                  {tx.notes && (
                    <span className="font-mono text-[10px] text-muted-foreground/50 truncate max-w-[200px]">
                      {tx.notes}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span
                    className="size-2 shrink-0"
                    style={{ backgroundColor: tx.categoryColor }}
                  />
                  <span className="text-sm text-muted-foreground">{tx.categoryName}</span>
                </div>
              </TableCell>
              <TableCell className="font-mono text-[11px] text-muted-foreground">
                {formatDate(tx.date, locale)}
              </TableCell>
              <TableCell>
                <span
                  className={`font-mono text-[10px] tracking-wider uppercase px-1.5 py-0.5 border ${
                    tx.type === "income"
                      ? "border-emerald-700/30 text-emerald-700 bg-emerald-50"
                      : "border-red-600/30 text-red-600 bg-red-50"
                  }`}
                >
                  {tx.type}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <span
                  className={`font-mono text-sm font-semibold tabular-nums ${
                    tx.type === "income" ? "text-emerald-700" : "text-red-600"
                  }`}
                >
                  {tx.type === "income" ? "+" : "−"}
                  {formatCurrency(tx.amount, currency, locale)}
                </span>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7 btn-press">
                      <MoreHorizontal className="size-3.5" />
                      <span className="sr-only">Actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="font-mono text-xs">
                    <DropdownMenuItem onClick={() => onEdit(tx)} className="gap-2">
                      <Pencil className="size-3" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(tx)}
                      className="gap-2 text-destructive focus:text-destructive"
                    >
                      <Trash2 className="size-3" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </BpBox>
  );
}
