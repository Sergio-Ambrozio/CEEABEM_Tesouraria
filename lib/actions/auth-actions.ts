"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma/db";
import { createSession, destroySession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { ensureDatabaseReady } from "@/lib/prisma/ensure-database";

type LoginState = { error?: string };

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");

  await ensureDatabaseReady();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.active || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Invalid email or password." };
  }

  await createSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  });

  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
