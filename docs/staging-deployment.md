# Staging deployment runbook

This runbook keeps the Cloudflare staging Worker isolated from the Vercel
production application, the production Neon database (`neondb`), and
production DNS.

## One-time authentication

Run these commands in an interactive desktop session. Do not paste tokens into
chat, source files, or shell history.

```bash
pnpm dlx neon@latest auth
pnpm exec wrangler login
```

Confirm both sessions before continuing:

```bash
pnpm dlx neon@latest me --output json --no-color
pnpm exec wrangler whoami
```

## Isolated resources

The current staging resources are:

- Neon project `late-bar-55963681` (`jumbobox-staging`), database
  `jumbobox_staging`, branch `br-long-rice-b5br2745`;
- Worker `jumbobox-staging` at
  `https://jumbobox-staging.jumbobox.workers.dev`;
- R2 bucket `jumbobox-staging`.

1. Create a separate Neon project named `jumbobox-staging` in
   `aws-us-east-2`. A separate project is preferred over a branch because the
   staging seed must start from an empty database and must not copy production
   data.
2. Obtain its pooled connection string without printing it in logs. Verify
   `current_database()` and `current_user` before running any migration.
3. Use the existing R2 bucket `jumbobox-staging`. Enable its `r2.dev` URL only
   for staging:

   ```bash
   pnpm exec wrangler r2 bucket dev-url enable jumbobox-staging
   pnpm exec wrangler r2 bucket dev-url get jumbobox-staging
   ```

4. Generate `.env.staging.local` locally. The file is covered by `.gitignore`
   and must contain the staging `DATABASE_URL`, a unique `AUTH_SECRET`, unique
   admin credentials, the staging Worker URL, and the staging R2 bucket/public
   URL. Never copy the production `DATABASE_URL` or production bucket name.

## Database preparation

Load `.env.staging.local` into the current shell without echoing it. Before
every mutating command, query the connection and require the expected staging
database/project. Then run:

```bash
pnpm db:migrate
pnpm db:migrate
pnpm db:seed
pnpm db:seed
```

The second migration must be a no-op. The second seed must retain exactly the
canonical catalog (75 brands and 8 component types). Never run
`test:e2e:seed` against staging.

## Worker secrets and deployment

The `staging` Wrangler environment resolves to the distinct Worker
`jumbobox-staging`. Upload `.env.staging.local` only as Worker secrets and do
not deploy the default environment:

```bash
pnpm exec wrangler secret bulk .env.staging.local --env staging
pnpm deploy:staging
```

On Windows, build and deploy the OpenNext artifact inside Linux because the
artifact contains symbolic links that cannot be exported reliably to an NTFS
checkout. Build the image with the staging public values, then deploy from the
image while forwarding the parsed staging environment and mounting the current
Wrangler OAuth configuration. Do not use Docker's raw `--env-file` option when
the dotenv values are quoted; parse the dotenv file first so quotes are not
included in credentials.

Confirm the deployment output names `jumbobox-staging` before accepting it.
The generic `pnpm deploy` script is a legacy/default Cloudflare command and is
not a Vercel production workflow. Do not use it for production or as part of
this staging runbook.

## Remote smoke and persistence

Run smoke tests against the `workers.dev` staging URL on desktop and mobile:

- health, public catalog, search, login, logout, and anonymous admin rejection;
- Quick Add with an existing model and a new model;
- serial creation, normalized and partial serial searches, and serial edits;
- `INITIAL` and `IN` inventory movements;
- warehouse/box assignment, bag normalization, and overflow validation.

Inspect Worker logs for 5xx responses, database errors, and failed actions.
Record a staging data marker, redeploy `jumbobox-staging`, and prove that the
marker, inventory, serials, and locations persist after the second deployment.

## Production handoff (Vercel, not Cloudflare)

Cloudflare is used only for the isolated `jumbobox-staging` environment.
Production remains on Vercel. Do not use `pnpm deploy`, Wrangler, the staging
Worker, or the staging dotenv file for a production promotion.

Before a separately authorized production release:

1. Link the repository to the verified Vercel production project. Never infer
   the project from another account or from a staging deployment.
2. Re-run audit, lint, typecheck, unit, PostgreSQL integration, E2E, and the
   standard `pnpm build` command from the exact release candidate. Integration
   and E2E must use the guarded disposable database, never production.
3. Identify the production Neon project, branch, database, and role; create and
   verify a recoverable pre-deploy branch or snapshot before migrations.
4. Apply pending Drizzle migrations twice and require the second run to be a
   no-op. Do not run `db:seed` or `test:e2e:seed` against production.
5. Verify Vercel Production environment-variable names without printing values,
   then deploy through the existing Vercel workflow only after explicit
   authorization.
6. Run read-only production smoke tests and observe Vercel logs before any
   controlled business mutation.

Database rollback remains restore/forward-fix only: never drop
`product_serial_numbers` merely to roll the application back, and never reuse
`products.part_number` as a serial source. Keep the Neon pre-deploy backup and
all staging resources during the initial observation period.
