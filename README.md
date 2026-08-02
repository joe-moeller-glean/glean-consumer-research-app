# Glean Consumer Research

A demonstration consumer research app: product researchers upload consumer feedback CSVs for a
study, each response is classified **Like / Dislike / Indifferent** by a **custom (fine-tuned) model
on Fireworks.ai** using the Batch Inference API, and a **hosted Glean agent** writes the overall
analysis from the aggregated demographic breakdown.

```
CSV upload ──► parse ──► Fireworks batch inference ──► demographic aggregation ──► Glean agent
   (web)      (worker)        (worker, async)              (read time)            (on demand)
```

## Stack

| Concern | Choice |
|---|---|
| Web + API | Next.js 14 (App Router), TypeScript, Tailwind |
| Database | PostgreSQL + Drizzle ORM (`drizzle-kit` migrations) |
| Background jobs | BullMQ + Redis |
| Sentiment | Fireworks.ai Batch Inference (`FIREWORKS_MODEL`) |
| Written analysis | Hosted Glean agent (Glean Agent API) |
| Charts | Recharts |
| Auth | NextAuth credentials, roles: Admin / Researcher / Viewer |
| Tests | Vitest |

## Quick start (Docker Compose)

```bash
cp .env.example .env          # then edit; see configuration below
docker compose up --build
```

Then open http://localhost:3000 and sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
(defaults: `admin@example.com` / `admin1234`).

Compose runs migrations first (`migrate`), then starts `web` and `worker`.

### Demo data

```bash
docker compose exec web npm run db:seed
```

Seeds 3 users, 40 panelists, and a two-leg study with pre-classified responses so every chart is
populated immediately.

## Local development

