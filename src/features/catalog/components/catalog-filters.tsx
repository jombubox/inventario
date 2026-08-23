import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  conditionLabels,
  publicConditionValues,
} from "@/features/catalog/domain/catalog";
import type { CatalogSearchParams } from "@/features/catalog/domain/catalog-query";
import type { PublicCatalogOptionDTO } from "@/features/catalog/data/public-catalog-queries";

type CatalogFiltersProps = {
  query: CatalogSearchParams;
  brands: PublicCatalogOptionDTO[];
  componentTypes: PublicCatalogOptionDTO[];
  idPrefix: string;
};

function HiddenContext({ query }: { query: CatalogSearchParams }) {
  return (
    <>
      {query.q ? <input type="hidden" name="q" value={query.q} /> : null}
      {query.sort !== "recientes" ? <input type="hidden" name="sort" value={query.sort} /> : null}
    </>
  );
}

export function CatalogFilters({ query, brands, componentTypes, idPrefix }: CatalogFiltersProps) {
  return (
    <form action="/catalogo" method="get" className="space-y-5">
      <HiddenContext query={query} />

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-brand`}>Marca</Label>
        <Select id={`${idPrefix}-brand`} name="marca" defaultValue={query.marca ?? ""}>
          <option value="">Todas las marcas</option>
          {brands.map((brand) => (
            <option key={brand.slug} value={brand.slug}>
              {brand.name} ({brand.productCount})
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-type`}>Tipo de componente</Label>
        <Select id={`${idPrefix}-type`} name="tipo" defaultValue={query.tipo ?? ""}>
          <option value="">Todos los tipos</option>
          {componentTypes.map((type) => (
            <option key={type.slug} value={type.slug}>
              {type.name} ({type.productCount})
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-model`}>Modelo compatible</Label>
        <Input
          id={`${idPrefix}-model`}
          name="modelo"
          defaultValue={query.modelo ?? ""}
          placeholder="Ej. UN55NU7100"
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-condition`}>Condición disponible</Label>
        <Select
          id={`${idPrefix}-condition`}
          name="condicion"
          defaultValue={query.condicion ?? ""}
        >
          <option value="">Cualquier condición</option>
          {publicConditionValues.map((condition) => (
            <option key={condition} value={condition}>
              {conditionLabels[condition]}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-availability`}>Disponibilidad</Label>
        <Select
          id={`${idPrefix}-availability`}
          name="disponibilidad"
          defaultValue={query.disponibilidad ?? ""}
        >
          <option value="">Cualquier disponibilidad</option>
          <option value="disponible">Disponible</option>
          <option value="pocas">Pocas piezas</option>
          <option value="agotado">Agotado</option>
        </Select>
      </div>

      <fieldset>
        <legend className="text-label text-foreground">Precio de venta</legend>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor={`${idPrefix}-price-min`} className="sr-only">
              Precio mínimo
            </Label>
            <Input
              id={`${idPrefix}-price-min`}
              name="precioMin"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              defaultValue={query.precioMin}
              placeholder="Mín."
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-price-max`} className="sr-only">
              Precio máximo
            </Label>
            <Input
              id={`${idPrefix}-price-max`}
              name="precioMax"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              defaultValue={query.precioMax}
              placeholder="Máx."
            />
          </div>
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3 pt-2">
        <Link href="/catalogo" className={buttonStyles({ variant: "outline" })}>
          Limpiar
        </Link>
        <button type="submit" className={buttonStyles()}>
          Aplicar
        </button>
      </div>
    </form>
  );
}

