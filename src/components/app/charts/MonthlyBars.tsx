import { useMoneyShort } from "@/lib/finance/FinanceContext";

interface MonthlyBarsProps {
  entries: { key: string; label: string; total: number }[];
  activeKey: string;
  onSelect: (key: string) => void;
}

export function MonthlyBars({ entries, activeKey, onSelect }: MonthlyBarsProps) {
  const moneyShort = useMoneyShort();
  if (!entries.length) return <p className="py-4 text-sm text-muted-foreground">Sem histórico.</p>;
  const max = Math.max(...entries.map((e) => e.total), 1);
  return (
    <div className="flex items-end gap-2.5 overflow-x-auto no-scrollbar pb-1">
      {entries.map((entry) => {
        const height = Math.max(8, (entry.total / max) * 100);
        const active = entry.key === activeKey;
        return (
          <button
            key={entry.key}
            type="button"
            onClick={() => onSelect(entry.key)}
            className="press focus-ring flex min-w-14 flex-1 flex-col items-center gap-2 rounded-xl"
          >
            <span className="tnum text-[10px] font-semibold text-muted-foreground">
              {moneyShort(entry.total)}
            </span>
            <div className="flex h-24 w-full items-end justify-center">
              <div
                className={`w-7 rounded-lg transition-all ${active ? "bg-primary shadow-primary" : "bg-primary-soft"}`}
                style={{ height: `${height}%` }}
              />
            </div>
            <span
              className={`text-[11px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}
            >
              {entry.label.replace(/\s+\d{4}/, "").slice(0, 3)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
