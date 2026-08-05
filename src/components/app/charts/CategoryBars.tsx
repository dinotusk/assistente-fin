import { categoryColors } from "@/lib/finance/constants";
import { categoryLabel } from "@/lib/finance/calc";
import type { CategoryTotal } from "@/lib/finance/calc";
import { useMoney } from "@/lib/finance/FinanceContext";

export function CategoryBars({ data }: { data: CategoryTotal[] }) {
  const money = useMoney();
  if (!data.length) {
    return <p className="py-4 text-sm text-muted-foreground">Nenhum gasto neste mês.</p>;
  }
  const max = Math.max(...data.map((item) => item.total), 1);
  return (
    <div className="flex flex-col gap-3.5">
      {data.map((item) => {
        const width = Math.max(6, (item.total / max) * 100);
        const color = categoryColors[item.category] || "var(--color-primary)";
        return (
          <div key={item.category} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="min-w-0 truncate font-medium text-foreground">
                {categoryLabel(item.category)}
              </span>
              <span className="tnum shrink-0 font-semibold text-muted-foreground">
                {money(item.total)}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${width}%`, background: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
