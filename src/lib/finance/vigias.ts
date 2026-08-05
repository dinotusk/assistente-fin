// Vigias: named rules that watch the data and speak up on their own (spec 4.1/4.3).
// Stored locally on this device (no Supabase sync yet, same simplification as learnedCategories.ts).
import { calc, expensesForView, money, sum } from "./calc";
import type { EnvelopeRule, Expense, FinanceState, MonthData } from "./types";

export type VigiaTone = "seco" | "gentil" | "direto";
export type VigiaFrequency = "sempre" | "diaria" | "mensal";

export type VigiaRuleType =
  | "gastoAcimaDoNormal"
  | "categoriaEstourou"
  | "ritmoDeGasto"
  | "contaVencendo"
  | "resumoDiario"
  | "fechamentoDoMes"
  | "acertoEntrePerfis";

export const VIGIA_RULE_LABELS: Record<VigiaRuleType, string> = {
  gastoAcimaDoNormal: "Gasto acima do normal (2x a média da categoria)",
  categoriaEstourou: "Categoria estourou o envelope do mês",
  ritmoDeGasto: "Ritmo de gasto acima do orçamento",
  contaVencendo: "Conta vencendo ou atrasada",
  resumoDiario: "Resumo diário do que entrou e saiu",
  fechamentoDoMes: "Fechamento do mês",
  acertoEntrePerfis: "Acerto entre perfis passou de um valor",
};

export interface Vigia {
  id: string;
  name: string;
  tone: VigiaTone;
  rule: VigiaRuleType;
  enabled: boolean;
  lastFiredAt: string | null;
  frequency: VigiaFrequency;
  threshold?: number; // dias (contaVencendo) ou valor em R$ (acertoEntrePerfis)
}

export interface VigiaAlert {
  vigia: Vigia;
  severity: "erro" | "atencao" | "info";
  message: string;
}

const STORAGE_KEY = "assistente-financeiro-vigias-v1";

function defaultVigias(): Vigia[] {
  return [
    {
      id: "vigia-atrasos",
      name: "Fiscal do mês",
      tone: "direto",
      rule: "contaVencendo",
      enabled: true,
      lastFiredAt: null,
      frequency: "sempre",
      threshold: 3,
    },
    {
      id: "vigia-ritmo",
      name: "Guardião do orçamento",
      tone: "seco",
      rule: "ritmoDeGasto",
      enabled: true,
      lastFiredAt: null,
      frequency: "diaria",
    },
    {
      id: "vigia-envelopes",
      name: "Zelador dos envelopes",
      tone: "gentil",
      rule: "categoriaEstourou",
      enabled: true,
      lastFiredAt: null,
      frequency: "diaria",
    },
    {
      id: "vigia-resumo",
      name: "Cronista do dia",
      tone: "gentil",
      rule: "resumoDiario",
      enabled: false,
      lastFiredAt: null,
      frequency: "diaria",
    },
  ];
}

export function listVigias(): Vigia[] {
  if (typeof localStorage === "undefined") return defaultVigias();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultVigias();
    return JSON.parse(raw) as Vigia[];
  } catch {
    return defaultVigias();
  }
}

function saveVigias(vigias: Vigia[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vigias));
}

export function toggleVigia(id: string, enabled: boolean): Vigia[] {
  const vigias = listVigias().map((v) => (v.id === id ? { ...v, enabled } : v));
  saveVigias(vigias);
  return vigias;
}

export function addVigia(vigia: Omit<Vigia, "id" | "lastFiredAt">): Vigia[] {
  const vigias = [...listVigias(), { ...vigia, id: `vigia-${Date.now()}`, lastFiredAt: null }];
  saveVigias(vigias);
  return vigias;
}

