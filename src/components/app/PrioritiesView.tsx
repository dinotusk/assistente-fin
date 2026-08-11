import { useState } from "react";
import { ListChecks, Pencil, Plus, Target, Trash2 } from "lucide-react";

import { calc, priorityMatchesView } from "@/lib/finance/calc";
import { useFinance, useMoney } from "@/lib/finance/FinanceContext";

import { ConfirmDialog } from "./ConfirmDialog";
import { Panel, PanelHead, StatusPill } from "./ui";

export function PrioritiesView({
  onEdit,
  onAdd,
}: {
  onEdit: (id: string) => void;
  onAdd: () => void;
}) {
  const { month, state, togglePriorityStatus, deletePriority } = useFinance();
  const money = useMoney();
  const view = state.activePerson;
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingPriority = deletingId
    ? month.priorities.find((item) => item.id === deletingId)
    : null;
  const priorities = month.priorities
    .filter((item) => priorityMatchesView(item, view, state.people))
    .slice()
    .sort((a, b) => a.rank - b.rank || b.amount - a.amount);

  const free = calc(month, view, undefined, state.people).free;
  const pending = priorities.filter((p) => p.status === "A pagar");
  let remaining = free;

  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <PanelHead
          title="Prioridades do mês"
          icon={Target}
          action={
            <button
              type="button"
              onClick={onAdd}
              className="press focus-ring inline-flex items-center gap-1 rounded-full bg-primary-soft px-3.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/15"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> Adicionar
            </button>
          }
        />
        <div className="flex flex-col gap-2.5">
          {priorities.length === 0 && (
            <div className="flex flex-col items-center px-4 py-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft">
                <Target className="h-6 w-6 text-primary" strokeWidth={2} />
              </div>
              <h3 className="mt-4 text-sm font-bold text-foreground">Sem prioridades ainda</h3>
              <p className="mt-1 max-w-[26ch] text-[13px] text-muted-foreground">
                Adicione o que precisa pagar este mês para saber o que dá pra encaixar no orçamento.
              </p>
              <button
                type="button"
                onClick={onAdd}
                className="press focus-ring mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-primary"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> Adicionar prioridade
              </button>
            </div>
          )}
          {priorities.map((item) => {
            const rankAccent =
              item.rank === 1
                ? "border-l-primary/60"
                : item.rank === 2
                  ? "border-l-warning/55"
                  : "border-l-muted-foreground/25";
            return (
              <div
                key={item.id}
                className={`hover-lift rounded-2xl border-l-2 ${rankAccent} bg-secondary p-3.5`}
              >
                <div className="flex items-start justify-between gap-2">
                  <strong className="min-w-0 truncate text-sm font-bold text-foreground">
                    {item.name}
                  </strong>
                  <strong className="tnum shrink-0 text-sm font-bold text-foreground">
                    {money(item.amount)}
                  </strong>
                </div>
                <span className="mt-0.5 block text-[11px] font-medium text-muted-foreground">
                  Prioridade {item.rank}
                </span>
                <div className="mt-2.5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => togglePriorityStatus(item.id)}
                    className="press focus-ring rounded-full"
                  >
                    <StatusPill status={item.status} />
                  </button>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(item.id)}
                      aria-label="Editar"
                      className="press focus-ring flex h-9 w-9 items-center justify-center rounded-xl bg-card text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(item.id)}
                      aria-label="Excluir"
                      className="press focus-ring flex h-9 w-9 items-center justify-center rounded-xl bg-card text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel tone="flat">
        <PanelHead title="Plano sugerido" hint={`Saldo livre: ${money(free)}`} icon={ListChecks} />
        <div className="flex flex-col gap-2.5">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma prioridade pendente.</p>
          ) : (
            pending.map((item) => {
              const canPay = remaining >= item.amount;
              if (canPay) remaining -= item.amount;
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border-l-2 p-3.5 ${canPay ? "border-l-success/55 bg-success/8" : "border-l-warning/55 bg-warning/8"}`}
                >
                  <strong className="block text-sm font-bold text-foreground">
                    {canPay ? "Pode pagar agora" : "Melhor adiar"}: {item.name}
                  </strong>
                  <span className="text-[11px] text-muted-foreground">
                    {money(item.amount)} · sobraria {money(Math.max(remaining, 0))}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </Panel>

      <ConfirmDialog
        open={Boolean(deletingId)}
        onOpenChange={(next) => {
          if (!next) setDeletingId(null);
        }}
        title="Excluir prioridade?"
        description="A prioridade será removida deste mês."
        confirmLabel="Excluir prioridade"
        busyLabel="Excluindo..."
        onConfirm={async () => {
          if (!deletingPriority) return;
          await deletePriority(deletingPriority.id);
        }}
      />
    </div>
  );
}
