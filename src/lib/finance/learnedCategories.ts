// Learned "establishment -> category" rules, stored locally on this device.
// Spec 4.2 (FUNCOES-A-IMPLEMENTAR.md): correcting a category teaches the app for next time.
import { normalizeText } from "./calc";

const STORAGE_KEY = "assistente-financeiro-categorias-aprendidas-v1";

export interface LearnedCategoryRule {
  establishment: string; // display name, as first taught
  category: string;
}

function readRules(): Record<string, LearnedCategoryRule> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, LearnedCategoryRule>) : {};
  } catch {
    return {};
  }
}

function writeRules(rules: Record<string, LearnedCategoryRule>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

export function listLearnedCategories(): LearnedCategoryRule[] {
  return Object.values(readRules()).sort((a, b) => a.establishment.localeCompare(b.establishment, "pt-BR"));
}

export function learnCategory(establishment: string, category: string): void {
  const name = establishment.trim();
  if (!name) return;
  const key = normalizeText(name);
  const rules = readRules();
  rules[key] = { establishment: name, category };
  writeRules(rules);
}

export function forgetCategory(establishment: string): void {
  const key = normalizeText(establishment);
  const rules = readRules();
  delete rules[key];
  writeRules(rules);
}

/** Returns the learned category for this establishment/description, if any. */
export function lookupLearnedCategory(establishment: string): string | null {
  const key = normalizeText(establishment);
  return readRules()[key]?.category || null;
}
