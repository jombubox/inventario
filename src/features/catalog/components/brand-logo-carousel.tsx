"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { buttonStyles } from "@/components/ui/button";
import type { BrandLogo } from "@/features/catalog/domain/brand-logos";

export function BrandLogoCarousel({ title, description, logos, compact = false }: {
  title: string; description: string; logos: readonly BrandLogo[]; compact?: boolean;
}) {
  const id = useId();
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const update = () => setEdges({ start: element.scrollLeft <= 1, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 1 });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    update();
    return () => { observer.disconnect(); element.removeEventListener("scroll", update); };
  }, []);
  function navigate(direction: number) {
    const element = track.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  return (
    <section aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} className={`min-w-0 px-5 sm:px-8 lg:px-10 ${compact ? "py-6 sm:py-8" : "py-8 sm:py-10"}`}>
      <div className="mx-auto min-w-0 max-w-7xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id={`${id}-title`} className="text-h3 text-navy">{title}</h2>
            <p id={`${id}-description`} className="mt-2 text-small text-muted-foreground">{description}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" aria-label={`Anterior · ${title}`} aria-controls={`${id}-logos`} disabled={edges.start} onClick={() => navigate(-1)} className={buttonStyles({ variant: "outline", size: "sm", className: "min-h-11 min-w-11" })}>←</button>
            <button type="button" aria-label={`Siguiente · ${title}`} aria-controls={`${id}-logos`} disabled={edges.end} onClick={() => navigate(1)} className={buttonStyles({ variant: "outline", size: "sm", className: "min-h-11 min-w-11" })}>→</button>
          </div>
        </div>
        <ul ref={track} id={`${id}-logos`} tabIndex={0} aria-label={`Logotipos · ${title}`} onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); navigate(event.key === "ArrowRight" ? 1 : -1); }
          if (event.key === "Home" || event.key === "End") { event.preventDefault(); track.current?.scrollTo({ left: event.key === "Home" ? 0 : track.current.scrollWidth }); }
        }} className="mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain rounded-lg pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-8">
          {logos.map((logo) => <li key={logo.src} className="flex h-24 w-44 shrink-0 snap-start items-center justify-center rounded-lg bg-white px-5 sm:h-28 sm:w-52 sm:px-6">
            <Image src={logo.src} alt={logo.name} width={logo.width} height={logo.height} unoptimized className="h-auto max-h-12 w-auto max-w-full object-contain sm:max-h-14" />
          </li>)}
        </ul>
      </div>
    </section>
  );
}
