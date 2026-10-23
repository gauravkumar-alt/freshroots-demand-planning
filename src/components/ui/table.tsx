import * as React from "react";
import { cn } from "@/lib/utils";

/** Dense data table with sticky header; scrolls horizontally inside its own container. */
export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  );
}

export function Th({ className, children, align = "left", ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  return (
    <th
      className={cn(
        "sticky top-0 z-[1] whitespace-nowrap border-b border-line bg-sunken px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({ className, children, align = "left", ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  return (
    <td
      className={cn("border-b border-line px-3 py-2 align-middle", align === "right" ? "text-right tnum" : align === "center" ? "text-center" : "", className)}
      {...props}
    >
      {children}
    </td>
  );
}
