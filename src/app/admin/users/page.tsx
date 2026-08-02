import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { UserManager } from "@/components/admin/user-manager";

/** Admin-only user management. Non-admins are redirected rather than shown a 403. */
export default async function UsersPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return <UserManager currentUserId={user.id} />;
}