export function removeVigia(id: string): Vigia[] {
  const vigias = listVigias().filter((v) => v.id !== id);
  saveVigias(vigias);
  return vigias;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function canFireToday(vigia: Vigia): boolean {
  if (!vigia.lastFiredAt) return true;
  if (vigia.frequency === "sempre") return vigia.lastFiredAt.slice(0, 10) !== today();
  if (vigia.frequency === "diaria") return vigia.lastFiredAt.slice(0, 10) !== today();
  if (vigia.frequency === "mensal") return vigia.lastFiredAt.slice(0, 7) !== today().slice(0, 7);
  return true;
}

const SEVERITY_ORDER: Record<VigiaAlert["severity"], number> = { erro: 0, atencao: 1, info: 2 };

/** Evaluates all enabled vigias against the current month; caller decides when to run this (app open, save, import). */
export function evaluateVigias(
  vigias: Vigia[],
  state: FinanceState,
  month: MonthData,
  envelopes: EnvelopeRule[],
  maxAlerts = 3,
): VigiaAlert[] {
  const alerts: VigiaAlert[] = [];
  const view = state.activePerson;
  const expenses = expensesForView(month, view);
  const numbers = calc(month, view, state.activeMonth);
  const todayKey = today();

  for (const vigia of vigias) {
    if (!vigia.enabled || !canFireToday(vigia)) continue;
    const alert = evaluateRule(vigia, { state, month, envelopes, expenses, numbers, todayKey });
    if (alert) alerts.push(alert);
  }

  return alerts
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .slice(0, maxAlerts);
}

/** Checks a single newly-saved expense against its category's 90-day average (gastoAcimaDoNormal). */
export function evaluateNewExpense(
  vigias: Vigia[],
  state: FinanceState,
  expense: Expense,
): VigiaAlert | null {
  const vigia = vigias.find((v) => v.rule === "gastoAcimaDoNormal" && v.enabled && canFireToday(v));
  if (!vigia) return null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffKey = cutoff.toISOString().slice(0, 10);

  const sameCategory = Object.values(state.months)
    .flatMap((m) => m.expenses)
    .filter(
      (item) =>
        item.category === expense.category && item.id !== expense.id && item.date >= cutoffKey,
    );

  if (sameCategory.length < 3) return null;
  const average = sum(sameCategory) / sameCategory.length;
  if (average <= 0 || expense.amount < average * 2) return null;

  return {
    vigia,
    severity: "atencao",
    message: `${expense.name} custou ${money(expense.amount)}, mais que o dobro da média de ${categoryPhrase(expense.category)} (${money(average)}).`,
  };
}

function categoryPhrase(category: string): string {
  return category.toLocaleLowerCase("pt-BR");
}

interface RuleContext {
  state: FinanceState;
  month: MonthData;
  envelopes: EnvelopeRule[];
  expenses: Expense[];
  numbers: ReturnType<typeof calc>;
  todayKey: string;
}

function evaluateRule(vigia: Vigia, ctx: RuleContext): VigiaAlert | null {
  switch (vigia.rule) {
    case "contaVencendo": {
      const dias = vigia.threshold ?? 3;
      const limitKey = new Date();
      limitKey.setDate(limitKey.getDate() + dias);
      const limitStr = limitKey.toISOString().slice(0, 10);
      const overdue = ctx.expenses.filter(
        (e) => e.status === "A pagar" && (e.dueDate || e.date) < ctx.todayKey,
      );
      const dueSoon = ctx.expenses.filter(
        (e) =>
          e.status === "A pagar" &&
          (e.dueDate || e.date) >= ctx.todayKey &&
          (e.dueDate || e.date) <= limitStr,
      );
      if (overdue.length) {
        const top = overdue.sort((a, b) => b.amount - a.amount)[0];
        return {
          vigia,
          severity: "erro",
          message:
            overdue.length === 1
              ? `${top.name} venceu em ${formatDate(top.dueDate || top.date)} e ainda está em aberto.`
              : `${overdue.length} contas atrasadas. A maior é ${top.name} (${money(top.amount)}).`,
        };
      }
      if (dueSoon.length) {
        const top = dueSoon.sort((a, b) =>
          (a.dueDate || a.date).localeCompare(b.dueDate || b.date),
        )[0];
        return {
          vigia,
          severity: "atencao",
          message: `${top.name} vence em ${formatDate(top.dueDate || top.date)} (${money(top.amount)}).`,
        };
      }
      return null;
    }
    case "ritmoDeGasto": {
      if (ctx.numbers.free < 0) {
        return {
          vigia,
          severity: "erro",
          message: `Ritmo acima do orçamento: já passou ${money(Math.abs(ctx.numbers.free))}.`,
        };
      }
      return null;
    }
    case "categoriaEstourou": {
      for (const rule of ctx.envelopes) {
        const spent = sum(ctx.expenses.filter((item) => rule.categories.includes(item.category)));
        if (rule.limit > 0 && spent > rule.limit) {
          return {
            vigia,
            severity: "atencao",
            message: `${rule.label} passou do limite: ${money(spent)} de ${money(rule.limit)} planejados.`,
          };
        }
      }
      return null;
    }
    case "resumoDiario": {
      const todayExpenses = ctx.expenses.filter((e) => e.date === ctx.todayKey);
      if (!todayExpenses.length) return null;
      const out = sum(todayExpenses.filter((e) => e.type !== "income"));
      const income = sum(todayExpenses.filter((e) => e.type === "income"));
      return {
        vigia,
        severity: "info",
        message: `Hoje: ${money(out)} saíram e ${money(income)} entraram.`,
      };
    }
    case "fechamentoDoMes": {
      const lastDay = new Date(
        Number(ctx.state.activeMonth.slice(0, 4)),
        Number(ctx.state.activeMonth.slice(5, 7)),
        0,
      )
        .toISOString()
        .slice(0, 10);
      if (ctx.todayKey !== lastDay) return null;
      return {
        vigia,
        severity: "info",
        message: `Fechando o mês com ${money(ctx.numbers.total)} em gastos e ${money(ctx.numbers.free)} de saldo.`,
      };
    }
    case "acertoEntrePerfis": {
      const threshold = vigia.threshold ?? 100;
      const debts = new Map<string, number>();
      ctx.expenses
        .filter((e) => e.status === "Pago" && e.paidBy && e.paidBy !== e.owner)
        .forEach((e) => {
          const key = `${e.owner}->${e.paidBy}`;
          debts.set(key, (debts.get(key) || 0) + e.amount);
        });
      for (const [key, amount] of debts) {
        if (amount >= threshold) {
          const [owner, paidBy] = key.split("->");
          return {
            vigia,
            severity: "info",
            message: `${owner} deve ${money(amount)} para ${paidBy} neste mês.`,
          };
        }
      }
      return null;
    }
    default:
      return null;
  }
}

function formatDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

export function markFired(vigias: Vigia[], firedIds: string[]): Vigia[] {
  const now = new Date().toISOString();
  const updated = vigias.map((v) => (firedIds.includes(v.id) ? { ...v, lastFiredAt: now } : v));
  saveVigias(updated);
  return updated;
}