```bash
npm install
# Postgres + Redis only:
docker compose up postgres redis -d
cp .env.example .env          # set DATABASE_URL/REDIS_URL to localhost
npm run db:migrate
npm run db:seed               # optional demo data
npm run dev                   # terminal 1: web
npm run worker                # terminal 2: background pipeline
```

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run worker` | Background job worker (required for uploads and analysis) |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations, bootstrap the admin user |
| `npm run db:seed` | Load demo data |
| `npm test` | Unit tests |
| `npm run typecheck` | Full TypeScript check |

## Configuration

All settings live in `.env` (see `.env.example`). In production a missing required variable is a
startup failure, so the app can never run on a development default secret.

### Fireworks (custom sentiment model)

| Variable | Notes |
|---|---|
| `FIREWORKS_API_KEY` | API key |
| `FIREWORKS_ACCOUNT_ID` | Account id used in dataset/job paths |
| `FIREWORKS_MODEL` | **The model to use.** Point this at your fine-tuned sentiment model, e.g. `accounts/<account>/models/<my-sentiment-model>` |
| `FIREWORKS_BATCH_EXPIRY_HOURS` | Batch expiry window (default 24) |
| `FIREWORKS_POLL_INTERVAL_MS` | How often the worker polls job state (default 30s) |
| `SENTIMENT_MOCK` | `true` runs a keyword classifier locally so the app is demoable with no credentials |

Swapping between a base model and your fine-tuned model is a config change only — no code change.
The model must support batch inference; incompatible models sit in `PENDING` indefinitely.

**Pipeline** (`src/lib/fireworks.ts`): build a JSONL dataset (one line per response, `custom_id` =
response id) → upload dataset → create `batchInferenceJob` → poll → download results → write
sentiments back. The shared classification instructions are passed once as the job-level
`systemPrompt`, which keeps each row's prefix identical for prompt caching. Identical verbatims are
submitted once and the result is fanned back out.

### Glean (overall analysis)

| Variable | Notes |
|---|---|
| `GLEAN_API_TOKEN` | Glean API token |
| `GLEAN_AGENT_ID` | Id of the hosted agent that writes the analysis |
| `GLEAN_BASE_URL` | Glean API base URL |
| `GLEAN_MOCK` | `true` produces a deterministic local analysis instead of calling Glean |

Create the agent once in Glean's agent builder with instructions along the lines of:

> You receive a JSON sentiment breakdown from a consumer research study (overall, per test leg, and
> per demographic segment, with counts and percentages for Like / Dislike / Indifferent). Write an
> executive analysis covering headline findings, demographic divergence (which segments over- or
> under-index), risks, and recommendations. Cite the percentages.

Then set `GLEAN_AGENT_ID` to that agent's id. The app sends **aggregates only** — counts and
percentages. Verbatim feedback and panelist PII never leave the database.

## Data model

`src/db/schema.ts`. Eleven tables:

| Table | Purpose |
|---|---|
| `users` | App users with a role |
| `studies` | A study of one product version, with test criteria |
| `legs` | A step of a study; a study has one or more, each testing something different |
| `panelists` | A participant with a unique panelist id and demographics |
| `study_panelists` / `leg_panelists` | Which studies and which legs a panelist took part in |
| `study_data` | **Metadata about uploaded files** (names, path, size, checksum, status) — not the data |
| `responses` | One consumer feedback row, with its sentiment, confidence, and model |
| `sentiment_batches` | Fireworks batch jobs: dataset ids, request count, state |
| `study_analyses` | Glean analysis runs: input aggregates and written output |

Demographics tracked per panelist: age, sex, race, country, state, city, household income, family
makeup, household size, children. Age ranges, income bands, and household buckets are derived at
read time, so re-bucketing never needs a data migration and editing a panelist updates the charts
immediately.

## Uploads

Accepts a single CSV, multiple CSVs, or a ZIP of CSVs. Files are stored at:

```
<UPLOADS_DIR>/<studyId>/<studyId>_<legId>__<original-filename>
```

Required CSV columns: `panelist_id`, `feedback`. Optional: `question`, plus `age`, `sex`, `race`,
`country`, `state`, `city`, `household_income`, `family_makeup`, `household_size`,
`children_count`. Common aliases are accepted (`verbatim`/`comment` → `feedback`,
`respondent_id` → `panelist_id`). Unrecognized columns are preserved on the response as
`structuredAttrs`.

Unknown panelist ids create a stub panelist flagged **incomplete** (`AUTO_CREATE_STUB_PANELISTS`),
which a researcher can complete on the Panelists page.

## Pages

| Route | Purpose |
|---|---|
| `/` | Studies dashboard with sentiment snapshot, "New study" |
| `/studies/[id]` | Overview (metadata + all charts + Glean analysis), Data & uploads, Panelists, Settings |
| `/panelists`, `/panelists/[id]` | Panelist CRUD, demographics, participation history |
| `/admin/users` | User CRUD and roles (Admin only) |

Charts: overall donut, per-leg comparison, and 100% stacked breakdowns for age, sex, race, income,
family makeup, household size, children, plus country / state / city.

## Security notes

- **Authentication** — `src/middleware.ts` requires a session for every route except `/login` and
  the NextAuth endpoints; API handlers additionally guard themselves (defence in depth).
- **Authorization** — `requireUser`, `requireWriter` (rejects Viewer), and `requireRole("ADMIN")`.
  The last active admin cannot be demoted, disabled, or deleted.
- **Input validation** — every request body is parsed with Zod; every id path parameter is
  validated as a UUID before it reaches a query or a filesystem path.
- **Uploads** — extension allowlist, size limit checked before buffering, ZIP entry-count cap,
  filename sanitization, and a resolved-path check that refuses writes outside the study directory.
- **Errors** — a single mapper returns 400 for validation failures and a generic 500 otherwise;
  internal error details are logged server-side, never returned to the client.
- **Secrets** — passwords are bcrypt hashed (cost 12) and never selected into API responses;
  production refuses to start without the required environment variables.
- **PII** — only aggregate counts are sent to Glean. Parse errors report the column and reason, never
  row content.
- Response headers set `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and
  `Permissions-Policy`; `poweredByHeader` is disabled.

## Tests

```bash
npm test
```

58 unit tests covering the logic worth protecting: demographic aggregation and bucketing, CSV header
normalization and aliasing, batch dataset construction and tolerant model-output parsing, filename
sanitization and path containment, request validation schemas, and error mapping.

## Notes and limitations

This is a demonstration app, deliberately kept small:

- CSVs are parsed in memory. Fine for the file sizes used in a demo; a very large file would want
  streaming inserts.
- Aggregation loads a study's analyzed rows and buckets them in application code rather than in SQL.
  Simple to read and fast at demo scale; a large study would want SQL `GROUP BY` or cached rollups.
- Batch polling uses a delayed job per check, so no worker slot is blocked. Batches take minutes to
  hours, so the UI is status-driven rather than instant.
- One Docker image serves web, worker, and migrations to keep the setup easy to follow.
