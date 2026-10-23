import * as React from "react";
import { cn } from "@/lib/utils";

const field = "h-8 rounded-[5px] border border-line-2 bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(field, className)} {...props} />
));
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(field, "pr-7", className)} {...props} />
));
Select.displayName = "Select";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(field, "h-auto min-h-[72px] py-2 leading-snug", className)} {...props} />
));
Textarea.displayName = "Textarea";

export function Label({ children, htmlFor, className }: { children: React.ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3", className)}>
      {children}
    </label>
  );
}
