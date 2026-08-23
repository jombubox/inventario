import { Badge } from "@/components/ui/badge";
import type { PublicAvailability } from "@/features/catalog/domain/catalog";

export function AvailabilityBadge({ availability }: { availability: PublicAvailability }) {
  const variant =
    availability.key === "IN_STOCK"
      ? "success"
      : availability.key === "LOW_STOCK"
        ? "warning"
        : "neutral";

  return (
    <Badge variant={variant}>
      <span
        className="mr-1.5 size-1.5 rounded-full bg-current"
        aria-hidden="true"
      />
      {availability.label}
    </Badge>
  );
}

