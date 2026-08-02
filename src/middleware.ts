import { withAuth } from "next-auth/middleware";

/**
 * Every route requires a session except the login page, the NextAuth endpoints,
 * and Next's static assets. Without this, server components would render for
 * anonymous visitors (API handlers guard themselves separately, defence in depth).
 */
export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
