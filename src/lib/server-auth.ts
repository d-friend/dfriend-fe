import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthUser } from "@/types/contracts";

export type UserRole = AuthUser["role"];

const roleHome: Record<UserRole, string> = {
  ADMIN: "/admin",
  TEACHER: "/teacher/copilot/new",
  STUDENT: "/student/dashboard",
};

export function homeForRole(role: UserRole) {
  return roleHome[role];
}

export async function currentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  if (!cookieStore.has("access_token")) return null;

  const backend = process.env.BACKEND_API_URL || "http://localhost:3002";
  try {
    const response = await fetch(`${backend.replace(/\/$/, "")}/api/auth/me`, {
      headers: { cookie: cookieStore.toString() },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as AuthUser;
  } catch {
    return null;
  }
}

export async function requireRole(role: UserRole) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(homeForRole(user.role));
  return user;
}
