import type { Metadata } from "next";
import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { ChatIcon, WhatsAppLink } from "@/components/ui/whatsapp-link";
import { contact } from "@/config/contact";

const title = `Contáctanos | ${contact.businessName}`;
const description = "Solicita cotizaciones de refacciones electrónicas por WhatsApp. Consulta disponibilidad, precio, envío o ayuda para identificar tu pieza.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/contacto" },
  openGraph: { title, description, url: "/contacto", type: "website", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: contact.businessName }] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
};

export default function ContactPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
      <p className="text-label uppercase tracking-[0.14em] text-primary">Hablemos de tu próxima pieza</p>
      <h1 className="mt-3 text-h1 text-navy">Contáctanos</h1>
      <p className="mt-5 max-w-2xl text-body text-muted-foreground sm:text-lg">
        ¿Buscas una pieza electrónica o necesitas una cotización? Escríbenos por WhatsApp y te ayudamos a encontrar lo que necesitas.
      </p>
      <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12">
        <section aria-labelledby="whatsapp-contact-title" className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <span className="inline-flex rounded-xl bg-primary-soft p-3 text-primary-active"><ChatIcon /></span>
          <h2 id="whatsapp-contact-title" className="mt-5 text-h2 text-navy">Atención por WhatsApp</h2>
          <p className="mt-3 max-w-lg text-body text-muted-foreground">Solicita cotizaciones, consulta disponibilidad y opciones de envío o pregunta por una pieza.</p>
          <p className="mt-6 font-mono text-lg font-semibold text-foreground">{contact.displayPhone}</p>
          <WhatsAppLink size="lg" className="mt-5 min-h-12 w-full py-3 text-center sm:w-auto" style={{ height: "auto", whiteSpace: "normal" }}>Enviar mensaje por WhatsApp</WhatsAppLink>
          <p className="mt-3 text-small text-muted-foreground">Se abrirá un mensaje preparado. Puedes revisarlo antes de enviarlo.</p>
        </section>
        <section className="py-2">
          <h2 className="text-h3 text-navy">Ayúdanos a identificar tu refacción</h2>
          <ul className="mt-5 space-y-4 text-body text-muted-foreground">
            <li>Comparte el número de parte o una fotografía legible de la pieza por WhatsApp.</li>
            <li>Incluye la marca y el modelo del equipo, si los conoces.</li>
            <li>Si ya encontraste un producto, usa su botón de WhatsApp: el mensaje incluirá su nombre, SKU y enlace.</li>
          </ul>
          <Link href="/catalogo" className={buttonStyles({ variant: "outline", className: "mt-7" })}>Explorar el catálogo <span aria-hidden="true">→</span></Link>
        </section>
      </div>
    </div>
  );
}
