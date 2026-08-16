import { redirect } from "next/navigation";
import { currentUser, homeForRole } from "@/lib/server-auth";

export default async function Home() {
  const user = await currentUser();
  redirect(user ? homeForRole(user.role) : "/login");
}
