import { LayoutGrid, ArrowLeftRight, Target, Settings } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ViewKey } from "@/lib/finance/types";

import { AvalMark } from "./ui";

// P0-FRONTEND-1B.7 — Icon is null for "assistant": that row renders AvalMark
// instead (see the render loop below), since the assistant is the Aval
// brand itself, not a generic nav glyph.
// P9.4: Metas uses the same Target glyph as BottomNav.tsx — previously Star
// here vs. Target there, the one icon-consistency gap the P9 audit flagged.
export const NAV_ITEMS: { key: ViewKey; label: string; Icon: typeof LayoutGrid | null }[] = [
  { key: "dashboard", label: "Painel", Icon: LayoutGrid },
  { key: "assistant", label: "Aval", Icon: null },
  { key: "transactions", label: "Gastos", Icon: ArrowLeftRight },
  { key: "priorities", label: "Metas", Icon: Target },
  { key: "settings", label: "Config", Icon: Settings },
];

export function SideNav({
  view,
  onChange,
  footer,
}: {
  view: ViewKey;
  onChange: (v: ViewKey) => void;
  footer?: React.ReactNode;
}) {
  return (
    <aside className="sticky top-0 flex h-dvh w-[248px] shrink-0 flex-col gap-1 border-r border-border/70 bg-card/60 px-4 py-6 backdrop-blur-xl">
      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-card ring-1 ring-primary/25">
          <AvalMark size={22} />
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-base text-foreground">Aval</p>
          <p className="truncate text-xs text-muted-foreground">Assistente financeiro</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ key, label, Icon }) => {
          const active = view === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={cn(
                "focus-ring press flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-bold transition-colors duration-200",
                active
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl transition-colors",
                  active ? "bg-primary/15" : "bg-transparent",
                )}
              >
                {Icon ? (
                  <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.5 : 2} />
                ) : (
                  <AvalMark
                    size={18}
                    className={active ? "text-primary" : "text-muted-foreground"}
                  />
                )}
              </span>
              {label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto">{footer}</div>
    </aside>
  );
}
