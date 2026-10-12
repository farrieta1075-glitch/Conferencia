import { DefaultSession } from "next-auth";
import type { Role } from "@/lib/auth/roles";
import type { Campus } from "@/lib/campus";

declare module "next-auth" {
  interface User {
    role: Role;
    campus: Campus;
  }

  interface Session {
    user: {
      role: Role;
      campus: Campus;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
    campus?: Campus;
  }
}
