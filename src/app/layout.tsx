import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Glean Consumer Research",
  description: "Consumer research study management and sentiment analysis",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en">
      <body className="min-h-screen">
        {session?.user ? (
          <div className="flex min-h-screen">
            <Nav user={session.user} />
            <main className="flex-1 overflow-y-auto p-8">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
