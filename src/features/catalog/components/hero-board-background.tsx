import Image from "next/image";

export function HeroBoardBackground() {
  return <div data-hero-boards aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
    <Image src="/images/hero-electronics.png" alt="" fill sizes="100vw" className="hero-board-image object-cover object-right" />
    <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/10" />
    <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/30" />
  </div>;
}
