"use client";

import { useEffect, useRef, useState } from "react";

import { WhatsAppLink } from "@/components/ui/whatsapp-link";

export function ProductQuotation({ href, label, title }: { href: string; label: string; title: string }) {
  const mainRef = useRef<HTMLDivElement>(null);
  const [mainVisible, setMainVisible] = useState(true);
  const [footerVisible, setFooterVisible] = useState(false);

  useEffect(() => {
    const main = mainRef.current;
    const footer = document.querySelector("[data-public-footer]");
    if (!main) return;
    const mainObserver = new IntersectionObserver(([entry]) => { if (entry) setMainVisible(entry.isIntersecting); }, {
      // The public header stays above the scrolling product information.
      rootMargin: "-72px 0px 0px 0px",
    });
    const footerObserver = new IntersectionObserver(([entry]) => { if (entry) setFooterVisible(entry.isIntersecting); });
    mainObserver.observe(main);
    if (footer) footerObserver.observe(footer);
    return () => {
      mainObserver.disconnect();
      footerObserver.disconnect();
    };
  }, []);

  return (
    <>
      <div ref={mainRef} data-product-contact-main className="mt-6 scroll-mt-24">
        <WhatsAppLink href={href} size="lg" className="w-full">{label}</WhatsAppLink>
        <p className="mt-3 text-small text-muted-foreground">
          Solicita tu cotización y confirma disponibilidad, precio y envío por WhatsApp.
        </p>
      </div>
      {!mainVisible && !footerVisible ? (
        <aside aria-label="Cotización de este producto" className="product-contact-bar fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] md:hidden">
          <p className="mb-2 truncate text-xs text-muted-foreground">{title}</p>
          <WhatsAppLink href={href} className="w-full">{label}</WhatsAppLink>
        </aside>
      ) : null}
    </>
  );
}
