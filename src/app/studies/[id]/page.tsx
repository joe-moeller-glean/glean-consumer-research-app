import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { studies } from "@/db/schema";
import { requireUser, canWrite } from "@/lib/auth";
import { aggregateStudy } from "@/lib/aggregate";
import { latestAnalysis } from "@/lib/glean";
import { env, fireworksConfigured, gleanConfigured } from "@/lib/env";
import { StudyWorkspace } from "@/components/study/study-workspace";

/** Study detail: metadata, upload, charts, and the Glean written analysis. */
export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  // Invalid ids simply 404 rather than surfacing a database error.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const study = await db.query.studies.findFirst({
    where: eq(studies.id, id),
    with: {
      legs: { orderBy: (l, { asc }) => [asc(l.sequence)] },
      createdBy: { columns: { id: true, name: true, email: true } },
    },
  });
  if (!study) notFound();

  const [summary, analysis] = await Promise.all([aggregateStudy(id), latestAnalysis(id)]);

  return (
    <StudyWorkspace
      study={{
        ...study,
        createdAt: study.createdAt.toISOString(),
        updatedAt: study.updatedAt.toISOString(),
        startDate: study.startDate?.toISOString() ?? null,
        endDate: study.endDate?.toISOString() ?? null,
      }}
      legs={study.legs.map((l) => ({ id: l.id, name: l.name, sequence: l.sequence, testVariant: l.testVariant }))}
      summary={summary}
      initialAnalysis={
        analysis
          ? {
              id: analysis.id,
              status: analysis.status,
              outputText: analysis.outputText,
              model: analysis.model,
              error: analysis.error,
              createdAt: analysis.createdAt.toISOString(),
            }
          : null
      }
      canWrite={canWrite(user.role)}
      integrations={{
        sentimentModel: env.sentimentMock ? "mock classifier" : env.fireworksModel,
        fireworksLive: fireworksConfigured(),
        gleanLive: gleanConfigured(),
      }}
    />
  );
}
