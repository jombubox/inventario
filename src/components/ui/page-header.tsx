import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 max-w-2xl">
        {eyebrow ? (
          <p className="mb-2 text-label text-link">{eyebrow}</p>
        ) : null}
        <h1 className="break-words text-h1">{title}</h1>
        {description ? (
          <p className="mt-2 break-words text-body text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
