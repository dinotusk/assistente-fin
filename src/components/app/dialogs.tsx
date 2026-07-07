import { useEffect, useState } from "react";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { categories, paymentMethods } from "@/lib/finance/constants";
import { categoryLabel, currentUserName, spouseName } from "@/lib/finance/calc";
import { useFinance } from "@/lib/finance/FinanceContext";
import { uid } from "@/lib/finance/seed";
import type { Expense, Priority } from "@/lib/finance/types";

import { Field, SelectInput, TextArea, TextInput } from "./forms";

function SheetShell({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[440px] border-border bg-card">
        <DrawerHeader className="px-5 pb-1 pt-2 text-left">
          <DrawerTitle className="font-display text-lg font-bold text-foreground">{title}</DrawerTitle>
        </DrawerHeader>
        <div className="max-h-[76dvh] overflow-y-auto px-5 pb-8 pt-2">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

function Actions({ onCancel, submitLabel = "Salvar" }: { onCancel: () => void; submitLabel?: string }) {
  return (
    <div className="mt-5 flex gap-3">
      <button
        type="button"
        onClick={onCancel}
        className="h-12 flex-1 rounded-xl border border-input bg-secondary font-semibold text-foreground transition active:scale-[0.98]"
      >
        Cancelar
      </button>
      <button
        type="submit"
        className="hero-gradient h-12 flex-1 rounded-xl font-display font-semibold text-primary-foreground shadow-primary transition active:scale-[0.98]"
      >
        {submitLabel}
      </button>
    </div>
  );
}

/* ---------------- Expense ---------------- */
export function ExpenseDialog({
  open,
  onOpenChange,
  editingId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingId: string | null;
}) {
  const { month, state, saveExpense } = useFinance();
  const editing = editingId ? month.expenses.find((e) => e.id === editingId) : null;
  const [form, setForm] = useState<Expense>(blankExpense(state.activeMonth));

  useEffect(() => {
    if (!open) return;
    setForm(editing ? { ...editing } : blankExpense(state.activeMonth));
  }, [open, editingId, state.activeMonth]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    if (form.amount < 0) return;
    const payload: Expense = { ...form, name: form.name.trim(), note: form.note.trim() };
    saveExpense(payload, editing?.id);
    onOpenChange(false);
  }

  return (
    <SheetShell open={open} onOpenChange={onOpenChange} title={editing ? "Editar gasto" : "Adicionar gasto"}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Descrição">
          <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </Field>
          <Field label="Valor">
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value || 0) })}
              required
            />
          </Field>
        </div>
        <Field label="Categoria">
          <SelectInput value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {categoryLabel(cat)}
              </option>
            ))}
          </SelectInput>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <SelectInput value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Expense["status"] })}>
              <option>Pago</option>
              <option>A pagar</option>
            </SelectInput>
          </Field>
          <Field label="Responsável">
            <SelectInput value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}>
              <option value={currentUserName()}>{currentUserName()}</option>
              <option value={spouseName()}>{spouseName()}</option>
            </SelectInput>
          </Field>
        </div>
        <Field label="Forma de pagamento">
          <SelectInput value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
            {paymentMethods.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Observação">
          <TextArea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>
        <Actions onCancel={() => onOpenChange(false)} />
      </form>
    </SheetShell>
  );
}

function blankExpense(monthKey: string): Expense {
  return {
    id: uid(),
    name: "",
    date: `${monthKey}-05`,
    category: "Casa",
    amount: 0,
    status: "A pagar",
    owner: currentUserName(),
    paymentMethod: "Pix",
    note: "",
  };
}

/* ---------------- Priority ---------------- */
export function PriorityDialog({
  open,
  onOpenChange,
  editingId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingId: string | null;
}) {
  const { month, savePriority } = useFinance();
  const editing = editingId ? month.priorities.find((p) => p.id === editingId) : null;
  const [form, setForm] = useState<Priority>(blankPriority());

  useEffect(() => {
    if (!open) return;
    setForm(editing ? { ...editing } : blankPriority());
  }, [open, editingId]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    const payload: Priority = { ...form, name: form.name.trim(), responsavel: currentUserName() };
    savePriority(payload, editing?.id);
    onOpenChange(false);
  }

  return (
    <SheetShell open={open} onOpenChange={onOpenChange} title={editing ? "Editar prioridade" : "Adicionar prioridade"}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Item">
          <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="Valor">
          <TextInput
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: Number(e.target.value || 0) })}
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prioridade">
            <SelectInput value={form.rank} onChange={(e) => setForm({ ...form, rank: Number(e.target.value) })}>
              <option value="1">1 - Alta</option>
              <option value="2">2 - Média</option>
              <option value="3">3 - Baixa</option>
            </SelectInput>
          </Field>
          <Field label="Status">
            <SelectInput value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Priority["status"] })}>
              <option>A pagar</option>
              <option>Pago</option>
              <option>Adiar</option>
            </SelectInput>
          </Field>
        </div>
        <Actions onCancel={() => onOpenChange(false)} />
      </form>
    </SheetShell>
  );
}

function blankPriority(): Priority {
  return { id: uid(), name: "", amount: 0, rank: 1, status: "A pagar", responsavel: currentUserName() };
}

/* ---------------- Month ---------------- */
export function MonthDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { month, saveMonthSettings } = useFinance();
  const [label, setLabel] = useState("");
  const [income, setIncome] = useState(0);
  const [contribution, setContribution] = useState(0);

  useEffect(() => {
    if (!open) return;
    setLabel(month.label);
    setIncome(month.income);
    setContribution(month.houseContribution || 0);
  }, [open]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    saveMonthSettings(label, income, contribution);
    onOpenChange(false);
  }

  return (
    <SheetShell open={open} onOpenChange={onOpenChange} title="Editar mês">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nome do mês">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} required />
        </Field>
        <Field label="Renda do mês (Minha casa)">
          <TextInput type="number" min="0" step="0.01" value={income} onChange={(e) => setIncome(Number(e.target.value || 0))} required />
        </Field>
        <Field label="Valor repassado para casa (Pai da namorada)">
          <TextInput type="number" min="0" step="0.01" value={contribution} onChange={(e) => setContribution(Number(e.target.value || 0))} />
        </Field>
        <Actions onCancel={() => onOpenChange(false)} />
      </form>
    </SheetShell>
  );
}

/* ---------------- People ---------------- */
export function PeopleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { state, savePeople } = useFinance();
  const [one, setOne] = useState("");
  const [two, setTwo] = useState("");

  useEffect(() => {
    if (!open) return;
    setOne(state.people[0] || "Minha casa");
    setTwo(state.people[1] || "Pai da namorada");
  }, [open]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    savePeople(one, two);
    onOpenChange(false);
  }

  return (
    <SheetShell open={open} onOpenChange={onOpenChange} title="Editar pessoas">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          As duas visões financeiras são fixas: Minha casa e Pai da namorada. Aqui você reorganiza os gastos entre elas.
        </p>
        <Field label="Pessoa 1 (Minha casa)">
          <TextInput value={one} onChange={(e) => setOne(e.target.value)} required />
        </Field>
        <Field label="Pessoa 2 (Pai da namorada)">
          <TextInput value={two} onChange={(e) => setTwo(e.target.value)} required />
        </Field>
        <Actions onCancel={() => onOpenChange(false)} />
      </form>
    </SheetShell>
  );
}
