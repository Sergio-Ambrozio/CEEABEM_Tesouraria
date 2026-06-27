import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";

export default async function Home() {
  const user = await readSession();
  redirect(user ? "/dashboard" : "/login");
}
