// =============================================================================
// INFRA I.6a — Auth Edge Config (middleware-safe)
// =============================================================================
// Lightweight NextAuth config that runs on the Edge runtime (< 1 MB).
// Contains NO database imports (Prisma, PrismaAdapter, bcrypt).
// Used by middleware.ts to decode the JWT and check roles.
//
// The full config (with adapter, providers, DB callbacks) lives in config.ts.
// =============================================================================

import { type DefaultSession, type NextAuthConfig } from "next-auth";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      company?: string | null;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    company?: string | null;
    role?: string;
  }
}

/**
 * Edge-safe auth config — no adapter, no DB, no heavy deps.
 * Only what's needed to decrypt the JWT and expose session fields.
 */
export const authEdgeConfig = {
  providers: [],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.id as string,
        company: token.company as string | null,
        role: (token.role as string) ?? "OPERATOR",
      },
    }),
  },
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;
