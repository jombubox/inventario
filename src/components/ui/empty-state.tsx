import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <section
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-border bg-background px-6 py-12 text-center",
        className,
      )}
    >
      <span
        className="mb-4 grid size-11 place-items-center rounded-xl bg-primary-soft text-primary"
        aria-hidden="true"
      >
        <span className="brand-mark-icon scale-75" />
      </span>
      <h2 className="text-h3">{title}</h2>
      <p className="mt-2 max-w-md text-small text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}
