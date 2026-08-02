/** Small fetch wrapper: throws the server's error message for toast/inline display. */
export async function apiRequest<T>(
  url: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!res.ok) {
    const issues = json.issues as Array<{ path: string; message: string }> | undefined;
    const detail = issues?.map((i) => `${i.path}: ${i.message}`).join(", ");
    throw new Error(detail || (json.error as string) || `Request failed (${res.status})`);
  }
  return json as T;
}
