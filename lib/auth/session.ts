import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify, SignJWT } from "jose";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma/db";
import { sessionCookieName } from "@/lib/auth/constants";
import { ensureDatabaseReady } from "@/lib/prisma/ensure-database";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
}

export async function readSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    await ensureDatabaseReady();
    const user = await prisma.user.findUnique({
      where: { id: String(payload.id) },
      select: { id: true, email: true, name: true, role: true, active: true }
    });
    if (!user?.active) return null;
    return user;
  } catch {
    return null;
  }
}

export async function requireUser(roles?: Role[]) {
  const user = await readSession();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/dashboard");
  return user;
}
