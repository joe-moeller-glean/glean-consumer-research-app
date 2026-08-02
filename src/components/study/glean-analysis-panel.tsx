"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api-client";
import type { AnalysisView } from "./study-workspace";

/**
 * Runs the hosted Glean agent over the aggregated sentiment breakdown and shows
 * the written analysis. Only aggregates are sent to Glean, never verbatims.
 */
export function GleanAnalysisPanel({
  studyId,
  initialAnalysis,
  canWrite,
  gleanLive,
  hasAnalyzedData,
}: {
  studyId: string;
  initialAnalysis: AnalysisView | null;
  canWrite: boolean;
  gleanLive: boolean;
  hasAnalyzedData: boolean;
}) {
  const [analysis, setAnalysis] = useState<AnalysisView | null>(initialAnalysis);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inFlight = analysis?.status === "PENDING" || analysis?.status === "RUNNING";

  const refresh = useCallback(async () => {
    try {
      const res = await apiRequest<{ analyses: AnalysisView[] }>(`/api/studies/${studyId}/analysis/glean`);
      setAnalysis(res.analyses[0] ?? null);
    } catch {
      // Transient failure; the next poll will retry.
    }
  }, [studyId]);

  // Poll only while a run is in progress.
  useEffect(() => {
    if (!inFlight) return;
    timer.current = setTimeout(refresh, 3000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [inFlight, analysis, refresh]);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const res = await apiRequest<{ analysis: AnalysisView }>(`/api/studies/${studyId}/analysis/glean`, {
        method: "POST",
      });
      setAnalysis(res.analysis);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            Overall analysis by Glean
            {!gleanLive && <Badge tone="amber">offline mode</Badge>}
            {analysis && <StatusBadge status={analysis.status} />}
          </CardTitle>
          <CardDescription>
            Aggregated sentiment by demographic is sent to a hosted Glean agent, which writes the analysis.
            No verbatims or panelist PII leave the database.
          </CardDescription>
        </div>
        {canWrite && (
          <Button onClick={generate} disabled={busy || inFlight || !hasAnalyzedData} variant="outline" size="sm">
            {busy || inFlight ? "Generating..." : analysis ? "Regenerate" : "Generate analysis"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

        {!hasAnalyzedData && (
          <p className="text-sm text-muted-foreground">
            Waiting on sentiment results before an analysis can be generated.
          </p>
        )}

        {hasAnalyzedData && !analysis && (
          <p className="text-sm text-muted-foreground">
            No analysis yet. {canWrite ? "Generate one to summarize the results." : "Ask a researcher to generate one."}
          </p>
        )}

        {analysis?.status === "FAILED" && (
          <p className="text-sm text-destructive">Analysis failed: {analysis.error ?? "unknown error"}</p>
        )}

        {analysis?.outputText && (
          <div className="prose prose-sm max-w-none prose-headings:font-semibold prose-h2:text-lg prose-h3:text-base">
            <ReactMarkdown>{analysis.outputText}</ReactMarkdown>
          </div>
        )}

        {analysis?.model && (
          <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
            {analysis.model} &middot; {new Date(analysis.createdAt).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
