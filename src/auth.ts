import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { accessUntilMs } from "@/lib/auth/schedule";
import { authenticateUser } from "@/lib/auth/users";

class HorarioSignin extends CredentialsSignin {
  code = "horario";
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
        const email = String(credentials?.email ?? "");
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        const user = await authenticateUser(email, password);
        if (!user) return null;
        let accessUntil: number | undefined;
        if (user.role === "EDITOR") {
          const until = accessUntilMs(user.schedule);
          if (!until) throw new HorarioSignin();
          accessUntil = until;
        }
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
