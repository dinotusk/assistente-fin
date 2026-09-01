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
      <path
        d="M10 19.5C10 13.7 12.7 9.5 16 9.5s6 4.2 6 10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="16" cy="20" r="1.4" fill="currentColor" />
    </svg>
  );
}

/** Google's four-color "G" mark, for the "Continuar com Google" button. */
export function GoogleMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

export function BudgetRing({
  percent,
  overBudget,
  size = 88,
}: {
  percent: number;
  overBudget: boolean;
  size?: number;
}) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (percent / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-muted)"
        strokeWidth={stroke - 4}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius - 10}
        fill="none"
        stroke="var(--color-muted)"
        strokeWidth={stroke - 6}
        opacity={0.6}
      />
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
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full", className)}
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={w}
        cy={points[points.length - 1].split(",")[1]}
        r="2.5"
        fill="var(--color-primary)"
      />
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
  {
    children: ReactNode;
    className?: string;
    tone?: PanelTone;
    accent?: PanelAccent;
    "data-testid"?: string;
  }
>(({ children, className, tone = "surface", accent = "none", "data-testid": testId }, ref) => (
  <section
    ref={ref}
    data-testid={testId}
    className={cn(panelToneClass[tone], panelAccentClass[accent], "p-4", className)}
  >
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
      {/* Aval Modern (fintech rebuild) — explicit font-sans overrides the
          base h1-h4 { font-family: Lora } rule: panel titles are functional
          labels, not editorial headings, across every screen that uses
          PanelHead. */}
      <h2 className="flex items-center gap-1.5 font-sans text-sm font-bold uppercase tracking-[0.06em] text-foreground/62">
        {Icon && <Icon className="h-3.5 w-3.5 text-primary/70" strokeWidth={2.4} />}
        {title}
      </h2>
      {action ??
        (hint ? (
          <span className="shrink-0 text-xs font-medium text-muted-foreground">{hint}</span>
        ) : null)}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}

/** Aval Fintech Reconstruction (item 11) — no more glass pill capsule: plain
    text tabs with a bottom-border indicator, the only surface being the
    thin active underline itself. Touch target stays >=44px via min-h-11 on
    each button; visual weight comes down through the removed
    background/padding, not the tap area. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: SegmentedProps<T>) {
  return (
    <div className={cn("no-scrollbar flex items-center gap-4 overflow-x-auto", className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "focus-ring flex min-h-11 shrink-0 items-center border-b-2 px-0.5 text-xs font-semibold transition-colors duration-200",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * P9.5.b — shared row pattern for a horizontal list item (icon + title/value
 * on one line, optional meta line below, optional trailing element). Reuses
 * the same surface/radius/press/focus-ring language every ad hoc card in the
 * Dashboard was already hand-rolling (rounded-2xl bg-secondary/70). Deliberately
 * narrow: it models exactly the icon+title+meta+value+trailing row shape, not
 * a general-purpose card — a differently-structured block (e.g. a 2-column
 * stat card) should stay its own JSX rather than force-fit this component.
 */
export function ListItemCard({
  icon,
  title,
  meta,
  value,
  trailing,
  onClick,
  ariaLabel,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  value?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
}) {
  // Aval Modern (P9.5) — a resting row has no background/card of its own;
  // rows separate by spacing (gap-3 in the list container below) and a
  // hairline divider, not by each being its own boxed surface. A background
  // only appears on hover/press, i.e. as interaction feedback, never at rest.
  const surfaceClassName = cn(
    "flex items-center gap-3 rounded-2xl p-2.5 text-left",
    onClick && "press focus-ring transition-colors hover:bg-secondary/60",
    className,
  );
  const content = (
    <>
      {icon && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <strong className="min-w-0 truncate text-sm font-bold text-foreground">{title}</strong>
          {value && (
            <strong className="tnum shrink-0 text-sm font-bold text-foreground">{value}</strong>
          )}
        </div>
        {meta && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {meta}
          </div>
        )}
      </div>
      {trailing}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={ariaLabel} className={surfaceClassName}>
        {content}
      </button>
    );
  }
  return (
    <div aria-label={ariaLabel} className={surfaceClassName}>
      {content}
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
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        map[status] || map["A pagar"],
      )}
    >
      {status}
    </span>
  );
}
