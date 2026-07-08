import { LayoutGrid, ArrowLeftRight, Star, Sparkles, Settings } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ViewKey } from "@/lib/finance/types";

const items: { key: ViewKey; label: string; Icon: typeof LayoutGrid }[] = [
  { key: "assistant", label: "Início", Icon: Sparkles },
  { key: "dashboard", label: "Painel", Icon: LayoutGrid },
  { key: "transactions", label: "Gastos", Icon: ArrowLeftRight },
  { key: "priorities", label: "Metas", Icon: Star },
  { key: "settings", label: "Config", Icon: Settings },
];

export function BottomNav({ view, onChange }: { view: ViewKey; onChange: (v: ViewKey) => void }) {
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex w-full max-w-[440px] items-center justify-between rounded-[28px] border border-border bg-card/95 px-2 py-2 shadow-float backdrop-blur">
        {items.map(({ key, label, Icon }) => {
          const active = view === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-2xl py-1.5 transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full transition-all",
                  active && "bg-primary-soft",
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.5 : 2} />
              </span>
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
