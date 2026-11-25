import { redirect } from "next/navigation";

// Signed-out visitors are redirected to /login by src/proxy.ts.
export default function Home() {
  redirect("/dashboard");
}
