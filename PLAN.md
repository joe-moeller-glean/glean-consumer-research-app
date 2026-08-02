# Consumer Research Web App — Architecture & Implementation Plan

A web app where product researchers upload consumer research data (CSVs) for studies, get per-response sentiment analysis (Like / Dislike / Indifferent) via the Fireworks.ai Batch API, explore demographic breakdowns in charts, and get an AI-written overall analysis from a hosted Glean agent.

---

## 1. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 14 (App Router) + TypeScript** | One framework for pages + API routes; SSR for dashboards; huge chart ecosystem |
| UI | **Tailwind CSS + shadcn/ui** | Fast, clean CRUD pages and dashboards without design overhead |
| Charts | **Recharts** | React-native bar/pie/stacked charts, easy demographic breakdowns |
| Tables/Forms | **TanStack Table + React Hook Form + Zod** | Standard, type-safe CRUD grids and validated forms |
| Backend | **Next.js Route Handlers (API) + a background worker process** | Keeps one language; worker handles long-running sentiment/Glean jobs |
| ORM / DB | **PostgreSQL + Drizzle ORM** | Relational data model (studies → legs → responses) fits perfectly; Drizzle gives SQL-first typed queries + `drizzle-kit` migrations |
| File storage | **Local filesystem volume** (`/data/uploads/<study_id>/…`) in Docker; S3-compatible (MinIO) as an env-swap later | Requirement: files stored in a folder keyed by study ID |
| Auth | **Auth.js (NextAuth) with credentials + optional SSO** | Simple login for an internal tool now; SSO path later |
| Sentiment | **Fireworks.ai Batch Inference API** | 50% cheaper than serverless, purpose-built for bulk classification of uploaded datasets; model set via `FIREWORKS_MODEL` env var (per your answer) |
| Overall analysis | **Hosted Glean agent** via Glean Agent API (`agent_builder` → `run_agent`) | Per your answer; wrapped behind a server-side service |
| Queue | **BullMQ + Redis** | Reliable background processing of uploads → sentiment → aggregation → Glean analysis |
| Deployment | **Docker + Docker Compose** | Per your answer: `web`, `worker`, `postgres`, `redis`, (optional `minio`) services |

One repo, one language (TypeScript), two processes (`web`, `worker`) sharing the Drizzle schema/db client + service modules.

---

## 2. Data Model (PostgreSQL / Drizzle)

Schema defined in TypeScript (`db/schema.ts`) with `drizzle-kit` generating SQL migrations. Relations below are the Drizzle table definitions.

> PII note: Panelist data is consumer PII. Store it in its own table with restricted access, never log it, and plan a `DELETE` cascade + retention policy.

### User
```
id            UUID PK
email         String  @unique
name          String
passwordHash  String           (or null if SSO-only)
role          Role             ADMIN | RESEARCHER | VIEWER
createdAt / updatedAt
studies       Study[]          (createdBy)
```

### Study
```
id                UUID PK              -- the "study id" used in folder/file names
name              String
product           String               -- e.g. "Sparkling Water"
productVersion    String               -- e.g. "v2.3 formula"
testCriteria      String               -- free text: what this study tests
description       String?
status            StudyStatus          DRAFT | COLLECTING | PROCESSING | ANALYZED | ARCHIVED
category          String?              -- e.g. "Beverage", "Snacks"
targetPanelSize   Int?
startDate / endDate DateTime?
createdById       FK → User
createdAt / updatedAt
legs              Leg[]
files             StudyData[]
panelists         StudyPanelist[]
analyses          StudyAnalysis[]
```

### Leg
> A single step of a study. Studies have 1..n legs; different things tested per leg.
```
id            UUID PK
studyId       FK → Study
name          String                 -- e.g. "Leg 1: Unbranded taste", "Leg 2: Branded concept"
sequence      Int                    -- order within study
description   String?
testVariant   String?                -- what changes in this leg (e.g. "Formula A")
studyData     StudyData[]
responses     Response[]
```

