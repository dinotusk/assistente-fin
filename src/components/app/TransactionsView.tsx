import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Search,
} from "lucide-react";

import { categoryColors, categoryIcons } from "@/lib/finance/constants";
import {
  expenseMatchesView,
  formatDate,
  normalizeText,
  ownerLabelForPeople,
  sum,
} from "@/lib/finance/calc";
import { useFinance, useMoney } from "@/lib/finance/FinanceContext";
import type { Expense } from "@/lib/finance/types";

import { TextInput } from "./forms";
import { StatusPill } from "./ui";

type FilterKey = "todos" | "entradas" | "saidas" | "apagar" | "pagos";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "todos", label: "Tudo" },
  { key: "entradas", label: "Entradas" },
  { key: "saidas", label: "Saídas" },
  { key: "apagar", label: "A pagar" },
  { key: "pagos", label: "Pagos" },
];

function matchesFilter(item: Expense, filter: FilterKey): boolean {
  if (filter === "entradas") return item.type === "income";
  if (filter === "saidas") return item.type !== "income";
  if (filter === "apagar") return item.status === "A pagar";
  if (filter === "pagos") return item.status === "Pago";
  return true;
}

export function TransactionsView({
  onEdit,
  onAdd,
}: {
  onEdit: (id: string) => void;
  onAdd: () => void;
}) {
  const { month, state, toggleExpenseStatus, deleteExpense, duplicateExpense } = useFinance();
  const money = useMoney();
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<FilterKey>("todos");

  const rows = useMemo(() => {
    const normalizedTerm = normalizeText(term);
    return month.expenses
      .filter((item) => {
        const text = normalizeText(
          `${item.name} ${item.category} ${item.note} ${item.paymentMethod} ${ownerLabelForPeople(item.owner, state.people)}`,
        );
        return (
          (!normalizedTerm || text.includes(normalizedTerm)) &&
          matchesFilter(item, filter) &&
          expenseMatchesView(item, state.activePerson, state.people)
        );
      })
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [month, term, filter, state.activePerson, state.people]);

  const incomeTotal = sum(rows.filter((item) => item.type === "income"));
  const expenseTotal = sum(rows.filter((item) => item.type !== "income"));
  const filtersActive = Boolean(term) || filter !== "todos";

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <TextInput
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar"
          aria-label="Buscar gasto, categoria, perfil ou pagamento"
          className="h-12 rounded-full !pl-11 text-sm"
        />
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
        {FILTERS.map((item) => {
          const active = filter === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`press focus-ring shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "border border-white/[0.14] bg-white/[0.05] text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="card-surface flex items-center gap-2.5 border-l-2 border-l-success/50 p-3">
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-success/16 text-success">
            <ArrowDownLeft className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <span className="block text-[11px] text-muted-foreground/80">Entradas</span>
            <strong className="tnum block text-[15px] font-bold text-foreground">
              {money(incomeTotal)}
            </strong>
          </div>
        </div>
        <div className="card-surface flex items-center gap-2.5 border-l-2 border-l-destructive/50 p-3">
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-destructive/16 text-destructive">
            <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <span className="block text-[11px] text-muted-foreground/80">Saídas</span>
            <strong className="tnum block text-[15px] font-bold text-foreground">
              {money(expenseTotal)}
            </strong>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        filtersActive ? (
          <p className="card-surface p-6 text-center text-sm text-muted-foreground">
            Nenhum gasto encontrado para esses filtros. Ajuste a busca ou altere os filtros para ver
            outros lançamentos.
          </p>
        ) : (
          <div className="card-surface flex flex-col items-center px-4 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft">
              <Receipt className="h-6 w-6 text-primary" strokeWidth={2} />
            </div>
            <h3 className="mt-4 text-sm font-bold text-foreground">Nenhum gasto neste mês</h3>
            <p className="mt-1 max-w-[26ch] text-[13px] text-muted-foreground">
              Registre o primeiro gasto para começar a acompanhar seu orçamento.
            </p>
            <button
              type="button"
              onClick={onAdd}
              className="press focus-ring mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-primary"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> Adicionar gasto
            </button>
          </div>
        )
      ) : (
        rows.map((item) => (
          <div
            key={item.id}
            className="card-surface hover-lift relative overflow-hidden py-3.5 pl-4 pr-3.5"
          >
            <span
              className="absolute inset-y-0 left-0 w-1"
              style={{ background: categoryColors[item.category] || "var(--color-primary)" }}
              aria-hidden="true"
            />
            <div className="flex items-start gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary"
                style={{ color: categoryColors[item.category] || "var(--color-primary)" }}
              >
                {(() => {
                  const Icon = categoryIcons[item.category] || categoryIcons.Outros;
                  return <Icon className="h-5 w-5" strokeWidth={2} />;
                })()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <strong className="min-w-0 truncate text-sm font-bold text-foreground">
                    {item.name}
                  </strong>
                  <strong className="tnum shrink-0 text-sm font-bold text-foreground">
                    {money(item.amount)}
                  </strong>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>{item.category}</span>
                  <span>·</span>
                  <span>{formatDate(item.date)}</span>
                  <span>·</span>
                  <span>{ownerLabelForPeople(item.owner, state.people)}</span>
                  <span>·</span>
                  <span>{item.paymentMethod}</span>
                </div>
                {item.note && (
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">{item.note}</p>
                )}
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => toggleExpenseStatus(item.id)}
                    className="press focus-ring rounded-full"
                  >
                    <StatusPill status={item.status} />
                  </button>
                  <div className="flex items-center gap-1">
                    <IconBtn onClick={() => onEdit(item.id)} label="Editar">
                      <Pencil className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn onClick={() => duplicateExpense(item.id)} label="Duplicar">
                      <Copy className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn onClick={() => deleteExpense(item.id)} label="Excluir" danger>
                      <Trash2 className="h-4 w-4" />
                    </IconBtn>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`press focus-ring flex h-9 w-9 items-center justify-center rounded-xl bg-secondary ${
        danger
          ? "text-destructive hover:bg-destructive/10"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
