"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useRef, useTransition } from "react";

import { Input } from "@/components/ui/input";

// Serialize the whole form so search, filters, sorting and page size stay together.
export function listFilterParams(data: FormData) {
  const params = new URLSearchParams();
  for (const [name, value] of data) {
    if (typeof value !== "string" || name === "page") continue;
    const trimmed = value.trim();
    if (trimmed) params.set(name, trimmed);
  }
  return params;
}

export function AdminListFilters({ children, className, label, placeholder }: {
  children: ReactNode; className: string; label: string; placeholder: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestedParams = useRef<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    // Back/forward and pagination must also update the uncontrolled form.
    if (timer.current) return;
    // A response to the previous search must not overwrite a newer typed query.
    if (requestedParams.current !== null && requestedParams.current !== searchParams.toString()) return;
    requestedParams.current = null;
    for (const element of Array.from(formRef.current?.elements ?? [])) {
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
        const defaultValue = element instanceof HTMLInputElement ? element.defaultValue :
          Array.from(element.options).find((option) => option.defaultSelected)?.value ?? "";
        element.value = searchParams.get(element.name) ?? defaultValue;
      }
    }
  }, [searchParams]);

  function navigate() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!formRef.current) return;
    const params = listFilterParams(new FormData(formRef.current));
    requestedParams.current = params.toString();
    startTransition(() => router.replace(`${pathname}?${params}`, { scroll: false }));
  }

  return (
    <form ref={formRef} method="get" className={className} aria-busy={pending}
      onSubmit={(event) => { event.preventDefault(); navigate(); }}
      onChange={(event) => {
        if (timer.current) clearTimeout(timer.current);
        if (event.target instanceof HTMLInputElement && event.target.name === "q") timer.current = setTimeout(navigate, 250);
        else navigate();
      }}>
      <Input type="search" name="q" aria-label={label} maxLength={100}
        defaultValue={searchParams.get("q") ?? ""} placeholder={placeholder} className="md:col-span-2" />
      {children}
      <p role="status" className="text-xs text-muted-foreground">{pending ? "Buscando…" : ""}</p>
    </form>
  );
}
