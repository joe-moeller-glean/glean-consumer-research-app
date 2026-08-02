"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge, SentimentBadge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api-client";
import type { LegView } from "./study-workspace";

type ResponseRow = {
  response: {
    id: string;
    feedbackText: string;
    question: string | null;
    sentiment: string | null;
    sentimentScore: number | null;
    sentimentModel: string | null;
    sentimentOverridden: boolean;
    flaggedForReview: boolean;
    panelistExternalId: string | null;
  };
  legName: string | null;
  panelistExternal: string | null;
};

const PAGE_SIZE = 25;

/** Browse and manually correct individual sentiment classifications. */
export function ResponsesTable({
  studyId,
  legs,
  canWrite,
}: {
  studyId: string;
  legs: LegView[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sentiment, setSentiment] = useState("");
  const [legId, setLegId] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (sentiment) params.set("sentiment", sentiment);
      if (legId) params.set("legId", legId);
      if (search) params.set("q", search);
      const res = await apiRequest<{ responses: ResponseRow[]; total: number }>(
        `/api/studies/${studyId}/responses?${params}`
      );
      setRows(res.responses);
      setTotal(res.total);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [studyId, offset, sentiment, legId, search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function override(id: string, value: string) {
    try {
      await apiRequest(`/api/responses/${id}`, { method: "PATCH", body: { sentiment: value } });
      await load();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Responses</CardTitle>
        <CardDescription>
          {total} response{total === 1 ? "" : "s"}. Sentiment can be corrected manually; overrides are never
          overwritten by a later batch run.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setOffset(0);
              setSearch(query);
            }}
            className="flex gap-2"
          >
            <Input
              placeholder="Search feedback..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-56"
            />
            <Button type="submit" variant="outline" size="sm">
              Search
            </Button>
          </form>

          <Select
            value={sentiment}
            onChange={(e) => {
              setOffset(0);
              setSentiment(e.target.value);
            }}
            className="w-40"
          >
            <option value="">All sentiment</option>
            <option value="LIKE">Like</option>
            <option value="INDIFFERENT">Indifferent</option>
            <option value="DISLIKE">Dislike</option>
          </Select>

          {legs.length > 1 && (
            <Select
              value={legId}
              onChange={(e) => {
                setOffset(0);
                setLegId(e.target.value);
              }}
              className="w-44"
            >
              <option value="">All legs</option>
              {legs.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No responses match these filters.</p>
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Panelist</TH>
                  <TH>Leg</TH>
                  <TH>Feedback</TH>
                  <TH>Sentiment</TH>
                  <TH>Confidence</TH>
                  {canWrite && <TH>Override</TH>}
                </TR>
              </THead>
              <TBody>
                {rows.map(({ response: r, legName, panelistExternal }) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap font-mono text-xs">
                      {panelistExternal ?? r.panelistExternalId ?? "—"}
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-muted-foreground">{legName ?? "—"}</TD>
                    <TD className="max-w-md">
                      {r.question && <div className="text-xs text-muted-foreground">{r.question}</div>}
                      <div>{r.feedbackText}</div>
                    </TD>
                    <TD className="whitespace-nowrap">
                      <SentimentBadge sentiment={r.sentiment} />
                      {r.sentimentOverridden && (
                        <Badge tone="blue" className="ml-1">
                          manual
                        </Badge>
                      )}
                      {r.flaggedForReview && (
                        <Badge tone="amber" className="ml-1">
                          review
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-xs text-muted-foreground">
                      {r.sentimentScore !== null ? r.sentimentScore.toFixed(2) : "—"}
                    </TD>
                    {canWrite && (
                      <TD>
                        <Select
                          value={r.sentiment ?? ""}
                          onChange={(e) => override(r.id, e.target.value)}
                          className="h-8 w-36 text-xs"
                        >
                          <option value="" disabled>
                            Set...
                          </option>
                          <option value="LIKE">Like</option>
                          <option value="INDIFFERENT">Indifferent</option>
                          <option value="DISLIKE">Dislike</option>
                        </Select>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Page {page} of {pages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
