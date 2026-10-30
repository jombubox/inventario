"use client";

import { useId, useState, type CSSProperties } from "react";
import Image from "next/image";
import type { BrandLogo } from "@/features/catalog/domain/brand-logos";
import styles from "./brand-logo-carousel.module.css";

export function BrandLogoCarousel({ title, description, logos, compact = false }: {
  title: string; description: string; logos: readonly BrandLogo[]; compact?: boolean;
}) {
  const id = useId();
  const [paused, setPaused] = useState(false);
  // Fill at least the 1280px content width, including the shorter shipping row.
  const repetitions = logos.length ? Math.ceil(8 / logos.length) : 0;
  const trackLogos = Array.from({ length: repetitions }, () => logos).flat();

  if (!logos.length) return null;

  return (
    <section aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} className={`min-w-0 px-5 sm:px-8 lg:px-10 ${compact ? "py-6 sm:py-8" : "py-8 sm:py-10"}`}>
      <div className="mx-auto min-w-0 max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div>
            <h2 id={`${id}-title`} className="text-h3 text-navy">{title}</h2>
            <p id={`${id}-description`} className="mt-2 text-small text-muted-foreground">{description}</p>
          </div>
          <button
            type="button"
            aria-controls={`${id}-logos`}
            onClick={() => setPaused((value) => !value)}
            className={`${styles.pause} min-h-11 rounded-lg px-2 text-small text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
          >
            {paused ? "Reanudar movimiento" : "Pausar movimiento"}
            <span className="sr-only"> · {title}</span>
          </button>
        </div>
        <div id={`${id}-logos`} className={`${styles.viewport} mt-5`} data-paused={paused}>
          <div className={styles.track} style={{ "--marquee-duration": `${trackLogos.length * 10}s` } as CSSProperties}>
            {[false, true].map((duplicate) => (
              <ul key={String(duplicate)} aria-hidden={duplicate || undefined} aria-label={duplicate ? undefined : `Logotipos · ${title}`} className={`${styles.group} ${duplicate ? styles.duplicate : ""}`}>
                {trackLogos.map((logo, index) => {
                  const repeated = index >= logos.length;
                  return (
                    <li key={`${logo.src}-${index}`} aria-hidden={repeated || undefined} data-duplicate={repeated || undefined} className={styles.logo}>
                      <Image src={logo.src} alt={duplicate || repeated ? "" : logo.name} width={logo.width} height={logo.height} unoptimized loading="eager" className="h-auto max-h-10 w-auto max-w-full object-contain sm:max-h-12" />
                    </li>
                  );
                })}
              </ul>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
