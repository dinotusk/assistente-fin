import { forwardRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export const Panel = forwardRef<HTMLElement, { children: ReactNode; className?: string }>(
  ({ children, className }, ref) => (
    <section ref={ref} className={cn("card-surface p-4", className)}>
      {children}
    </section>
  ),
);
Panel.displayName = "Panel";

export function PanelHead({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="font-display text-[15px] font-bold text-foreground">{title}</h2>
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
    <div className={cn("flex rounded-full bg-muted p-1", className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 rounded-full px-3 py-2 text-sm font-semibold transition-all",
              active ? "bg-card text-primary shadow-soft" : "text-muted-foreground",
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
