function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined) return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

export const env = {
  databaseUrl: req("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/consumer_research"),
  redisUrl: req("REDIS_URL", "redis://localhost:6379"),
  nextAuthSecret: req("NEXTAUTH_SECRET", "dev-secret-change-me"),

  fireworksApiKey: process.env.FIREWORKS_API_KEY ?? "",
  fireworksAccountId: process.env.FIREWORKS_ACCOUNT_ID ?? "",
  fireworksModel: req("FIREWORKS_MODEL", "accounts/fireworks/models/llama-v3p1-8b-instruct"),
  fireworksBaseUrl: req("FIREWORKS_BASE_URL", "https://api.fireworks.ai"),
  fireworksBatchExpiryHours: int("FIREWORKS_BATCH_EXPIRY_HOURS", 24),
  fireworksPollIntervalMs: int("FIREWORKS_POLL_INTERVAL_MS", 30000),
  sentimentMock: bool("SENTIMENT_MOCK", false),

  gleanApiToken: process.env.GLEAN_API_TOKEN ?? "",
  gleanAgentId: process.env.GLEAN_AGENT_ID ?? "",
  gleanBaseUrl: req("GLEAN_BASE_URL", "https://api.glean.com"),
  gleanMock: bool("GLEAN_MOCK", false),

  uploadsDir: req("UPLOADS_DIR", "./data/uploads"),
  maxUploadMb: int("MAX_UPLOAD_MB", 200),

  autoCreateStubPanelists: bool("AUTO_CREATE_STUB_PANELISTS", true),

  seedAdminEmail: process.env.SEED_ADMIN_EMAIL ?? "admin@example.com",
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD ?? "admin1234",
};
