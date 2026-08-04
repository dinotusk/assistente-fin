// Domain constants — categories, colors, icons, payment methods, view keys.
// Preserves the exact category set and financial view semantics of the original app.

import {
  Car,
  CreditCard,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  type LucideIcon,
  Package,
  Receipt,
  Repeat,
  Sparkles,
  Ticket,
  TrendingUp,
  Utensils,
} from "lucide-react";

export const STORAGE_KEY = "assistente-financeiro-casa-v3";
export const PROFILES_KEY = "assistente-financeiro-perfis-v1";
export const ACTIVE_PROFILE_KEY = "assistente-financeiro-perfil-ativo-v1";

/** Optional Google Sheets Apps Script endpoint. Empty = local/offline mode. */
export const GOOGLE_SHEETS_API_URL = "";

export const DEFAULT_FAMILY_PEOPLE = ["Minha casa", "Pai da namorada"] as const;
export const RESPONSAVEL_CASAL = "Todos/Casal";

export const VIEW_ALL = "todos";
export const VIEW_ME = "me";
export const VIEW_SPOUSE = "spouse";

export const defaultEnvelopeRules = [
  { id: "gasolina", label: "Gasolina", limit: 500, categories: ["Transporte"] },
  { id: "lazer", label: "Lazer", limit: 300, categories: ["Lazer"] },
  { id: "compras", label: "Compras pessoais", limit: 200, categories: ["Livre", "Outros"] },
  { id: "emergencias", label: "Emergencias", limit: 300, categories: ["Saude"] },
];

// Category order matters (matches original, with "Empréstimo" inserted before "Investimento").
export const categories = [
  "Alimentação",
  "Transporte",
  "Casa",
  "Gasto fixo",
  "Saúde",
  "Lazer",
  "Educação",
  "Cartões",
  "Dívida",
  "Empréstimo",
  "Investimento",
  "Livre",
  "Outros",
];

export const paymentMethods = ["Pix", "Débito", "Crédito", "Dinheiro", "Boleto", "Transferência"];

/** Lucide icon per category — matches the app's outline icon style (replaces the old emoji set). */
export const categoryIcons: Record<string, LucideIcon> = {
  Alimentação: Utensils,
  Transporte: Car,
  Casa: Home,
  "Gasto fixo": Repeat,
  Saúde: HeartPulse,
  Lazer: Ticket,
  Educação: GraduationCap,
  Cartões: CreditCard,
  Dívida: Receipt,
  Empréstimo: Landmark,
  Investimento: TrendingUp,
  Livre: Sparkles,
  Outros: Package,
};

// Refined palette tuned for the green fintech theme (professional, harmonious).
export const categoryColors: Record<string, string> = {
  Alimentação: "#12a06a",
  Transporte: "#0e9488",
  Casa: "#2f9e5f",
  "Gasto fixo": "#3f7fd6",
  Saúde: "#5b8def",
  Lazer: "#e0913b",
  Educação: "#7c6ee6",
  Cartões: "#d4685e",
  Dívida: "#c0517a",
  Empréstimo: "#ef8f3a",
  Investimento: "#8b6ac8",
  Livre: "#38b2ac",
  Outros: "#7a877e",
};
