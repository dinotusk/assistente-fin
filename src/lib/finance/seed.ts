import type { FinanceState } from "./types";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

// Seed data matching the original app's July 2026 example month.
export function createSeedState(): FinanceState {
  return {
    people: ["Minha casa", "Outra casa"],
    activePerson: "me",
    activeMonth: "2026-07",
    months: {
      "2026-07": {
        label: "Julho 2026",
        income: 5000,
        houseContribution: 1800,
        expenses: [
          {
            id: uid(),
            name: "Supermercado",
            category: "Alimentação",
            amount: 850,
            status: "A pagar",
            owner: "Minha casa",
            date: "2026-07-05",
            paymentMethod: "Débito",
            note: "Exemplo",
          },
          {
            id: uid(),
            name: "Aluguel",
            category: "Casa",
            amount: 1200,
            status: "Pago",
            owner: "Minha casa",
            date: "2026-07-07",
            paymentMethod: "Pix",
            note: "Exemplo",
          },
          {
            id: uid(),
            name: "Internet",
            category: "Casa",
            amount: 120,
            status: "Pago",
            owner: "Minha casa",
            date: "2026-07-10",
            paymentMethod: "Boleto",
            note: "Exemplo",
          },
          {
            id: uid(),
            name: "Plano de saúde",
            category: "Gasto fixo",
            amount: 1700,
            status: "A pagar",
            owner: "Outra casa",
            date: "2026-07-12",
            paymentMethod: "Boleto",
            note: "Exemplo",
          },
          {
            id: uid(),
            name: "Celular",
            category: "Gasto fixo",
            amount: 60,
            status: "Pago",
            owner: "Outra casa",
            date: "2026-07-15",
            paymentMethod: "Pix",
            note: "Exemplo",
          },
          {
            id: uid(),
            name: "Reserva mensal",
            category: "Investimento",
            amount: 400,
            status: "Pago",
            owner: "Minha casa",
            date: "2026-07-20",
            paymentMethod: "Transferência",
            note: "Exemplo",
          },
        ],
        priorities: [
          {
            id: uid(),
            name: "Montar reserva",
            amount: 500,
            rank: 1,
            status: "A pagar",
            responsavel: "Minha casa",
          },
          {
            id: uid(),
            name: "Quitar conta pendente",
            amount: 300,
            rank: 2,
            status: "A pagar",
            responsavel: "Minha casa",
          },
        ],
      },
    },
  };
}

export { uid };
