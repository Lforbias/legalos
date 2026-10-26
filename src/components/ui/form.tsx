import * as React from "react";
import { cn } from "@/lib/utils";

const controlClass =
  "w-full rounded-lg border border-border/90 bg-bg/45 px-3.5 text-sm text-fg placeholder:text-muted/70 shadow-[inset_0_1px_1px_rgba(0,0,0,0.02)] transition-colors focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:opacity-60 aria-[invalid=true]:border-danger";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(controlClass, "h-10", className)} {...props} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(controlClass, "min-h-20 py-2", className)} {...props} />;
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(controlClass, "h-10 pr-8", className)} {...props}>
      {children}
    </select>
  );
});

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
    <label htmlFor={htmlFor} className="block text-[13px] font-medium text-fg/85">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-muted">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
