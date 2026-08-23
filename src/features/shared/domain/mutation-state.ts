export type MutationState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialMutationState: MutationState = { status: "idle" };
