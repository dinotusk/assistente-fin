import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Trash2, X } from "lucide-react";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { categories, paymentMethods } from "@/lib/finance/constants";
import { categoryLabel, currentUserName, resolveViewOwner, spouseName } from "@/lib/finance/calc";
import { useFinance } from "@/lib/finance/FinanceContext";
import { forgetCategory, learnCategory, listLearnedCategories, lookupLearnedCategory, type LearnedCategoryRule } from "@/lib/finance/learnedCategories";
import { isDuplicate, parseCsv, parseOfx, type ParsedTransaction } from "@/lib/finance/bankImport";
import { uid } from "@/lib/finance/seed";
import type { Expense, Priority } from "@/lib/finance/types";
import {
  addVigia,
  listVigias,
  removeVigia,
  toggleVigia,
  VIGIA_RULE_LABELS,
  type Vigia,
  type VigiaRuleType,
  type VigiaTone,
} from "@/lib/finance/vigias";

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
          <DrawerTitle className="font-display text-2xl tracking-tight text-foreground">{title}</DrawerTitle>
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
        className="hero-gradient press focus-ring h-12 flex-1 rounded-xl font-semibold text-primary-foreground shadow-primary"
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
    if (editing && editing.category !== payload.category) {
      learnCategory(payload.name, payload.category);
    }
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
  const { month, state, saveMonthSettings, deleteMonth } = useFinance();
  const [label, setLabel] = useState("");
  const [income, setIncome] = useState(0);
  const [contribution, setContribution] = useState(0);
  const [profileBudgets, setProfileBudgets] = useState<Record<string, number>>({});
  const [planned, setPlanned] = useState(false);
  const canDelete = Object.keys(state.months).length > 1;

  useEffect(() => {
    if (!open) return;
    setLabel(month.label);
    setIncome(month.income);
    setContribution(month.houseContribution || 0);
    setProfileBudgets(month.profileBudgets || {});
    setPlanned(Boolean(month.planned));
  }, [open, month]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    saveMonthSettings(label, income, contribution, profileBudgets, planned);
    onOpenChange(false);
  }

  function setProfileBudget(profile: string, value: number) {
    setProfileBudgets((current) => ({ ...current, [profile]: value }));
  }

  function handleDelete() {
    if (!canDelete) return;
    const ok = confirm(`Excluir "${month.label}"? Todos os gastos e prioridades desse mês serão apagados. Essa ação não pode ser desfeita.`);
    if (!ok) return;
    deleteMonth(state.activeMonth);
    onOpenChange(false);
  }

  return (
    <SheetShell open={open} onOpenChange={onOpenChange} title="Editar mes">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nome do mes">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} required />
        </Field>

        <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary p-3.5">
          <div className="min-w-0">
            <strong className="block text-sm font-bold text-foreground">Mês planejado</strong>
            <span className="block text-[12px] leading-snug text-muted-foreground">
              Marque se este mês ainda não começou. Os valores viram uma previsão até você desmarcar.
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={planned}
            aria-label="Mês planejado"
            onClick={() => setPlanned((value) => !value)}
            className={`press focus-ring relative h-7 w-12 shrink-0 rounded-full transition-colors ${planned ? "bg-primary" : "bg-muted"}`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${planned ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </button>
        </div>

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

        <div className="mt-1 border-t border-border/70 pt-4">
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete}
            className="press focus-ring flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-35"
          >
            <Trash2 className="h-4 w-4" /> Excluir este mês
          </button>
          {!canDelete && (
            <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
              Não é possível excluir o único mês existente.
            </p>
          )}
        </div>

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

/* ---------------- Learned categories ---------------- */
export function CategoriesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [rules, setRules] = useState<LearnedCategoryRule[]>([]);

  useEffect(() => {
    if (open) setRules(listLearnedCategories());
  }, [open]);

  function remove(establishment: string) {
    forgetCategory(establishment);
    setRules(listLearnedCategories());
  }

  return (
    <SheetShell open={open} onOpenChange={onOpenChange} title="Categorias aprendidas">
      <p className="text-sm text-muted-foreground">
        Toda vez que você corrige a categoria de um gasto, o Aval memoriza a regra e passa a aplicá-la
        automaticamente para o mesmo estabelecimento, inclusive em lançamentos futuros pelo chat ou importados.
      </p>
      {rules.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Nenhuma regra aprendida ainda.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {rules.map((rule) => (
            <div
              key={rule.establishment}
              className="flex items-center justify-between gap-3 rounded-2xl bg-secondary p-3.5"
            >
              <div className="min-w-0">
                <strong className="block truncate text-sm font-bold text-foreground">{rule.establishment}</strong>
                <span className="text-[12px] text-muted-foreground">{categoryLabel(rule.category)}</span>
              </div>
              <button
                type="button"
                onClick={() => remove(rule.establishment)}
                aria-label={`Esquecer regra de ${rule.establishment}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="sticky bottom-0 -mx-5 mt-5 border-t border-border/70 bg-card/95 px-5 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="press focus-ring h-12 w-full rounded-xl border border-input bg-secondary font-semibold text-foreground hover:bg-muted"
        >
          Fechar
        </button>
      </div>
    </SheetShell>
  );
}

/* ---------------- Invite ---------------- */
export function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { createInvite } = useFinance();
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCode(null);
    setLoading(true);
    createInvite()
      .then((value) => setCode(value))
      .catch((err) => setError(err instanceof Error ? err.message : "Não foi possível gerar o convite."))
      .finally(() => setLoading(false));
  }, [open, createInvite]);

  const link = code && typeof window !== "undefined" ? `${window.location.origin}/entrar?convite=${code}` : "";

  async function copy(value: string, kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard permission denied — code stays visible on screen either way.
    }
  }

  return (
    <SheetShell open={open} onOpenChange={onOpenChange} title="Convidar para a casa">
      <p className="text-sm text-muted-foreground">
        Compartilhe este código com quem vai entrar na sua casa. Ao criar a conta com ele, a pessoa já vê as mesmas
        despesas, prioridades e metas, sem duplicar nada.
      </p>

      {loading && (
        <div className="mt-6 flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Gerando convite" />
        </div>
      )}

      {error && !loading && (
        <p className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {code && !loading && (
        <div className="mt-5 flex flex-col gap-3">
          <div className="panel-flat flex flex-col items-center gap-1 p-5 text-center">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Código do convite
            </span>
            <strong className="font-display text-3xl tracking-[0.15em] text-primary">{code}</strong>
          </div>
          <button
            type="button"
            onClick={() => copy(code, "code")}
            className="press focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-input bg-secondary text-sm font-semibold text-foreground hover:bg-muted"
          >
            {copied === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied === "code" ? "Copiado!" : "Copiar código"}
          </button>
          <button
            type="button"
            onClick={() => copy(link, "link")}
            className="hero-gradient press focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-primary-foreground shadow-primary"
          >
            {copied === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied === "link" ? "Copiado!" : "Copiar link de convite"}
          </button>
          <p className="text-center text-[11px] text-muted-foreground">Válido por 14 dias ou até ser usado.</p>
        </div>
      )}

      <div className="sticky bottom-0 -mx-5 mt-5 border-t border-border/70 bg-card/95 px-5 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="press focus-ring h-12 w-full rounded-xl border border-input bg-secondary font-semibold text-foreground hover:bg-muted"
        >
          Fechar
        </button>
      </div>
    </SheetShell>
  );
}

/* ---------------- Bank statement import (OFX/CSV) ---------------- */
interface ImportCandidate {
  id: string;
  date: string;
  amount: number;
  type: "income" | "expense";
  description: string;
  category: string;
  owner: string;
}

export function BankImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { state, importExpenses } = useFinance();
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [error, setError] = useState("");
  const defaultOwner = resolveViewOwner(state.activePerson) || currentUserName();

  useEffect(() => {
    if (!open) {
      setCandidates([]);
      setSkippedCount(0);
      setError("");
    }
  }, [open]);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    try {
      const text = await file.text();
      const isOfx = /\.ofx$/i.test(file.name) || /<OFX>/i.test(text);
      const parsed: ParsedTransaction[] = isOfx ? parseOfx(text) : parseCsv(text);
      if (!parsed.length) {
        setError("Não consegui reconhecer lançamentos nesse arquivo.");
        return;
      }

      const existing = Object.values(state.months).flatMap((month) =>
        month.expenses.map((item) => ({ date: item.date, amount: item.amount, name: item.name })),
      );

      const fresh: ImportCandidate[] = [];
      let skipped = 0;
      parsed.forEach((tx) => {
        if (isDuplicate(tx, existing)) {
          skipped += 1;
          return;
        }
        fresh.push({
          id: uid(),
          date: tx.date,
          amount: tx.amount,
          type: tx.type,
          description: tx.description,
          category: tx.type === "income" ? "Livre" : lookupLearnedCategory(tx.description) || "Outros",
          owner: defaultOwner,
        });
      });
      setCandidates(fresh);
      setSkippedCount(skipped);
    } catch {
      setError("Não consegui ler esse arquivo. Confira se é um OFX ou CSV válido.");
    }
  }

  function updateCandidate(id: string, patch: Partial<ImportCandidate>) {
    setCandidates((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeCandidate(id: string) {
    setCandidates((list) => list.filter((item) => item.id !== id));
  }

  function importAll() {
    const expenses: Expense[] = candidates.map((item) => ({
      id: item.id,
      name: item.description,
      category: item.category,
      amount: item.amount,
      status: "Pago",
      type: item.type,
      owner: item.owner,
      date: item.date,
      dueDate: item.date,
      competence: item.date.slice(0, 7),
      paidBy: item.owner,
      paymentMethod: "Não informado",
      note: "Importado do extrato bancário",
      createdAt: new Date().toISOString(),
    }));
    importExpenses(expenses);
    onOpenChange(false);
  }

  return (
    <SheetShell open={open} onOpenChange={onOpenChange} title="Importar extrato do banco">
      {candidates.length === 0 ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Envie um arquivo OFX (padrão de extrato de qualquer banco) ou CSV. Nada entra no seu extrato sem você
            revisar e confirmar.
          </p>
          <label className="press focus-ring flex h-14 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-primary/35 bg-primary-soft text-sm font-bold text-primary">
            Escolher arquivo (.ofx ou .csv)
            <input type="file" accept=".ofx,.csv,text/csv" className="hidden" onChange={onFile} />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {candidates.length} lançamento(s) prontos para revisão
            {skippedCount > 0 ? ` · ${skippedCount} ignorado(s) por já existir(em)` : ""}.
          </p>
          {candidates.map((item) => (
            <div key={item.id} className="rounded-2xl bg-secondary p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <strong className="block truncate text-sm font-bold text-foreground">{item.description}</strong>
                  <span className="text-[11px] text-muted-foreground">
                    {item.date} · {item.type === "income" ? "Entrada" : "Saída"} · {categoryLabel(item.category)}
                  </span>
                </div>
                <strong className="tnum shrink-0 text-sm font-bold text-foreground">
                  {item.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </strong>
              </div>
              <div className="mt-2.5 grid grid-cols-[1fr_1fr_auto] gap-2">
                <SelectInput value={item.category} onChange={(e) => updateCandidate(item.id, { category: e.target.value })}>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {categoryLabel(cat)}
                    </option>
                  ))}
                </SelectInput>
                <SelectInput value={item.owner} onChange={(e) => updateCandidate(item.id, { owner: e.target.value })}>
                  {state.people.map((person, index) => (
                    <option key={`${person}-${index}`} value={index === 0 ? currentUserName() : index === 1 ? spouseName() : person}>
                      {person}
                    </option>
                  ))}
                </SelectInput>
                <button
                  type="button"
                  onClick={() => removeCandidate(item.id)}
                  aria-label="Descartar este lançamento"
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          <div className="sticky bottom-0 -mx-5 mt-2 flex gap-3 border-t border-border/70 bg-card/95 px-5 py-3 backdrop-blur">
            <button
              type="button"
              onClick={() => setCandidates([])}
              className="press focus-ring h-12 flex-1 rounded-xl border border-input bg-secondary font-semibold text-foreground hover:bg-muted"
            >
              Descartar tudo
            </button>
            <button
              type="button"
              onClick={importAll}
              className="hero-gradient press focus-ring h-12 flex-1 rounded-xl font-display font-semibold text-primary-foreground shadow-primary"
            >
              Importar tudo
            </button>
          </div>
        </div>
      )}
    </SheetShell>
  );
}

/* ---------------- Vigias ---------------- */
const RULE_TYPES = Object.keys(VIGIA_RULE_LABELS) as VigiaRuleType[];
const TONES: { value: VigiaTone; label: string }[] = [
  { value: "gentil", label: "Gentil" },
  { value: "direto", label: "Direto" },
  { value: "seco", label: "Seco" },
];

export function VigiasDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [vigias, setVigias] = useState<Vigia[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [rule, setRule] = useState<VigiaRuleType>("contaVencendo");
  const [tone, setTone] = useState<VigiaTone>("gentil");

  useEffect(() => {
    if (open) setVigias(listVigias());
    else setCreating(false);
  }, [open]);

  function toggle(id: string, enabled: boolean) {
    setVigias(toggleVigia(id, enabled));
  }

  function remove(id: string) {
    setVigias(removeVigia(id));
  }

  function submitNewVigia(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setVigias(
      addVigia({
        name: name.trim(),
        rule,
        tone,
        enabled: true,
        frequency: rule === "contaVencendo" ? "sempre" : "diaria",
      }),
    );
    setName("");
    setCreating(false);
  }

  return (
    <SheetShell open={open} onOpenChange={onOpenChange} title="Vigias">
      <p className="text-sm text-muted-foreground">
        Regras que observam seus dados e falam sozinhas na conversa, sem você precisar perguntar.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {vigias.map((vigia) => (
          <div key={vigia.id} className="rounded-2xl bg-secondary p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <strong className="block truncate text-sm font-bold text-foreground">{vigia.name}</strong>
                <span className="block text-[12px] text-muted-foreground">{VIGIA_RULE_LABELS[vigia.rule]}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={vigia.enabled}
                  aria-label={`Ativar ${vigia.name}`}
                  onClick={() => toggle(vigia.id, !vigia.enabled)}
                  className={`press focus-ring relative h-7 w-12 rounded-full transition-colors ${vigia.enabled ? "bg-primary" : "bg-muted"}`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${vigia.enabled ? "translate-x-5" : "translate-x-0.5"}`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => remove(vigia.id)}
                  aria-label={`Excluir ${vigia.name}`}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {creating ? (
        <form onSubmit={submitNewVigia} className="mt-4 flex flex-col gap-3 rounded-2xl border border-border bg-secondary/50 p-3.5">
          <Field label="Nome do vigia">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Fiscal das assinaturas" required />
          </Field>
          <Field label="O que ele observa">
            <SelectInput value={rule} onChange={(e) => setRule(e.target.value as VigiaRuleType)}>
              {RULE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {VIGIA_RULE_LABELS[type]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Tom de voz">
            <SelectInput value={tone} onChange={(e) => setTone(e.target.value as VigiaTone)}>
              {TONES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="press focus-ring h-11 flex-1 rounded-xl border border-input bg-secondary text-sm font-semibold text-foreground"
            >
              Cancelar
            </button>
            <button type="submit" className="hero-gradient press focus-ring h-11 flex-1 rounded-xl text-sm font-bold text-primary-foreground shadow-primary">
              Criar vigia
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl border border-dashed border-primary/35 bg-primary-soft text-sm font-bold text-primary"
        >
          Novo vigia
        </button>
      )}

      <div className="sticky bottom-0 -mx-5 mt-5 border-t border-border/70 bg-card/95 px-5 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="press focus-ring h-12 w-full rounded-xl border border-input bg-secondary font-semibold text-foreground hover:bg-muted"
        >
          Fechar
        </button>
      </div>
    </SheetShell>
  );
}
