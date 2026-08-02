import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { studies } from "@/db/schema";
import { requireUser, canWrite } from "@/lib/auth";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { SentimentSparkBar } from "@/components/charts";
import { NewStudyDialog } from "@/components/new-study-dialog";

/** Studies dashboard: the app's landing page. */
export default async function StudiesPage() {
  const user = await requireUser();

  const rows = await db
    .select({
      study: studies,
      legCount: sql<number>`(SELECT count(*)::int FROM legs WHERE legs.study_id = ${studies.id})`,
      responseCount: sql<number>`(SELECT count(*)::int FROM responses WHERE responses.study_id = ${studies.id})`,
      likeCount: sql<number>`(SELECT count(*)::int FROM responses WHERE responses.study_id = ${studies.id} AND responses.sentiment = 'LIKE')`,
      dislikeCount: sql<number>`(SELECT count(*)::int FROM responses WHERE responses.study_id = ${studies.id} AND responses.sentiment = 'DISLIKE')`,
      indifferentCount: sql<number>`(SELECT count(*)::int FROM responses WHERE responses.study_id = ${studies.id} AND responses.sentiment = 'INDIFFERENT')`,
    })
    .from(studies)
    .orderBy(desc(studies.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Studies</h1>
          <p className="text-sm text-muted-foreground">
            Consumer research studies, sentiment analysis, and demographic breakdowns
          </p>
        </div>
        {canWrite(user.role) && <NewStudyDialog />}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="font-medium">No studies yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a study, then upload consumer feedback CSVs to analyze sentiment.
          </p>
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Study</TH>
              <TH>Product</TH>
              <TH>Version</TH>
              <TH>Status</TH>
              <TH>Legs</TH>
              <TH>Responses</TH>
              <TH>Sentiment</TH>
              <TH>Created</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.study.id}>
                <TD>
                  <Link href={`/studies/${r.study.id}`} className="font-medium text-primary hover:underline">
                    {r.study.name}
                  </Link>
                </TD>
                <TD>{r.study.product}</TD>
                <TD className="text-muted-foreground">{r.study.productVersion}</TD>
                <TD>
                  <StatusBadge status={r.study.status} />
                </TD>
                <TD>{r.legCount}</TD>
                <TD>{r.responseCount}</TD>
                <TD>
                  <SentimentSparkBar
                    like={r.likeCount}
                    dislike={r.dislikeCount}
                    indifferent={r.indifferentCount}
                  />
                </TD>
                <TD className="text-xs text-muted-foreground">
                  {r.study.createdAt.toLocaleDateString()}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