### Panelist
> A single participant, reusable across studies. Unique panelist ID.
```
id               UUID PK
panelistId       String  @unique     -- human-facing ID, e.g. "P-004231"; used to link CSV rows
age              Int                 -- store age; derive ranges at query time
sex              Sex                 MALE | FEMALE | NONBINARY | PREFER_NOT_TO_SAY | OTHER
race             Race                AMERICAN_INDIAN_ALASKA_NATIVE | ASIAN | BLACK_AFRICAN_AMERICAN
                                     | NATIVE_HAWAIIAN_PACIFIC_ISLANDER | WHITE | MULTIRACIAL | OTHER | PREFER_NOT_TO_SAY
country          String
state            String?
city             String?
householdIncome  IncomeBand          UNDER_25K | K25_50K | K50_75K | K75_100K | K100_150K | K150_200K | OVER_200K | PREFER_NOT_TO_SAY
familyMakeup     FamilyMakeup        SINGLE_NO_KIDS | SINGLE_WITH_KIDS | COUPLE_NO_KIDS | COUPLE_WITH_KIDS
                                     | MULTIGENERATIONAL | ROOMMATES | OTHER | PREFER_NOT_TO_SAY
householdSize    Int?
childrenCount    Int?
notes            String?
createdAt / updatedAt
studyLinks       StudyPanelist[]     -- studies participated in
legLinks         LegPanelist[]       -- legs participated in
responses        Response[]
```

### StudyPanelist (join: which studies a panelist participated in)
```
studyId   FK → Study
panelistId FK → Panelist
@@id([studyId, panelistId])
```

### LegPanelist (join: which legs a panelist participated in)
```
legId      FK → Leg
panelistId FK → Panelist
role       String?        -- e.g. "tester", "control"
@@id([legId, panelistId])
```

### StudyData (metadata about uploaded files — NOT the data itself)
```
id             UUID PK
studyId        FK → Study
legId          FK → Leg
originalFilename String              -- e.g. "taste-test-raw.csv"
storedFilename   String              -- "<studyId>_<legId>__taste-test-raw.csv"
storagePath      String              -- "/data/uploads/<studyId>/<storedFilename>"
fileType         FileType            CSV | ZIP
sizeBytes        BigInt
rowCount         Int?
checksum         String?             -- sha256, dedupe/integrity
status           UploadStatus        UPLOADED | PARSING | PARSED | PROCESSING | COMPLETE | FAILED
error            String?
uploadedById     FK → User
uploadedAt       DateTime
```

### Response (one row of consumer feedback — parsed from CSV)
> This is the actual feedback datum; `StudyData` is the file metadata.
```
id              UUID PK
studyId         FK → Study
legId           FK → Leg
studyDataId     FK → StudyData       -- which file it came from
panelistId      FK → Panelist?       -- matched via panelist_id column in CSV
question        String?              -- survey question / prompt
feedbackText    Text                 -- the verbatim consumer feedback
structuredAttrs Json?                -- any extra CSV columns (scores, ratings)
sentiment       Sentiment?           LIKE | DISLIKE | INDIFFERENT
sentimentScore  Float?               -- model confidence 0..1
sentimentModel  String?              -- model used, for audit
analyzedAt      DateTime?
```

### StudyAnalysis (Glean overall-analysis runs, cached/versioned)
```
id          UUID PK
studyId     FK → Study
status      AnalysisStatus  PENDING | RUNNING | COMPLETE | FAILED
inputJson   Json            -- the aggregated sentiment breakdown sent to Glean
outputText  Text?           -- Glean agent's written analysis
model       String?         -- Glean agent id/version
createdById FK → User
createdAt / completedAt
```

### SentimentBatch (Fireworks Batch API job tracking)
> One per batch job submitted — typically one per parsed `StudyData` file (or a merge of small files).
```
id                 UUID PK
studyId            FK → Study
studyDataId        FK → StudyData?    -- which upload triggered it
fireworksJobId     String  @unique    -- batchInferenceJob id
inputDatasetId     String             -- Fireworks dataset id (input JSONL)
outputDatasetId    String?            -- Fireworks dataset id (results)
requestCount       Int                -- rows submitted
status             BatchStatus        VALIDATING | PENDING | RUNNING | COMPLETED | FAILED | EXPIRED
error              String?
continuedFromId    FK → SentimentBatch?  -- if resumed from an expired job
submittedAt / completedAt
```

Derived demographic bucketing is computed at query time (age ranges, region rollups), not stored — keeps panelist data the single source of truth.

---

## 3. CSV Upload & Processing Pipeline

### Upload contract
- Endpoint: `POST /api/studies/:studyId/legs/:legId/uploads` (multipart)
- Accepts: one CSV, multiple CSVs, or a `.zip` of CSVs
- Storage rule (requirement): directory `/data/uploads/<studyId>/`; every stored file renamed to `<studyId>_<legId>__<original-filename>`
- A `StudyData` row is created per file with `status=UPLOADED`, then a BullMQ job is enqueued

