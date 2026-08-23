import { normalizeBrand, normalizeComponentType } from "@/features/products/domain/product-normalization";
import { slugify } from "@/features/shared/domain/text-normalization";
import { toBrandRecord, toComponentTypeRecord } from "@/validators/catalog";

export const initialBrands = [
  { name: "Samsung", code: "SAM" },
  { name: "LG", code: "LG" },
  { name: "Hisense", code: "HIS" },
  { name: "Sony", code: "SNY" },
  { name: "TCL", code: "TCL" },
  { name: "Philips", code: "PHI" },
  { name: "Atvio", code: "ATV" },
  { name: "Sansui", code: "SAN" },
  { name: "Alux", code: "ALX" },
  { name: "Cobia", code: "COB" },
] as const;

export const initialComponentTypes = [
  { name: "Mainboard", code: "MB" },
  { name: "Fuente", code: "PSU" },
  { name: "T-Con", code: "TCON" },
  { name: "Botonera", code: "BTN" },
  { name: "Tarjeta Única", code: "TU" },
  { name: "Infrarrojo", code: "IR" },
  { name: "Inverter", code: "INV" },
  { name: "Joystick", code: "JOY" },
] as const;

export const initialBrandAliases = [
  { alias: "HISSENSE", target: "HISENSE" },
] as const;

export const initialComponentTypeAliases = [
  { alias: "T-COM", target: "T-CON" },
  { alias: "T. U.", target: "TARJETA UNICA" },
  { alias: "T.U.", target: "TARJETA UNICA" },
] as const;

export const brandSeedRecords = initialBrands.map((brand) => toBrandRecord(brand));

export const componentTypeSeedRecords = initialComponentTypes.map((componentType) =>
  toComponentTypeRecord(componentType),
);

export const brandAliasSeedRecords = initialBrandAliases.map(({ alias, target }) => ({
  alias,
  normalizedAlias: normalizeBrand(alias),
  targetNormalizedName: normalizeBrand(target),
}));

export const componentTypeAliasSeedRecords = initialComponentTypeAliases.map(
  ({ alias, target }) => ({
    alias,
    normalizedAlias: normalizeComponentType(alias),
    targetNormalizedName: normalizeComponentType(target),
  }),
);

export function assertSeedDataIsInternallyUnique(): void {
  const groups = [
    brandSeedRecords.map(({ normalizedName }) => normalizedName),
    brandSeedRecords.map(({ code }) => code),
    brandSeedRecords.map(({ slug }) => slug),
    componentTypeSeedRecords.map(({ normalizedName }) => normalizedName),
    componentTypeSeedRecords.map(({ code }) => code),
    componentTypeSeedRecords.map(({ slug }) => slug),
    brandAliasSeedRecords.map(({ normalizedAlias }) => normalizedAlias),
    componentTypeAliasSeedRecords.map(({ normalizedAlias }) => normalizedAlias),
  ];

  for (const values of groups) {
    if (new Set(values).size !== values.length) {
      throw new Error(`Seed data contains duplicate keys: ${values.join(", ")}`);
    }
  }

  for (const record of [...brandSeedRecords, ...componentTypeSeedRecords]) {
    if (record.slug !== slugify(record.name)) {
      throw new Error(`Seed slug is inconsistent for ${record.name}.`);
    }
  }
}
