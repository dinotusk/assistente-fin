import { forwardRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const inputClass =
  "h-12 w-full rounded-xl border border-input bg-secondary px-4 text-base text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/70 focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/12";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input {...props} ref={ref} className={cn(inputClass, className)} />
  ),
);
TextInput.displayName = "TextInput";

export function TextArea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, "h-auto py-3", className)} />;
}

const chevronBg =
  "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b7a70%22 stroke-width=%222.2%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')]";

export function SelectInput({
  children,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        inputClass,
        "appearance-none bg-[right_0.9rem_center] bg-no-repeat pr-10",
        chevronBg,
        className,
      )}
    >
      {children}
    </select>
  );
}
