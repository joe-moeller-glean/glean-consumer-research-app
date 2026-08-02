"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Studies" },
  { href: "/panelists", label: "Panelists" },
  { href: "/admin/users", label: "Users", adminOnly: true },
];

export function Nav({ user }: { user: { name: string; email: string; role: string } }) {
  const pathname = usePathname();
  return (
    <aside className="w-56 shrink-0 border-r bg-muted/30 p-4 flex flex-col">
      <div className="mb-8">
        <div className="text-lg font-bold text-primary">Glean</div>
        <div className="text-xs text-muted-foreground">Consumer Research</div>
      </div>
      <nav className="flex flex-col gap-1">
        {links
          .filter((l) => !l.adminOnly || user.role === "ADMIN")
          .map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  active ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
      </nav>
      <div className="mt-auto border-t pt-4">
        <div className="text-sm font-medium">{user.name}</div>
        <div className="text-xs text-muted-foreground">{user.role}</div>
        <a href="/api/auth/signout" className="mt-2 block text-xs text-primary hover:underline">
          Sign out
        </a>
      </div>
    </aside>
  );
}
