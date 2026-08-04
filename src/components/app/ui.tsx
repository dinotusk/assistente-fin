import { forwardRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Aval's mark: an arch with a dot, in a thin circle — used wherever the brand itself is shown, not user avatars. */
export function AvalMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={cn("text-primary", className)}
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="14.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 19.5C10 13.7 12.7 9.5 16 9.5s6 4.2 6 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="20" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function BudgetRing({ percent, overBudget, size = 88 }: { percent: number; overBudget: boolean; size?: number }) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (percent / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-muted)" strokeWidth={stroke - 4} />
      <circle cx={size / 2} cy={size / 2} r={radius - 10} fill="none" stroke="var(--color-muted)" strokeWidth={stroke - 6} opacity={0.6} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={overBudget ? "var(--color-destructive)" : "var(--color-primary)"}
        strokeWidth={stroke - 4}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 120;
  const h = 32;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * w;
    const y = h - ((value - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none">
      <polyline points={points.join(" ")} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={points[points.length - 1].split(",")[1]} r="2.5" fill="var(--color-primary)" />
    </svg>
  );
}

type PanelTone = "surface" | "flat" | "elevated";
type PanelAccent = "none" | "primary" | "success" | "warning" | "destructive";

const panelToneClass: Record<PanelTone, string> = {
  surface: "card-surface",
  flat: "panel-flat",
  elevated: "panel-elevated",
};

const panelAccentClass: Record<PanelAccent, string> = {
  none: "",
  primary: "border-t-2 border-t-primary/55",
  success: "border-t-2 border-t-success/55",
  warning: "border-t-2 border-t-warning/55",
  destructive: "border-t-2 border-t-destructive/55",
};

export const Panel = forwardRef<
  HTMLElement,
  { children: ReactNode; className?: string; tone?: PanelTone; accent?: PanelAccent }
>(({ children, className, tone = "surface", accent = "none" }, ref) => (
  <section ref={ref} className={cn(panelToneClass[tone], panelAccentClass[accent], "p-4", className)}>
    {children}
  </section>
));
Panel.displayName = "Panel";

export function PanelHead({
  title,
  hint,
  action,
  icon: Icon,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.06em] text-foreground/62">
        {Icon && <Icon className="h-3.5 w-3.5 text-primary/70" strokeWidth={2.4} />}
        {title}
      </h2>
      {action ?? (hint ? <span className="shrink-0 text-xs font-medium text-muted-foreground">{hint}</span> : null)}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}

export function Segmented<T extends string>({ value, options, onChange, className }: SegmentedProps<T>) {
  return (
    <div className={cn("no-scrollbar flex overflow-x-auto rounded-full border border-white/8 bg-white/[0.035] p-1", className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "focus-ring min-w-fit shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-[0.97]",
              active
                ? "bg-primary text-primary-foreground shadow-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Pago: "bg-success/12 text-success",
    "A pagar": "bg-warning/15 text-warning",
    Adiar: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", map[status] || map["A pagar"])}>
      {status}
    </span>
  );
}
