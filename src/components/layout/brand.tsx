import Image from "next/image";

import { cn } from "@/lib/cn";

type BrandProps = {
  admin?: boolean;
  className?: string;
};

export function Brand({ admin = false, className }: BrandProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src="/logo.svg"
        alt="JombuBox"
        width={5517}
        height={1184}
        className={cn("h-auto", admin ? "w-28 sm:w-36" : "w-36 sm:w-40")}
      />
      {admin ? (
        <span className="rounded-md bg-primary-soft px-2 py-1 text-label text-primary-active">
          Admin
        </span>
      ) : null}
    </span>
  );
}
