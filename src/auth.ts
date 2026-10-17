import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { headers } from "next/headers";
import { authConfig } from "@/auth.config";
import { appendAccessLog } from "@/lib/auth/accessLogs";
import { accessUntilMs } from "@/lib/auth/schedule";
import { authenticateUser } from "@/lib/auth/users";

class HorarioSignin extends CredentialsSignin {
  code = "horario";
}

async function clientIp() {
  try {
    const h = await headers();
    return (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0]?.trim() ?? "";
  } catch {
    return "";
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credenciales",
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        const ip = await clientIp();
        if (!email || !password) return null;
        const user = await authenticateUser(email, password);
        if (!user) {
          void appendAccessLog({
            at: new Date().toISOString(),
            email,
            name: "",
            role: "",
            campus: "",
            result: "credenciales",
            ip,
          }).catch(() => undefined);
          return null;
        }
        let accessUntil: number | undefined;
        if (user.role === "EDITOR") {
          const until = accessUntilMs(user.schedule);
          if (!until) {
            void appendAccessLog({
              at: new Date().toISOString(),
              email: user.email,
              name: user.name,
              role: user.role,
              campus: user.campus,
              result: "horario",
              ip,
            }).catch(() => undefined);
            throw new HorarioSignin();
          }
          accessUntil = until;
        }
        void appendAccessLog({
          at: new Date().toISOString(),
          email: user.email,
          name: user.name,
          role: user.role,
          campus: user.campus,
          result: "ok",
          ip,
        }).catch(() => undefined);
        return {
          id: user.email,
          email: user.email,
          name: user.name,
          role: user.role,
          campus: user.campus,
          accessUntil,
        };
      },
    }),
  ],
});
