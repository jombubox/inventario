"use client";
import { Button } from "@/components/ui/button";
export default function SalesError({ reset }: { reset: () => void }) { return <div className="space-y-4 p-6"><h2 className="text-h3">No fue posible cargar las ventas</h2><p>Revisa la conexión e intenta de nuevo.</p><Button onClick={reset}>Reintentar</Button></div>; }