### Expected CSV columns (validated on parse; configurable mapping UI later)
`panelist_id` (required), `question`, `feedback` (required) + any extra columns kept in `structuredAttrs`
- `panelist_id` links the row to a `Panelist`; unknown IDs auto-create a stub Panelist (flagged for the researcher to fill in demographics) or mark the response `anonymous` — pick behavior via env.

### Pipeline (BullMQ jobs, worker process)
1. **Parse job** (`StudyData` → rows)
   - Unzip if needed, stream-parse CSV (PapaParse/`csv-parse`), bulk-insert `Response` rows, link `Panelist` via `panelist_id`, set `rowCount`, `status=PARSED → PROCESSING`
2. **Sentiment job** (Fireworks **Batch API** — see §4)
   - Build a JSONL dataset of all unanalyzed `Response` rows for the upload: one line per row, `custom_id = response.id`, `body.messages = [{role: "user", content: <feedback>}]`; the shared classification instructions go in the job-level `systemPrompt` (smaller upload + prompt-cache-friendly)
   - Upload dataset → create `batchInferenceJob` with model from `FIREWORKS_MODEL` → poll status (`VALIDATING/PENDING/RUNNING → COMPLETED/FAILED/EXPIRED`) → download output dataset → write `sentiment`, `sentimentScore`, `sentimentModel`, `analyzedAt` per response by `custom_id`
   - Rows in the output's **error file** are retried in a follow-up batch; **EXPIRED** jobs resume with `continue-from`; a `SentimentBatch` row tracks the whole lifecycle
   - Mark file `COMPLETE` when done; flip `Study.status` to `ANALYZED` when all files complete
3. **Aggregate job**
   - Compute sentiment counts/percentages overall and per demographic slice (age band, sex, race, region, income, family makeup) per study and per leg; store as cached aggregate (or compute on read for MVP)
4. **Glean analysis job** (on demand, button "Generate Overall Analysis")
   - Build a compact JSON payload of the aggregated breakdowns (no PII, no raw verbatims — counts/percentages only)
   - Call the hosted Glean agent (see §5), save `StudyAnalysis` with input/output, render on the study page

```
[Upload] → [Parse] → [Sentiment ×N] → [Aggregate] → (user) → [Glean Analysis]
```

---

## 4. Fireworks.ai Batch API Integration

