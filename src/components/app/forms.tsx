import { forwardRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const inputClass =
  "h-12 w-full rounded-xl border border-input bg-secondary px-4 text-base text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/70 focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/12";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input {...props} ref={ref} className={cn(inputClass, className)} />,
);
TextInput.displayName = "TextInput";

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} h-auto py-3`} />;
}

export function SelectInput({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${inputClass} appearance-none bg-[right_1rem_center] bg-no-repeat pr-10`}>
      {children}
    </select>
  );
}
