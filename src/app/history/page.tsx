import { redirect } from "next/navigation";

// History lives under Training. This keeps /history from being a dead end.
export default function HistoryRedirect() {
  redirect("/workouts/history");
}
