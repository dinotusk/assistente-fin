import type { ReactNode } from "react";

const inputClass =
  "h-12 w-full rounded-xl border border-input bg-secondary px-4 text-base text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClass} />;
}

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
