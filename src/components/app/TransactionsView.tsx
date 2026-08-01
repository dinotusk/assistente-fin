import { useMemo, useState } from "react";
import { Copy, Pencil, Trash2, Search } from "lucide-react";

import { categories, categoryIcons } from "@/lib/finance/constants";
import { categoryLabel, expenseMatchesView, formatDate, money, ownerLabelForPeople } from "@/lib/finance/calc";
import { useFinance } from "@/lib/finance/FinanceContext";

import { SelectInput, TextInput } from "./forms";
import { StatusPill } from "./ui";

export function TransactionsView({ onEdit }: { onEdit: (id: string) => void }) {
  const { month, state, toggleExpenseStatus, deleteExpense, duplicateExpense } = useFinance();
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("todos");
  const [status, setStatus] = useState("todos");

  const rows = useMemo(() => {
    return month.expenses
      .filter((item) => {
        const text = `${item.name} ${item.category} ${item.note} ${item.paymentMethod}`.toLowerCase();
        return (
          (!term || text.includes(term.toLowerCase())) &&
          (category === "todos" || item.category === category) &&
          (status === "todos" || item.status === status) &&
          expenseMatchesView(item, state.activePerson)
        );
      })
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [month, term, category, status, state.activePerson]);

  return (
    <div className="flex flex-col gap-3">
      <div className="card-surface flex flex-col gap-2.5 p-3.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <TextInput
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Buscar gasto ou categoria"
            aria-label="Buscar gasto ou categoria"
            className="!pl-10 text-sm"
            style={{ paddingLeft: "2.5rem" }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <SelectInput
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filtrar por categoria"
            className="text-sm"
          >
            <option value="todos">Todas categorias</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filtrar por status"
            className="text-sm"
          >
            <option value="todos">Todos status</option>
            <option value="A pagar">A pagar</option>
            <option value="Pago">Pago</option>
          </SelectInput>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="card-surface p-6 text-center text-sm text-muted-foreground">Nenhum gasto encontrado.</p>
      ) : (
        rows.map((item) => (
          <div key={item.id} className="card-surface hover-lift p-3.5">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-lg">
                {categoryIcons[item.category] || categoryIcons.Outros}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <strong className="min-w-0 truncate text-sm font-bold text-foreground">{item.name}</strong>
                  <strong className="tnum shrink-0 text-sm font-bold text-foreground">{money(item.amount)}</strong>
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
                {item.note && <p className="mt-1 truncate text-[11px] text-muted-foreground">{item.note}</p>}
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <button type="button" onClick={() => toggleExpenseStatus(item.id)} className="press focus-ring rounded-full">
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
