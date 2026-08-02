"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/badge";
import type { StudySummary } from "@/lib/aggregate";
import { OverviewTab } from "./overview-tab";
import { DataTab } from "./data-tab";
import { PanelistsTab } from "./panelists-tab";
import { SettingsTab } from "./settings-tab";

export type StudyView = {
  id: string;
  name: string;
  product: string;
  productVersion: string;
  testCriteria: string;
  description: string | null;
  category: string | null;
  status: string;
  targetPanelSize: number | null;
  createdAt: string;
  updatedAt: string;
  startDate: string | null;
  endDate: string | null;
  createdBy: { id: string; name: string; email: string } | null;
};

export type LegView = { id: string; name: string; sequence: number; testVariant: string | null };

export type AnalysisView = {
  id: string;
  status: string;
  outputText: string | null;
  model: string | null;
  error: string | null;
  createdAt: string;
};

export type Integrations = {
  sentimentModel: string;
  fireworksLive: boolean;
  gleanLive: boolean;
};

export function StudyWorkspace({
  study,
  legs,
  summary,
  initialAnalysis,
  canWrite,
  integrations,
}: {
  study: StudyView;
  legs: LegView[];
  summary: StudySummary;
  initialAnalysis: AnalysisView | null;
  canWrite: boolean;
  integrations: Integrations;
}) {
  const hasData = summary.totalResponses > 0;
  const [tab, setTab] = useState(hasData ? "overview" : "data");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          &larr; Studies
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{study.name}</h1>
          <StatusBadge status={study.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {study.product} &middot; {study.productVersion}
          {study.category ? ` · ${study.category}` : ""}
        </p>
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "data", label: "Data & uploads" },
          { id: "panelists", label: "Panelists" },
          { id: "settings", label: "Settings" },
        ]}
      />

      {tab === "overview" && (
        <OverviewTab
          study={study}
          summary={summary}
          initialAnalysis={initialAnalysis}
          canWrite={canWrite}
          integrations={integrations}
          onGoToData={() => setTab("data")}
        />
      )}
      {tab === "data" && (
        <DataTab studyId={study.id} legs={legs} canWrite={canWrite} integrations={integrations} />
      )}
      {tab === "panelists" && <PanelistsTab studyId={study.id} />}
      {tab === "settings" && <SettingsTab study={study} legs={legs} canWrite={canWrite} />}
    </div>
  );
}
