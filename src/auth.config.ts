import type { NextAuthConfig } from "next-auth";
import { parseRole } from "@/lib/auth/roles";
import { DEFAULT_CAMPUS, parseCampus } from "@/lib/campus";

export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.campus = user.campus;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = parseRole(token.role) ?? "VIEWER";
        session.user.campus =
          token.email === "admin@auditorio.local"
            ? "ALL"
            : (parseCampus(token.campus) ?? DEFAULT_CAMPUS);
        session.user.email = token.email ?? session.user.email;
        session.user.name = token.name ?? session.user.name;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
