import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { panelists } from "@/db/schema";
import { requireUser, canWrite } from "@/lib/auth";
import { PanelistDetail } from "@/components/panelists/panelist-detail";

export default async function PanelistPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const panelist = await db.query.panelists.findFirst({ where: eq(panelists.id, id) });
  if (!panelist) notFound();

  return (
    <PanelistDetail
      panelist={{
        id: panelist.id,
        panelistId: panelist.panelistId,
        age: panelist.age,
        sex: panelist.sex,
        race: panelist.race,
        country: panelist.country,
        state: panelist.state,
        city: panelist.city,
        householdIncome: panelist.householdIncome,
        familyMakeup: panelist.familyMakeup,
        householdSize: panelist.householdSize,
        childrenCount: panelist.childrenCount,
        notes: panelist.notes,
        isStub: panelist.isStub,
      }}
      canWrite={canWrite(user.role)}
    />
  );
}
