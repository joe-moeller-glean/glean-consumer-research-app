"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SentimentDonut, BreakdownChart, LegComparisonChart } from "@/components/charts";
import type { StudySummary } from "@/lib/aggregate";
import { GleanAnalysisPanel } from "./glean-analysis-panel";
import type { StudyView, AnalysisView, Integrations } from "./study-workspace";

const DEMOGRAPHIC_SECTIONS = [
  { key: "age", title: "Age", description: "Sentiment within each age range" },
  { key: "sex", title: "Sex", description: "Sentiment by sex" },
  { key: "race", title: "Race", description: "Sentiment by race" },
  { key: "income", title: "Household income", description: "Sentiment by income band" },
  { key: "familyMakeup", title: "Family makeup", description: "Sentiment by household composition" },
  { key: "householdSize", title: "Household size", description: "Sentiment by number of people in the household" },
  { key: "children", title: "Children", description: "Sentiment by number of children" },
] as const;

export function OverviewTab({
  study,
  summary,
  initialAnalysis,
  canWrite,
  integrations,
  onGoToData,
}: {
  study: StudyView;
  summary: StudySummary;
  initialAnalysis: AnalysisView | null;
  canWrite: boolean;
  integrations: Integrations;
  onGoToData: () => void;
}) {
  if (summary.totalResponses === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="font-medium">No data uploaded yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Upload a CSV, several CSVs, or a ZIP of CSVs. Each response is classified as Like, Dislike, or
          Indifferent by the Fireworks model, then broken down by demographic.
        </p>
        <Button className="mt-4" onClick={onGoToData}>
          Go to uploads
        </Button>
      </div>
    );
  }

  const pending = summary.totalResponses - summary.analyzedResponses;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Study details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Detail label="Product" value={study.product} />
            <Detail label="Product version" value={study.productVersion} />
            <Detail label="Test criteria" value={study.testCriteria} />
            {study.category && <Detail label="Category" value={study.category} />}
            {study.targetPanelSize && <Detail label="Target panel size" value={String(study.targetPanelSize)} />}
            <Detail
              label="Responses"
              value={
                pending > 0
                  ? `${summary.analyzedResponses} analyzed, ${pending} pending`
                  : `${summary.analyzedResponses} analyzed`
              }
            />
            <Detail label="Sentiment model" value={integrations.sentimentModel} />
            {study.createdBy && <Detail label="Created by" value={study.createdBy.name} />}
            {study.description && <Detail label="Description" value={study.description} />}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Overall sentiment</CardTitle>
            <CardDescription>
              {summary.overall.likePct}% Like &middot; {summary.overall.indifferentPct}% Indifferent &middot;{" "}
              {summary.overall.dislikePct}% Dislike
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SentimentDonut overall={summary.overall} />
          </CardContent>
        </Card>
      </div>

      {summary.byLeg.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sentiment by leg</CardTitle>
            <CardDescription>Each leg tests something different within this study</CardDescription>
          </CardHeader>
          <CardContent>
            <LegComparisonChart legs={summary.byLeg} />
          </CardContent>
        </Card>
      )}

      <GleanAnalysisPanel
        studyId={study.id}
        initialAnalysis={initialAnalysis}
        canWrite={canWrite}
        gleanLive={integrations.gleanLive}
        hasAnalyzedData={summary.analyzedResponses > 0}
      />

      <div>
        <h2 className="mb-1 text-lg font-semibold">Demographic breakdown</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Each bar shows the Like / Indifferent / Dislike split within that segment.
        </p>
        <div className="grid gap-6 xl:grid-cols-2">
          {DEMOGRAPHIC_SECTIONS.map((section) => (
            <Card key={section.key}>
              <CardHeader>
                <CardTitle className="text-base">{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <BreakdownChart rows={summary.demographics[section.key]} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-1 text-lg font-semibold">Region</h2>
        <p className="mb-4 text-sm text-muted-foreground">Country, then state, then city.</p>
        <div className="grid gap-6 xl:grid-cols-2">
          <RegionCard title="Country" rows={summary.regions.country} />
          <RegionCard title="State" rows={summary.regions.state} />
          <RegionCard title="City" rows={summary.regions.city} />
        </div>
      </div>
    </div>
  );
}

function RegionCard({ title, rows }: { title: string; rows: StudySummary["regions"]["country"] }) {
  const top = rows.slice(0, 12);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? "value" : "values"}
            {rows.length > top.length ? ` (top ${top.length} shown)` : ""}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <BreakdownChart rows={top} />
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 whitespace-pre-wrap">{value}</div>
    </div>
  );
}
