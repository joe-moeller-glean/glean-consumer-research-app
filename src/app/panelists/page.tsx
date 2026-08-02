import { requireUser, canWrite } from "@/lib/auth";
import { PanelistManager } from "@/components/panelists/panelist-manager";

export default async function PanelistsPage() {
  const user = await requireUser();
  return <PanelistManager canWrite={canWrite(user.role)} />;
}
