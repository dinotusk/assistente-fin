import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import webpush from "web-push";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = SupabaseClient<any, any, any, any, any>;

import { VIEW_ALL } from "@/lib/finance/constants";
import { evaluateVigias, type Vigia } from "@/lib/finance/vigias";
import type { EnvelopeRule, Expense, MonthData } from "@/lib/finance/types";

// Cron-only endpoint: checks every household with a push subscription for the
// two rules that make sense to poll on a timer (bills due/overdue, budget
// pace) and sends a push if something is worth surfacing. This deliberately
// does NOT touch the localStorage-based Vigias a user configures in the app —
// that config lives on their device and isn't visible to a server job. These
// two checks are a fixed, always-on pair, independent of that local config.

const SYNTHETIC_VIGIAS: Vigia[] = [
  {
    id: "cron-conta-vencendo",
    name: "Contas a vencer",
    tone: "direto",
    rule: "contaVencendo",
    enabled: true,
    lastFiredAt: null,
    frequency: "sempre",
    threshold: 3,
  },
  {
    id: "cron-ritmo",
    name: "Ritmo do orçamento",
    tone: "seco",
    rule: "ritmoDeGasto",
    enabled: true,
    lastFiredAt: null,
    frequency: "diaria",
  },
];

const NOTIFY_COOLDOWN_HOURS = 20;

interface SubscriptionRow {
  id: string;
  household_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  last_notified_at: string | null;
}

export const Route = createFileRoute("/api/push/send-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        const authHeader = request.headers.get("authorization");
        if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY;
        const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
        // SUPABASE_SECRET_KEY is the official Vercel<->Supabase integration's name
        // for this credential and is preferred; SUPABASE_SERVICE_ROLE_KEY is kept
        // as a temporary fallback for environments still using the older manual
        // setup (see .env.example).
        const serviceRoleKey =
          process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl =
          process.env.VITE_SUPABASE_URL || "https://cvsefuukfmdfaajjlpmi.supabase.co";
        if (!vapidPublicKey || !vapidPrivateKey || !serviceRoleKey) {
          return Response.json({ error: "Push nao configurado" }, { status: 500 });
        }
        webpush.setVapidDetails("mailto:suporte@aval.app", vapidPublicKey, vapidPrivateKey);

        const admin = createClient(supabaseUrl, serviceRoleKey);
        const { data: subscriptions, error: subsError } = await admin
          .from("push_subscriptions")
          .select("id, household_id, endpoint, p256dh, auth, last_notified_at");
        if (subsError) return Response.json({ error: subsError.message }, { status: 500 });

        const rows = (subscriptions || []) as SubscriptionRow[];
        const householdIds = [...new Set(rows.map((row) => row.household_id))];
        const results = { checked: householdIds.length, sent: 0, removed: 0 };

        for (const householdId of householdIds) {
          const snapshot = await fetchHouseholdSnapshot(admin, householdId);
          if (!snapshot) continue;

          const alerts = evaluateVigias(
            SYNTHETIC_VIGIAS,
            { people: [], activePerson: VIEW_ALL, activeMonth: snapshot.monthKey, months: {} },
            snapshot.month,
            snapshot.envelopes,
            1,
          );
          if (!alerts.length) continue;
          const alert = alerts[0];

          const householdSubs = rows.filter((row) => row.household_id === householdId);
          for (const sub of householdSubs) {
            if (sub.last_notified_at) {
              const hoursSince = (Date.now() - new Date(sub.last_notified_at).getTime()) / 3600000;
              if (hoursSince < NOTIFY_COOLDOWN_HOURS) continue;
            }
            try {
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: { p256dh: sub.p256dh, auth: sub.auth },
                },
                JSON.stringify({ title: "Aval", body: alert.message, url: "/" }),
              );
              results.sent += 1;
              await admin
                .from("push_subscriptions")
                .update({ last_notified_at: new Date().toISOString() })
                .eq("id", sub.id);
            } catch (error) {
              const statusCode = (error as { statusCode?: number }).statusCode;
              if (statusCode === 404 || statusCode === 410) {
                await admin.from("push_subscriptions").delete().eq("id", sub.id);
                results.removed += 1;
              }
            }
          }
        }

        return Response.json(results);
      },
    },
  },
});

async function fetchHouseholdSnapshot(
  admin: SupabaseAdmin,
  householdId: string,
): Promise<{ month: MonthData; envelopes: EnvelopeRule[]; monthKey: string } | null> {
  const { data: months } = await admin
    .from("finance_months")
    .select("id, period, income, house_contribution")
    .eq("household_id", householdId)
    .order("period", { ascending: false })
    .limit(1);
  const monthRow = months?.[0] as
    { id: string; period: string; income: number; house_contribution: number } | undefined;
  if (!monthRow) return null;

  const { data: expenseRows } = await admin
    .from("expenses")
    .select("id, description, category, amount, status, expense_date, due_date, entry_type")
    .eq("month_id", monthRow.id);

  const { data: envelopeRows } = await admin
    .from("envelopes")
    .select("id, name, categories, monthly_limit")
    .eq("household_id", householdId);

  const expenses: Expense[] = ((expenseRows || []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    name: String(row.description || ""),
    category: String(row.category || "Outros"),
    amount: Number(row.amount || 0),
    status: row.status === "Pago" ? "Pago" : "A pagar",
    type: row.entry_type === "income" ? "income" : "expense",
    owner: "",
    date: String(row.expense_date || ""),
    dueDate: String(row.due_date || row.expense_date || ""),
    paymentMethod: "",
    note: "",
  }));

  const envelopes: EnvelopeRule[] = ((envelopeRows || []) as Record<string, unknown>[]).map(
    (row) => ({
      id: String(row.id),
      label: String(row.name || "Envelope"),
      limit: Number(row.monthly_limit || 0),
      categories:
        Array.isArray(row.categories) && row.categories.length
          ? (row.categories as string[])
          : ["Outros"],
    }),
  );

  const month: MonthData = {
    label: "",
    income: Number(monthRow.income || 0),
    houseContribution: Number(monthRow.house_contribution || 0),
    expenses,
    priorities: [],
  };

  return { month, envelopes, monthKey: String(monthRow.period).slice(0, 7) };
}
