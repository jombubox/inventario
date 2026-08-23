import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";

config({ path: ".env.local" });
config({ path: ".env" });

async function askVisible(label: string): Promise<string> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });

  try {
    return await terminal.question(label);
  } finally {
    terminal.close();
  }
}

async function askHidden(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error(
      "A hidden password prompt requires an interactive terminal. Set JOMBUBOX_ADMIN_PASSWORD instead.",
    );
  }

  process.stdout.write(label);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";

    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("keypress", onKeypress);
      process.stdout.write("\n");
    };

    const onKeypress = (character: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") {
        finish();
        reject(new Error("Admin bootstrap cancelled."));
        return;
      }

      if (key.name === "return") {
        finish();
        resolve(value);
        return;
      }

      if (key.name === "backspace") {
        value = value.slice(0, -1);
        return;
      }

      if (character && !key.ctrl) {
        value += character;
      }
    };

    process.stdin.on("keypress", onKeypress);
  });
}

async function main(): Promise<void> {
  const [{ auth }, { createDatabaseClient }, { user }, { parseServerEnv }, validator] =
    await Promise.all([
      import("@/lib/auth"),
      import("@/db/connection"),
      import("@/db/schema/auth"),
      import("@/lib/env-schema"),
      import("@/validators/auth"),
    ]);
  const environment = parseServerEnv(process.env);
  const db = createDatabaseClient(environment.DATABASE_URL);
  const existingAdmin = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, "ADMIN"))
    .limit(1);

  if (existingAdmin.length > 0) {
    throw new Error(
      "An ADMIN already exists. Create additional users from /admin/usuarios.",
    );
  }

  const name = process.env.JOMBUBOX_ADMIN_NAME ?? (await askVisible("Nombre: "));
  const email = process.env.JOMBUBOX_ADMIN_EMAIL ?? (await askVisible("Correo: "));
  const password =
    process.env.JOMBUBOX_ADMIN_PASSWORD ?? (await askHidden("Contraseña (oculta): "));
  const input = validator.createUserInputSchema.parse({
    name,
    email,
    password,
    role: "ADMIN",
  });

  await auth.api.createUser({ body: input });
  console.info(`ADMIN creado para ${input.email}.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown admin bootstrap error.";
  console.error(message);
  process.exitCode = 1;
});
