import { ArrowLeftRight, LayoutGrid, Settings, Target } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ViewKey } from "@/lib/finance/types";

import { AvalMark } from "./ui";

const items: { key: ViewKey; label: string; Icon: typeof LayoutGrid }[] = [
  { key: "dashboard", label: "Painel", Icon: LayoutGrid },
  { key: "transactions", label: "Gastos", Icon: ArrowLeftRight },
  { key: "priorities", label: "Metas", Icon: Target },
  { key: "settings", label: "Config", Icon: Settings },
];

interface BottomNavProps {
  view: ViewKey;
  onChange: (view: ViewKey) => void;
  onOpenAssistant: () => void;
}

export function BottomNav({ view, onChange, onOpenAssistant }: BottomNavProps) {
  return (
    <nav
      aria-label="Navegação principal"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      {/* P0-FRONTEND-1B.7 — the one permanently-visible glass surface, so it
          gets the strongest tier (glass-nav) and the only backdrop-filter in
          this component; every child below is background/border/shadow only. */}
      <div className="glass-nav pointer-events-auto grid w-full max-w-[416px] grid-cols-5 items-end rounded-2xl px-2 pb-1.5 pt-2">
        <NavButton item={items[0]} active={view === items[0].key} onChange={onChange} />
        <NavButton item={items[1]} active={view === items[1].key} onChange={onChange} />

        <button
          type="button"
          onClick={onOpenAssistant}
          aria-label="Conversar com o Aval"
          aria-current={view === "assistant" ? "page" : undefined}
          className={cn(
            "focus-ring press mx-auto -mt-6 flex h-14 w-14 items-center justify-center rounded-lg shadow-primary transition-colors",
            view === "assistant"
              ? "hero-gradient text-primary-foreground"
              : "bg-primary text-primary-foreground",
          )}
        >
          <AvalMark size={22} className="text-primary-foreground" />
        </button>

        <NavButton item={items[2]} active={view === items[2].key} onChange={onChange} />
        <NavButton item={items[3]} active={view === items[3].key} onChange={onChange} />
      </div>
    </nav>
  );
}

function NavButton({
  item: { key, label, Icon },
  active,
  onChange,
}: {
  item: (typeof items)[number];
  active: boolean;
  onChange: (view: ViewKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(key)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-ring flex min-h-12 flex-col items-center justify-end gap-1 rounded-xl px-1 py-0.5 text-2xs font-semibold transition duration-200 active:scale-95",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {/* Active state reads from the pill + icon weight together, not color
          alone — a "lens" capsule (glass-active: background/border/inset
          highlight, no backdrop-filter of its own) plus a small scale-up,
          not just a color change. */}
      <span
        className={cn(
          "flex h-8 w-10 items-center justify-center rounded-full transition-[scale,background-color,border-color,box-shadow] duration-200",
          active ? "glass-active scale-105" : "scale-100",
        )}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.5 : 2} />
      </span>
      <span>{label}</span>
    </button>
  );
}
