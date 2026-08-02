import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Glean Consumer Research",
  description: "Consumer research studies with Fireworks sentiment analysis and Glean insight",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>
          {session?.user ? (
            <div className="flex min-h-screen">
              <Nav user={session.user} />
              <main className="flex-1 overflow-x-hidden p-8">{children}</main>
            </div>
          ) : (
            children
          )}
        </Providers>
      </body>
    </html>
  );
}
