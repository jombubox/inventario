import type { AnchorHTMLAttributes } from "react";

import { buttonStyles, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { buildWhatsAppUrl, genericContactMessage } from "@/config/contact";

export function ChatIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5 shrink-0">
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9.5 9.5 0 0 1-4-.9L3 21l1.9-5.5a9.5 9.5 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8v.5Z" />
      <path d="M8.5 10h7M8.5 14H13" />
    </svg>
  );
}

type WhatsAppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target" | "rel"> & {
  href?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function WhatsAppLink({ href = buildWhatsAppUrl(genericContactMessage), children, className, variant, size, ...props }: WhatsAppLinkProps) {
  return (
    <a {...props} href={href} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant, size, className })}>
      <ChatIcon />
      {children}
      <span className="sr-only"> (abre WhatsApp en otra pestaña)</span>
    </a>
  );
}
