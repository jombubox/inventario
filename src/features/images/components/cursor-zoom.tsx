"use client";

import { type ReactNode, useRef } from "react";

export function CursorZoom({ children, className = "", label }: {
  children: ReactNode; className?: string; label?: string;
}) {
  const imageRef = useRef<HTMLDivElement>(null);
  return <div aria-label={label} className={`relative overflow-hidden cursor-zoom-in ${className}`}
    onPointerMove={(event) => {
      if (event.pointerType !== "mouse" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const element = imageRef.current;
      if (!element || !bounds.width || !bounds.height) return;
      element.style.transformOrigin = `${Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100))}% ${Math.max(0, Math.min(100, (event.clientY - bounds.top) / bounds.height * 100))}%`;
      element.style.transform = "scale(2.25)";
    }}
    onPointerLeave={() => { if (imageRef.current) imageRef.current.style.transform = "scale(1)"; }}>
    <div ref={imageRef} data-product-zoom className="absolute inset-0 transition-transform duration-150 ease-out motion-reduce:transition-none">{children}</div>
  </div>;
}
