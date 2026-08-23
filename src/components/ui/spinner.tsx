import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type SpinnerProps = HTMLAttributes<HTMLSpanElement> & {
  label?: string;
};

export function Spinner({ className, label, ...props }: SpinnerProps) {
  return (
    <span
      className={cn(
        "inline-flex size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent",
        className,
      )}
      role={label ? "status" : undefined}
      aria-hidden={label ? undefined : true}
      {...props}
    >
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
