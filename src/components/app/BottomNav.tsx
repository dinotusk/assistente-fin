import { ArrowLeftRight, LayoutGrid, Settings, Sparkles, Target } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ViewKey } from "@/lib/finance/types";

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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto grid w-full max-w-[416px] grid-cols-5 items-end rounded-[1.45rem] border border-primary/15 bg-popover/95 px-2 pb-2 pt-2.5 shadow-float backdrop-blur-[22px]">
        <NavButton item={items[0]} active={view === items[0].key} onChange={onChange} />
        <NavButton item={items[1]} active={view === items[1].key} onChange={onChange} />

        <button
          type="button"
          onClick={onOpenAssistant}
          aria-label="Conversar com o Aval"
          aria-current={view === "assistant" ? "page" : undefined}
          className={cn(
            "focus-ring press mx-auto -mt-7 flex h-14 w-14 items-center justify-center rounded-[1.25rem] shadow-primary transition-colors",
            view === "assistant"
              ? "hero-gradient text-primary-foreground"
              : "bg-primary text-primary-foreground",
          )}
        >
          <Sparkles className="h-6 w-6" strokeWidth={2.4} />
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
        "focus-ring flex min-h-12 flex-col items-center justify-end gap-1 rounded-xl px-1 py-1 text-[9px] font-semibold transition duration-200 active:scale-95",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.5 : 2} />
      <span>{label}</span>
      <span className={cn("h-1 w-1 rounded-full", active ? "bg-primary" : "bg-transparent")} />
    </button>
  );
}
