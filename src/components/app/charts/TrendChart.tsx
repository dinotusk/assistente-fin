import { moneyShort } from "@/lib/finance/calc";

interface TrendChartProps {
  entries: { key: string; label: string; total: number }[];
  activeKey: string;
  onSelect: (key: string) => void;
}

const W = 320;
const H = 120;
const PAD_X = 14;
const PAD_TOP = 16;
const PAD_BOTTOM = 8;

export function TrendChart({ entries, activeKey, onSelect }: TrendChartProps) {
  if (entries.length < 2) {
    return <p className="py-4 text-sm text-muted-foreground">Cadastre mais meses para ver a evolução.</p>;
  }
  const values = entries.map((e) => e.total);
  const max = Math.max(...values, 1);
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  const points = entries.map((entry, i) => {
    const x = PAD_X + (innerW * i) / (entries.length - 1);
    const y = PAD_TOP + innerH - (entry.total / max) * innerH;
    return { x, y, entry };
  });

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L ${points[points.length - 1].x.toFixed(1)} ${H - PAD_BOTTOM} L ${points[0].x.toFixed(1)} ${H - PAD_BOTTOM} Z`;

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#trendFill)" />
        <path d={line} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p) => (
          <circle
            key={p.entry.key}
            cx={p.x}
            cy={p.y}
            r={p.entry.key === activeKey ? 5 : 3.5}
            fill={p.entry.key === activeKey ? "var(--color-primary)" : "var(--color-card)"}
            stroke="var(--color-primary)"
            strokeWidth="2"
          />
        ))}
      </svg>
      <div className="flex justify-between">
        {entries.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => onSelect(entry.key)}
            className="flex flex-1 flex-col items-center gap-0.5"
          >
            <span className={`text-[10px] font-medium ${entry.key === activeKey ? "text-primary" : "text-muted-foreground"}`}>
              {entry.label.slice(0, 3)}
            </span>
            {entry.key === activeKey && (
              <span className="tnum text-[10px] font-semibold text-foreground">{moneyShort(entry.total)}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
