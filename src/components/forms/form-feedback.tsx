import type { MutationState } from "@/features/shared/domain/mutation-state";
import { cn } from "@/lib/cn";

export function FormFeedback({ state }: { state: MutationState }) {
  if (!state.message) return null;

  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-4 py-3 text-small",
        state.status === "error"
          ? "border-danger/25 bg-danger/5 text-danger"
          : "border-success/25 bg-success/5 text-success",
      )}
    >
      {state.message}
    </p>
  );
}

export function FieldError({ errors, id }: { errors?: string[]; id?: string }) {
  if (!errors?.[0]) return null;
  return (
    <p id={id} className="mt-1.5 text-small text-danger">
      {errors[0]}
    </p>
  );
}
