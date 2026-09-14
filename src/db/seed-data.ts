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
  { name: "Pioneer", code: "PIO" },
  { name: "Haier", code: "HAI" },
  { name: "AOC", code: "AOC" },
  { name: "China", code: "CHN" },
  { name: "RCA", code: "RCA" },
  { name: "Blusens", code: "BLU" },
  { name: "Westinghouse", code: "WES" },
  { name: "Vios", code: "VIO" },
  { name: "Digitrex", code: "DIG" },
  { name: "Polaroid", code: "POL" },
  { name: "Funai", code: "FUN" },
  { name: "Mover a México", code: "MAM" },
  { name: "Panasonic", code: "PAN" },
  { name: "HP", code: "HP" },
  { name: "Hitachi", code: "HIT" },
  { name: "Toshiba", code: "TOS" },
  { name: "Infocus", code: "INF" },
  { name: "Aurus", code: "AUR" },
  { name: "Speeler", code: "SPEE" },
  { name: "Olevia", code: "OLE" },
  { name: "Inco", code: "INC" },
  { name: "Kodak", code: "KOD" },
  { name: "Mitsui", code: "MIT" },
  { name: "Supersonic", code: "SUP" },
  { name: "Vizio", code: "VIZ" },
  { name: "Sunbrite TV", code: "SBT" },
  { name: "Supersonica", code: "SUPA" },
  { name: "Spectra", code: "SPRA" },
  { name: "Insignia", code: "INS" },
  { name: "TMK", code: "TMK" },
  { name: "Viore", code: "VIOR" },
  { name: "Daewoo", code: "DAE" },
  { name: "Seiki", code: "SEI" },
  { name: "Rowa", code: "ROW" },
  { name: "Dynex", code: "DYN" },
  { name: "Element", code: "ELE" },
  { name: "Envision", code: "ENV" },
  { name: "EKT", code: "EKT" },
  { name: "Ghia", code: "GHI" },
  { name: "Proscan", code: "PRO" },
  { name: "Naxa", code: "NAX" },
  { name: "Dinex", code: "DIN" },
  { name: "Sharp", code: "SHA" },
  { name: "JVC", code: "JVC" },
  { name: "ONN", code: "ONN" },
  { name: "Konka", code: "KON" },
  { name: "Hiteker", code: "HIK" },
  { name: "Fanco", code: "FAN" },
  { name: "Jensen", code: "JEN" },
  { name: "Hyundai", code: "HYU" },
  { name: "Sanyo", code: "SAY" },
  { name: "Emerson", code: "EME" },
  { name: "Akai", code: "AKA" },
  { name: "DELL", code: "DEL" },
  { name: "Digital Stream", code: "DGS" },
  { name: "Komodo TV", code: "KTV" },
  { name: "Magnavox", code: "MAG" },
  { name: "Hk Pro", code: "HKP" },
  { name: "Quasar", code: "QUA" },
  { name: "Spectre", code: "SPRE" },
  { name: "MSI", code: "MSI" },
  { name: "Speler", code: "SPEL" },
  { name: "Memorex", code: "MEM" },
  { name: "Asus", code: "ASU" },
  { name: "Silo", code: "SIL" },
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
