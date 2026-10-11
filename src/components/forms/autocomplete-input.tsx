"use client";

import { useEffect, useId, useRef, useState, type Ref } from "react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export type AutocompleteOption = { id: string; label: string };

export function AutocompleteInput({ id, label, placeholder, query, onQueryChange, options, onSelect, createLabel, onCreate, emptyMessage, loading, disabled, invalid, inputRef }: {
  id: string; label: string; placeholder: string; query: string; onQueryChange: (query: string) => void;
  options: AutocompleteOption[]; onSelect: (id: string) => void; createLabel?: string; onCreate?: () => void;
  emptyMessage?: string; loading?: boolean; disabled?: boolean; invalid?: boolean; inputRef?: Ref<HTMLInputElement>;
}) {
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => {
    // Close after the outside click completes. Closing on blur can shrink a
    // centered wizard between pointerdown and pointerup and swallow Back/Next.
    const outsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) setExpanded(false);
    };
    document.addEventListener("click", outsideClick);
    return () => document.removeEventListener("click", outsideClick);
  }, []);
  const count = options.length + (createLabel ? 1 : 0);
  const selectedIndex = Math.min(active, Math.max(0, count - 1));
  function select(index: number) {
    if (options[index]) onSelect(options[index].id);
    else onCreate?.();
    setExpanded(false);
    setActive(0);
  }
  return <div ref={wrapperRef} className="relative min-w-0">
    <Input ref={inputRef} id={id} aria-label={label} placeholder={placeholder} value={query} autoComplete="off" disabled={disabled}
      role="combobox" aria-expanded={expanded} aria-controls={listId} aria-autocomplete="list" aria-invalid={invalid}
      aria-activedescendant={expanded && count ? `${listId}-${selectedIndex}` : undefined}
      onChange={(event) => { onQueryChange(event.target.value); setExpanded(true); setActive(0); }}
      onFocus={() => setExpanded(true)} className="pr-10"
      onKeyDown={(event) => {
        if (event.key === "Tab") setExpanded(false);
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setExpanded(false); }
        if (event.key === "Enter") { event.preventDefault(); if (expanded && count && !loading) select(selectedIndex); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setExpanded(true);
          if (count) setActive((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + count) % count);
        }
      }} />
    {loading ? <Spinner className="absolute right-3 top-3.5 text-link" /> : null}
    {expanded ? <div id={listId} role="listbox" aria-label="Opciones sugeridas" className="z-20 mt-2 max-h-64 overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-lg">
      {options.map((option, index) => <button key={option.id} id={`${listId}-${index}`} type="button" role="option" aria-selected={index === selectedIndex}
        className="block min-h-11 w-full break-words rounded-lg px-3 py-2 text-left text-small hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-selected:bg-primary-soft"
        onMouseDown={(event) => event.preventDefault()} onClick={() => select(index)}>{option.label}</button>)}
      {!options.length && !loading && emptyMessage ? <p className="px-3 py-2 text-small text-muted-foreground">{emptyMessage}</p> : null}
      {createLabel ? <button id={`${listId}-${options.length}`} type="button" role="option" aria-selected={selectedIndex === options.length} disabled={loading || disabled}
        className="mt-1 min-h-11 w-full break-words rounded-lg px-3 py-2 text-left text-small font-semibold text-link aria-selected:bg-primary-soft"
        onMouseDown={(event) => event.preventDefault()} onClick={() => select(options.length)}>{createLabel}</button> : null}
    </div> : null}
  </div>;
}