Bulk sentiment classification runs through the [Batch Inference API](https://docs.fireworks.ai/guides/batch-inference) — asynchronous, ~50% cheaper than serverless, designed for exactly this dataset-labeling workload. No per-request latency requirement here, so batch beats real-time calls.

Server-side module `lib/sentimentBatch.ts` with four steps (each a BullMQ job stage, resumable):

1. **Build dataset** — stream unanalyzed `Response` rows to a JSONL file (< 1GB; split into multiple datasets if a study exceeds it):
   ```json
   {"custom_id": "<response-uuid>", "body": {"messages": [{"role": "user", "content": "<feedback text>"}], "max_tokens": 32, "temperature": 0}}
   ```
   The classification instructions + output schema are set **once** as the job-level `systemPrompt` (Fireworks injects it into every row; byte-identical prefix keeps prompt caching active and shrinks upload size). The prompt forces strict JSON: `{"sentiment": "like"|"dislike"|"indifferent", "confidence": 0-1}`.
2. **Upload dataset** — `POST /v1/accounts/{account}/datasets` (create entry) then `POST .../datasets/{id}:upload` (JSONL file).
3. **Create + poll job** — `POST /v1/accounts/{account}/batchInferenceJobs` with `model` (from `FIREWORKS_MODEL`), `inputDatasetId`, `outputDatasetId`, `systemPrompt`, `inferenceParameters: {maxTokens: 32, temperature: 0}`, and a 24h expiration window. Worker polls `GET .../batchInferenceJobs/{id}` on a backoff schedule through `VALIDATING → PENDING → RUNNING → COMPLETED`.
4. **Ingest results** — `GET .../datasets/{outputId}:getDownloadEndpoint` → download results JSONL + error file → match each line to a `Response` via `custom_id` → Zod-validate the JSON output → persist `sentiment`, `sentimentScore`, `sentimentModel`, `analyzedAt`. Invalid/unknown outputs → `INDIFFERENT` with low confidence, flagged for manual review. Error-file rows go into a retry batch; EXPIRED jobs resume with `continue-from` (tracked via `SentimentBatch.continuedFromId`).

Config via env:
- `FIREWORKS_API_KEY`
- `FIREWORKS_ACCOUNT_ID` — used in dataset/job API paths
- `FIREWORKS_MODEL` — any **batch-compatible** model id (base models that support On-Demand Deployments, or your fine-tuned model built on one, e.g. `accounts/fireworks/models/llama-v3p1-8b-instruct`)
- `FIREWORKS_BASE_URL` (default `https://api.fireworks.ai`)
- `FIREWORKS_BATCH_EXPIRY_HOURS` (default 24)

Operational notes:
- **Verify the chosen model is batch-compatible before submitting** — incompatible models sit in PENDING forever instead of erroring; the worker validates against the model library on startup and fails fast.
- Identical verbatim feedback is deduped before dataset creation (same text → one request, result fanned out to all matching rows) to cut token spend.
- A `SentimentBatch` DB row per job gives full audit: dataset ids, request count, state transitions, continuation lineage.

Swapping to your fine-tuned model later = change one env var (as long as it's built on a batch-compatible base), no code change.

---

## 5. Glean Overall Analysis (hosted agent)

Per your answer: a **hosted Glean agent** receives the aggregated sentiment breakdown and returns a written analysis.

Implementation:
1. Create the agent once (via the `agent_builder` workflow / Glean UI): a hosted agent whose instructions tell it to read a structured JSON sentiment breakdown and write an executive-style consumer-research analysis (key themes, demographic divergence, risks, recommendations).
2. App server module `lib/gleanAnalysis.ts`:
   - Builds the payload: overall Like/Dislike/Indifferent counts & %, then per demographic dimension (age bands, sex, race, country/state/city, income band, family makeup), plus per-leg breakdowns
   - Calls the Glean Agent API (`run_agent`) with the payload as the user message; service credential in `GLEAN_API_TOKEN` / `GLEAN_AGENT_ID` env vars
   - Polls/reads the response, stores in `StudyAnalysis.outputText`
3. UI: "Generate / Regenerate Overall Analysis" button on the study page; renders the returned markdown with the aggregate charts beside it.
4. Guardrail: send **aggregates only** — never raw verbatims or panelist PII to Glean.
5. Fallback: if Glean is unreachable, surface the error and keep the numeric analysis available.

---

## 6. Pages / UX

### Main page `/` (Studies dashboard)
- Table of studies: name, product, version, status, legs count, responses count, sentiment snapshot (mini stacked bar), created date
- **"New Study" button** → modal/page form → creates Study with auto UUID; navigates to study page
- Search/filter by product, status

### Study page `/studies/[studyId]`
Tabs: **Overview**, **Data & Uploads**, **Analysis**, **Panelists**, **Settings**

- **No data yet** → upload dropzone (single CSV / multi CSV / zip), column-mapping preview, upload history (`StudyData` table with status chips)
- **Data exists** → Overview shows:
  - Study metadata card: **Product, Product Version, Test Criteria**, category, status, dates, panel size, legs
  - **Overall sentiment chart** (stacked bar / donut: Like, Dislike, Indifferent) + per-leg comparison
  - **Demographic breakdown charts** (each: sentiment distribution within the slice):
    - Age ranges (e.g. 18–24, 25–34, 35–44, 45–54, 55–64, 65+)
    - Sex
    - Race
    - Region: Country → State → City (drill-down)
    - Household Income bands
    - Family Makeup (incl. sub-slices: has children, household size)
  - **Glean Overall Analysis** panel (markdown) with generate/regenerate button and timestamp
- **Data & Uploads** tab: file list, row counts, processing status, response table (searchable, filterable by sentiment/panelist), manual sentiment override
- **Panelists** tab: panelists linked to this study + which legs
- **Settings**: edit metadata, archive/delete study (cascades files + rows, with confirm)

### Panelist Management `/panelists`
- CRUD grid: panelist ID, demographics, # studies, # legs
- Detail page `/panelists/[id]`: full demographic profile, participation history (studies × legs), their responses + sentiments
- Merge/dedupe stub panelists created during CSV import

### User Management `/admin/users` (ADMIN only)
- CRUD: invite user, set role (Admin/Researcher/Viewer), deactivate
- Viewer = read-only dashboards; Researcher = manage studies/panelists; Admin = everything + users

### Leg management
- Lives inside the study page (add/edit/reorder/delete legs), since legs only make sense in a study's context

---

## 7. API Surface (Next.js route handlers, Zod-validated)

```
Auth
POST   /api/auth/…                       (Auth.js)

Users
GET/POST        /api/users
GET/PATCH/DELETE /api/users/:id

Studies
GET/POST        /api/studies
GET/PATCH/DELETE /api/studies/:id
GET             /api/studies/:id/analysis/summary      (aggregates for charts)
POST            /api/studies/:id/analysis/glean        (trigger Glean run)
GET             /api/studies/:id/analysis/glean/latest

Legs
POST            /api/studies/:id/legs
GET/PATCH/DELETE /api/legs/:id

Uploads / StudyData
POST            /api/studies/:id/legs/:legId/uploads   (multipart)
GET/DELETE      /api/study-data/:id
GET             /api/study-data/:id/download

Panelists
GET/POST        /api/panelists
GET/PATCH/DELETE /api/panelists/:id
GET             /api/panelists/:id/participation

Responses
GET             /api/studies/:id/responses  (filters: sentiment, leg, panelist, search)
PATCH           /api/responses/:id          (manual sentiment override)
```

---

## 8. Docker / Compose

```yaml
services:
  web:        # Next.js app (multi-stage Dockerfile, standalone output)
    build: .
    ports: ["3000:3000"]
    env_file: .env
    volumes: ["uploads:/data/uploads"]
    depends_on: [postgres, redis]
  worker:     # same image, `node worker.js` — BullMQ consumers
    build: .
    command: node worker.js
    env_file: .env
    volumes: ["uploads:/data/uploads"]
    depends_on: [postgres, redis]
  postgres:
    image: postgres:16
    volumes: ["pgdata:/var/lib/postgresql/data"]
  redis:
    image: redis:7
volumes: { uploads:, pgdata: }
```

`.env`:
```
DATABASE_URL=postgresql://…
REDIS_URL=redis://redis:6379
NEXTAUTH_SECRET=…
FIREWORKS_API_KEY=…
FIREWORKS_ACCOUNT_ID=…
FIREWORKS_MODEL=accounts/fireworks/models/…
FIREWORKS_BASE_URL=https://api.fireworks.ai
FIREWORKS_BATCH_EXPIRY_HOURS=24
GLEAN_API_TOKEN=…
GLEAN_AGENT_ID=…
UPLOADS_DIR=/data/uploads
AUTO_CREATE_STUB_PANELISTS=true
```

---

## 9. Testing & Quality

- **Unit**: Vitest — sentiment output parsing, JSONL dataset construction, CSV parsing/mapping, demographic aggregation logic, file rename rule
- **API**: integration tests against a test Postgres (Testcontainers) for every CRUD route + auth guards
- **E2E**: Playwright — create study → upload CSV → (mock Fireworks Batch API) → charts render → (mock Glean) analysis panel
- **Worker**: job-level tests with a mocked Fireworks Batch client (dataset upload → job poll → results ingest) and mocked Glean client; error-file retry, expired-job continuation, and failure paths
- Seed script: demo study with synthetic panelists + responses so the dashboard is explorable on day one

---

## 10. Build Order (milestones)

1. **Scaffold**: repo, Next.js + TS + Tailwind + shadcn, Drizzle + Postgres + Redis in Compose, Auth.js login, Dockerfiles
2. **Core CRUD**: Drizzle schema + `drizzle-kit` migrations; Users, Studies, Legs, Panelists pages + APIs
3. **Upload pipeline**: dropzone, file storage + rename rule, `StudyData`, parse job, response table
4. **Sentiment**: Fireworks Batch service (dataset build → upload → job poll → ingest), `SentimentBatch` tracking, status UI, overall + per-leg sentiment charts
5. **Demographics**: aggregation service + all breakdown charts (age/sex/race/region/income/family)
6. **Glean analysis**: agent creation, `gleanAnalysis` service, StudyAnalysis persistence, UI panel
7. **Polish**: manual overrides, error states, CSV column mapping, seeds, E2E tests, README

---

## 11. Key design decisions & tradeoffs

- **Aggregates-only to Glean**: protects consumer PII and keeps the agent input small; raw verbatims never leave the DB for the overall analysis.
- **Env-driven model**: swapping between a base Fireworks model and your fine-tuned deployment is a config change, not code.
- **Batch API over real-time inference**: sentiment classification of uploaded datasets is inherently offline — the Batch API is ~50% cheaper, handles tens of thousands of rows in one job, and its dataset/job model maps cleanly onto a resumable worker pipeline. Tradeoff: results take minutes-to-hours, so the UI is status-driven (uploaded → processing → complete) rather than instant.
- **BullMQ worker, not in-request processing**: uploads with thousands of rows plus long-running batch polls would time out request handlers; jobs give retries and progress.
- **Store age/income as values, derive bands at query time**: re-banding later doesn't require data migration.
- **StudyData vs Response split**: matches your requirement — `StudyData` is file metadata; `Response` is the parsed datum with sentiment attached.
- **Monorepo single language**: fastest path for a small team; if scale demands, the worker can be split into its own service without changing contracts.
