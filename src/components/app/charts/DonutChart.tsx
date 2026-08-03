import { categoryColors } from "@/lib/finance/constants";
import { categoryLabel } from "@/lib/finance/calc";
import type { CategoryTotal } from "@/lib/finance/calc";
import { useMoney } from "@/lib/finance/FinanceContext";

interface DonutChartProps {
  data: CategoryTotal[];
  total: number;
}

const SIZE = 168;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export function DonutChart({ data, total }: DonutChartProps) {
  const money = useMoney();
  if (!data.length || total <= 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <div
          className="rounded-full"
          style={{ width: SIZE, height: SIZE, border: `${STROKE}px solid var(--color-muted)` }}
        />
        <p className="text-sm text-muted-foreground">Sem dados para o gráfico.</p>
      </div>
    );
  }

  let offset = 0;
  const segments = data.map((item) => {
    const fraction = item.total / total;
    const dash = fraction * CIRC;
    const seg = {
      color: categoryColors[item.category] || "var(--color-primary)",
      dash,
      gap: CIRC - dash,
      offset: -offset,
    };
    offset += dash;
    return seg;
  });

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth={STROKE}
          />
          {segments.map((seg, i) => (
            <circle
              key={i}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={seg.color}
              strokeWidth={STROKE}
              strokeDasharray={`${seg.dash} ${seg.gap}`}
              strokeDashoffset={seg.offset}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total</span>
          <strong className="tnum text-lg font-bold text-foreground">{money(total)}</strong>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-1.5">
        {data.slice(0, 6).map((item) => {
          const percent = total ? (item.total / total) * 100 : 0;
          return (
            <div key={item.category} className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: categoryColors[item.category] || "var(--color-primary)" }}
              />
              <span className="min-w-0 flex-1 truncate text-foreground">{categoryLabel(item.category)}</span>
              <span className="tnum shrink-0 font-semibold text-muted-foreground">{percent.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
