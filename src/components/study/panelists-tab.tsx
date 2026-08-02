"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api-client";
import { SEX_LABELS, INCOME_LABELS, FAMILY_MAKEUP_LABELS } from "@/lib/labels";

type Row = {
  panelist: {
    id: string;
    panelistId: string;
    age: number | null;
    sex: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    householdIncome: string | null;
    familyMakeup: string | null;
    isStub: boolean;
  };
  legNames: string[];
  responseCount: number;
};

/** Panelists who participated in this study, and in which legs. */
export function PanelistsTab({ studyId }: { studyId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest<{ panelists: Row[] }>(`/api/studies/${studyId}/panelists`)
      .then((res) => setRows(res.panelists))
      .catch((e) => setError((e as Error).message));
  }, [studyId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Study panelists</CardTitle>
        <CardDescription>{rows.length} participants and the legs they took part in</CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No panelists linked to this study yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Panelist ID</TH>
                <TH>Age</TH>
                <TH>Sex</TH>
                <TH>Region</TH>
                <TH>Income</TH>
                <TH>Family</TH>
                <TH>Legs</TH>
                <TH>Responses</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ panelist: p, legNames, responseCount }) => (
                <TR key={p.id}>
                  <TD>
                    <Link href={`/panelists/${p.id}`} className="font-mono text-xs text-primary hover:underline">
                      {p.panelistId}
                    </Link>
                    {p.isStub && (
                      <Badge tone="amber" className="ml-2">
                        incomplete
                      </Badge>
                    )}
                  </TD>
                  <TD>{p.age ?? "—"}</TD>
                  <TD>{p.sex ? SEX_LABELS[p.sex] : "—"}</TD>
                  <TD className="text-xs">
                    {[p.city, p.state, p.country].filter(Boolean).join(", ") || "—"}
                  </TD>
                  <TD className="text-xs">{p.householdIncome ? INCOME_LABELS[p.householdIncome] : "—"}</TD>
                  <TD className="text-xs">{p.familyMakeup ? FAMILY_MAKEUP_LABELS[p.familyMakeup] : "—"}</TD>
                  <TD className="text-xs">{legNames.join(", ") || "—"}</TD>
                  <TD>{responseCount}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
