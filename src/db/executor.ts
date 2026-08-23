import type { Database } from "@/db/connection";

type TransactionCallback = Parameters<Database["transaction"]>[0];

export type DatabaseTransaction = Parameters<TransactionCallback>[0];
export type DatabaseExecutor = Database | DatabaseTransaction;
