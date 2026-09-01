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
      {/* Aval Modern (fintech rebuild) — smaller footprint (less padding,
          smaller icons/labels, smaller central button) and the central
          button is a plain primary (green) fill now, never the gold
          hero-gradient — the "big beige square" the redesign brief called
          out by name. Still the one permanently-visible glass surface, so
          it keeps the strongest tier (glass-nav) and the only
          backdrop-filter in this component. */}
      <div className="glass-nav pointer-events-auto grid w-full max-w-[380px] grid-cols-5 items-end rounded-2xl px-1.5 pb-1 pt-1.5">
        <NavButton item={items[0]} active={view === items[0].key} onChange={onChange} />
        <NavButton item={items[1]} active={view === items[1].key} onChange={onChange} />

        <button
          type="button"
          onClick={onOpenAssistant}
          aria-label="Conversar com o Aval"
          aria-current={view === "assistant" ? "page" : undefined}
          className="press focus-ring mx-auto -mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-primary transition-colors"
        >
          <AvalMark size={18} className="text-primary-foreground" />
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
        "focus-ring flex min-h-11 flex-col items-center justify-end gap-0.5 rounded-lg px-1 py-0.5 text-2xs font-semibold transition duration-200 active:scale-95",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {/* Active state reads from the pill + icon weight together, not color
          alone — a "lens" capsule (glass-active: background/border/inset
          highlight, no backdrop-filter of its own) plus a small scale-up,
          not just a color change. */}
      <span
        className={cn(
          "flex h-6 w-8 items-center justify-center rounded-full transition-[scale,background-color,border-color,box-shadow] duration-200",
          active ? "glass-active scale-105" : "scale-100",
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={active ? 2.5 : 2} />
      </span>
      <span>{label}</span>
    </button>
  );
}
