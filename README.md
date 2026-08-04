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

Loads the committed fixtures in [`src/db/seed/`](src/db/seed):

| File | Contents |
|---|---|
| `panelists.json` | 5,000 panelists spanning every tracked demographic, unevenly distributed with occasional missing fields |
| `responses/<study>-leg<N>.csv` | One collected-response file per study leg (11 files), as a study export would arrive |
| `studies.ts` | Study and leg metadata |
| `seed.ts` | Loader that turns the above into database rows |

Five studies for a fictional consumer goods manufacturer, 8,043 responses total
(1,300-1,800 per study) from 1,251 participating panelists, each landing on a
deliberate overall sentiment:

| Study | Product | Legs | Responses | Outcome |
|---|---|---|---|---|
| Sparkling water citrus reformulation | Cascade Sparkling Water | 3 | 1,763 | **Like** 56% |
| Plant protein bar launch readiness | Summit Plant Protein Bar | 2 | 1,667 | **Like** 61% |
| Concentrated laundry sheet concept test | PureFold Detergent Sheets | 1 | 1,687 | **Dislike** 59% |
| Oat creamer flavor extension | Meadow Oat Coffee Creamer | 3 | 1,550 | **Indifferent** 53% |
| Bamboo paper towel durability study | Everleaf Bamboo Paper Towels | 2 | 1,376 | **Indifferent** 58% |

Each study has its own question set, mixing open-ended questions with yes/no
questions, and answers range from two words to full paragraphs. Open-ended
answers combine a core opinion with an optional supporting clause, giving 1,522
distinct verbatims across the corpus.

The CSVs carry a `coded_sentiment` column representing the research vendor's
human coding. The seed uses it to pre-populate sentiment so the dashboard has
data immediately. Real uploads have no such column — the Fireworks model
supplies the sentiment. This also makes the fixtures usable as labelled
training data for fine-tuning.

To regenerate the fixtures from scratch (deterministic, fixed PRNG seed):

```bash
npm run seed:generate
```

The generator lives in [`scripts/`](scripts) and is a development tool only:
neither the app nor the seed loader imports it. It validates every demographic
value against the database enums before writing.

### Applying changes

`web`, `worker`, and `migrate` are one image (`glean-consumer-research:local`)
running three different commands, so a single build updates all of them.

| Changed | Command |
|---|---|
| `.env` | `docker compose up -d --force-recreate` — `env_file` is read when a container is **created**, so `restart` keeps the old values |
| App code or seed fixtures | `docker compose build && docker compose up -d --force-recreate` |

Build the whole project, not a single service: `docker compose build web` would
leave `worker` on an older image, and the pipeline and Glean analysis both run in
the worker.

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
| `npm run db:seed` | Load the demo fixtures |
| `npm run seed:generate` | Regenerate the seed fixtures (dev tool) |
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
| `GLEAN_BE_URL` | **Glean backend host for all API requests**, e.g. `https://<instance>-be.glean.com`. The Glean developer docs call this `serverURL` / `server_url`. Instance specific: there is no shared `api.glean.com` host |
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
