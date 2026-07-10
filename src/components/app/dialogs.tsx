import { useEffect, useState } from "react";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { categories, paymentMethods } from "@/lib/finance/constants";
import { categoryLabel, currentUserName, resolveViewOwner, spouseName } from "@/lib/finance/calc";
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
      <DrawerContent className="mx-auto flex max-h-[88svh] max-w-[440px] flex-col rounded-t-[1.75rem] border-border bg-card">
        <DrawerHeader className="px-5 pb-1 pt-3 text-left">
          <DrawerTitle className="font-display text-xl font-bold tracking-tight text-foreground">{title}</DrawerTitle>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

function Actions({ onCancel, submitLabel = "Salvar" }: { onCancel: () => void; submitLabel?: string }) {
  return (
    <div className="sticky bottom-0 -mx-5 mt-5 flex gap-3 border-t border-border/70 bg-card/95 px-5 py-3 backdrop-blur">
      <button
        type="button"
        onClick={onCancel}
        className="press focus-ring h-12 flex-1 rounded-xl border border-input bg-secondary font-semibold text-foreground hover:bg-muted"
      >
        Cancelar
      </button>
      <button
        type="submit"
        className="hero-gradient press focus-ring h-12 flex-1 rounded-xl font-display font-semibold text-primary-foreground shadow-primary"
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
  const [form, setForm] = useState<Expense>(blankExpense(state.activeMonth, state.activePerson));

  useEffect(() => {
    if (!open) return;
    setForm(editing ? { ...editing } : blankExpense(state.activeMonth, state.activePerson));
  }, [open, editingId, state.activeMonth, state.activePerson]);

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
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.amount || ""}
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
              {state.people.map((person, index) => (
                <option key={`${person}-${index}`} value={index === 0 ? currentUserName() : index === 1 ? spouseName() : person}>
                  {person}
                </option>
              ))}
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

function blankExpense(monthKey: string, activePerson = "me"): Expense {
  return {
    id: uid(),
    name: "",
    date: `${monthKey}-05`,
    category: "Casa",
    amount: 0,
    status: "A pagar",
    owner: resolveViewOwner(activePerson) || currentUserName(),
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
            inputMode="decimal"
            min="0"
            step="0.01"
            value={form.amount || ""}
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
  const { month, state, saveMonthSettings } = useFinance();
  const [label, setLabel] = useState("");
  const [income, setIncome] = useState(0);
  const [contribution, setContribution] = useState(0);
  const [profileBudgets, setProfileBudgets] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open) return;
    setLabel(month.label);
    setIncome(month.income);
    setContribution(month.houseContribution || 0);
    setProfileBudgets(month.profileBudgets || {});
  }, [open, month]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    saveMonthSettings(label, income, contribution, profileBudgets);
    onOpenChange(false);
  }

  function setProfileBudget(profile: string, value: number) {
    setProfileBudgets((current) => ({ ...current, [profile]: value }));
  }

  return (
    <SheetShell open={open} onOpenChange={onOpenChange} title="Editar mes">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nome do mes">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} required />
        </Field>
        <Field label={`Orcamento (${state.people[0] || "Perfil 1"})`}>
          <TextInput
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={income || ""}
            onChange={(e) => setIncome(Number(e.target.value || 0))}
            required
          />
        </Field>
        {state.people[1] ? (
          <Field label={`Orcamento (${state.people[1]})`}>
            <TextInput
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={contribution || ""}
              onChange={(e) => setContribution(Number(e.target.value || 0))}
            />
          </Field>
        ) : null}
        {state.people.slice(2).map((person) => (
          <Field key={person} label={`Orcamento (${person})`}>
            <TextInput
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={profileBudgets[person] || ""}
              onChange={(e) => setProfileBudget(person, Number(e.target.value || 0))}
            />
          </Field>
        ))}
        <Actions onCancel={() => onOpenChange(false)} />
      </form>
    </SheetShell>
  );
}
/* ---------------- People ---------------- */
export function PeopleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { state, savePeople } = useFinance();
  const [people, setPeople] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setPeople(state.people.length ? state.people : ["Perfil principal"]);
  }, [open, state.people]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    savePeople(people);
    onOpenChange(false);
  }

  function updatePerson(index: number, value: string) {
    setPeople((items) => items.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  function addPerson() {
    setPeople((items) => [...items, `Perfil ${items.length + 1}`]);
  }

  function removePerson(index: number) {
    setPeople((items) => (items.length <= 1 ? items : items.filter((_, itemIndex) => itemIndex !== index)));
  }

  return (
    <SheetShell open={open} onOpenChange={onOpenChange} title="Perfis financeiros">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Crie as visoes que deseja acompanhar no filtro superior. Os gastos existentes continuam preservados.
        </p>
        {people.map((person, index) => (
          <div key={index} className="grid grid-cols-[1fr_auto] gap-2">
            <Field label={`Perfil ${index + 1}`}>
              <TextInput value={person} onChange={(e) => updatePerson(index, e.target.value)} required />
            </Field>
            <button
              type="button"
              onClick={() => removePerson(index)}
              disabled={people.length <= 1}
              className="mt-6 h-12 rounded-xl border border-input bg-secondary px-3 text-xs font-bold text-muted-foreground disabled:opacity-35"
            >
              Remover
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addPerson}
          className="h-12 rounded-xl border border-dashed border-primary/35 bg-primary-soft text-sm font-bold text-primary"
        >
          Adicionar perfil
        </button>
        <Actions onCancel={() => onOpenChange(false)} />
      </form>
    </SheetShell>
  );
}
