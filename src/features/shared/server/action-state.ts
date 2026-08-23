import { ZodError } from "zod";

import { LastActiveAdminError } from "@/features/auth/domain/auth-errors";
import {
  ConcurrentModificationError,
  DuplicateEntityError,
  EntityNotFoundError,
  InvalidOperationError,
} from "@/features/shared/domain/service-errors";
import type { MutationState } from "@/features/shared/domain/mutation-state";
import { logServerError, logServerEvent } from "@/lib/observability";

export type { MutationState } from "@/features/shared/domain/mutation-state";

export function validationState(error: ZodError): MutationState {
  return {
    status: "error",
    message: "Revisa los campos marcados.",
    fieldErrors: error.flatten().fieldErrors,
  };
}

export function errorState(error: unknown): MutationState {
  if (error instanceof ConcurrentModificationError) {
    return {
      status: "error",
      message: "Este registro fue modificado por otra persona. Actualiza la página.",
    };
  }
  if (error instanceof DuplicateEntityError) {
    return { status: "error", message: "Ya existe un registro con esos datos." };
  }
  if (error instanceof EntityNotFoundError) {
    return { status: "error", message: "No se encontró uno de los registros seleccionados." };
  }
  if (error instanceof InvalidOperationError) {
    return { status: "error", message: error.message };
  }
  if (error instanceof LastActiveAdminError) {
    return {
      status: "error",
      message: "Debe permanecer al menos un administrador activo en JombuBox.",
    };
  }


  if (error instanceof Error) {
    logServerError("server_action_failed", error);
  } else {
    logServerEvent("error", "server_action_failed", { errorType: typeof error });
  }

  return {
    status: "error",
    message: "No fue posible completar la operación. Intenta nuevamente.",
  };
}
