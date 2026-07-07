// Domain constants — categories, colors, icons, payment methods, view keys.
// Preserves the exact category set and financial view semantics of the original app.

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

export const categoryIcons: Record<string, string> = {
  Alimentação: "🍽️",
  Transporte: "🚗",
  Casa: "🏠",
  "Gasto fixo": "📅",
  Saúde: "💊",
  Lazer: "🎟️",
  Educação: "📚",
  Cartões: "💳",
  Dívida: "📌",
  Empréstimo: "💸",
  Investimento: "📈",
  Livre: "✨",
  Outros: "📦",
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
