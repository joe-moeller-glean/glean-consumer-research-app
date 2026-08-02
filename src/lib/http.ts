import { ZodError, z } from "zod";

/** Error with an HTTP status, thrown by route handlers and mapped by apiError(). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Single error mapper for every route handler.
 * Zod validation failures become 400s (never leaked as 500s), and unexpected
 * errors are logged server-side but never echoed back to the client.
 */
export function apiError(e: unknown): Response {
  if (e instanceof ZodError) {
    return Response.json(
      {
        error: "Validation failed",
        issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 }
    );
  }
  if (e instanceof ApiError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  console.error("[api] unhandled error:", e);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

const uuidSchema = z.string().uuid();

/**
 * Validate a path parameter before it is used in a query or a filesystem path.
 * Prevents traversal / injection via crafted route segments (study ids are used
 * to build upload directory names).
 */
export function requireUuid(value: string, label = "id"): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, `Invalid ${label}`);
  return parsed.data;
}

/** Parse a JSON body, returning 400 rather than 500 on malformed JSON. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON");
  }
}
