import { getServerSession, type NextAuthOptions, type Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { env } from "@/lib/env";

declare module "next-auth" {
  interface Session {
    user: { id: string; email: string; name: string; role: "ADMIN" | "RESEARCHER" | "VIEWER" };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "ADMIN" | "RESEARCHER" | "VIEWER";
  }
}

export const authOptions: NextAuthOptions = {
  secret: env.nextAuthSecret,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        const rows = await db
          .select()
          .from(users)
          .where(eq(users.email, credentials.email.toLowerCase().trim()))
          .limit(1);
        const user = rows[0];
        if (!user || !user.active || !user.passwordHash) return null;
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as { id: string; role: "ADMIN" | "RESEARCHER" | "VIEWER" };
        token.id = u.id;
        token.role = u.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id && token.role) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
};

export async function getSession(): Promise<Session | null> {
  return getServerSession(authOptions);
}

export async function requireUser() {
  const session = await getSession();
  if (!session?.user) throw new ApiError(401, "Unauthorized");
  return session.user;
}

export async function requireRole(...roles: Array<"ADMIN" | "RESEARCHER" | "VIEWER">) {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new ApiError(403, "Forbidden");
  return user;
}

export const canWrite = (role: string) => role === "ADMIN" || role === "RESEARCHER";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiError(e: unknown): globalThis.Response {
  const err = e as { status?: number; message?: string; issues?: unknown };
  const status = err.status ?? 500;
  const body: Record<string, unknown> = { error: err.message ?? "Internal server error" };
  if (err.issues) body.issues = err.issues;
  return Response.json(body, { status });
}
