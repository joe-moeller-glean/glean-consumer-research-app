const isProd = process.env.NODE_ENV === "production";

// `next build` imports modules to collect route metadata, so runtime secrets are
// not available yet. Validation must not fail the build.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

/**
 * Required setting. At production runtime a missing value is a hard failure so
 * the app can never serve traffic with an insecure development default (for
 * example the auth secret).
 */
function req(name: string, devFallback: string): string {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  if (isProd && !isBuildPhase) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return devFallback;
}

function optional(name: string): string {
  return process.env[name] ?? "";
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
}

function int(name: string, fallback: number): number {
  const n = parseInt(process.env[name] ?? "", 10);
  return Number.isNaN(n) ? fallback : n;
}

export const env = {
  isProd,

  databaseUrl: req("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/consumer_research"),
  redisUrl: req("REDIS_URL", "redis://localhost:6379"),
  nextAuthSecret: req("NEXTAUTH_SECRET", "dev-only-secret-do-not-use-in-production"),

  // Fireworks: the fine-tuned sentiment model is selected purely by env var.
  fireworksApiKey: optional("FIREWORKS_API_KEY"),
  fireworksAccountId: optional("FIREWORKS_ACCOUNT_ID"),
  fireworksModel: req("FIREWORKS_MODEL", "accounts/fireworks/models/llama-v3p1-8b-instruct"),
  fireworksBaseUrl: req("FIREWORKS_BASE_URL", "https://api.fireworks.ai"),
  fireworksBatchExpiryHours: int("FIREWORKS_BATCH_EXPIRY_HOURS", 24),
  fireworksPollIntervalMs: int("FIREWORKS_POLL_INTERVAL_MS", 30_000),
  sentimentMock: bool("SENTIMENT_MOCK", false),

  // Glean hosted agent used for the written overall analysis.
  gleanApiToken: optional("GLEAN_API_TOKEN"),
  gleanAgentId: optional("GLEAN_AGENT_ID"),
  gleanBaseUrl: req("GLEAN_BASE_URL", "https://api.glean.com"),
  gleanMock: bool("GLEAN_MOCK", false),

  uploadsDir: req("UPLOADS_DIR", "./data/uploads"),
  maxUploadMb: int("MAX_UPLOAD_MB", 200),
  maxZipEntries: int("MAX_ZIP_ENTRIES", 200),

  autoCreateStubPanelists: bool("AUTO_CREATE_STUB_PANELISTS", true),

  seedAdminEmail: process.env.SEED_ADMIN_EMAIL ?? "admin@example.com",
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD ?? "admin1234",
};

/** True when real Fireworks batch inference is configured. */
export const fireworksConfigured = (): boolean =>
  Boolean(env.fireworksApiKey && env.fireworksAccountId) && !env.sentimentMock;

/** True when a real hosted Glean agent is configured. */
export const gleanConfigured = (): boolean =>
  Boolean(env.gleanApiToken && env.gleanAgentId) && !env.gleanMock;
