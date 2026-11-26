"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  // A guest leaving takes their data with them.
  if (data?.claims?.is_anonymous === true) {
    const { error } = await supabase.rpc("delete_guest_self");
    if (error) redirect(`/profile?notice=${encodeURIComponent("Couldn't clear your guest data, so you're still signed in. Try again.")}`);
  }
  await supabase.auth.signOut();
  redirect("/login");
}
