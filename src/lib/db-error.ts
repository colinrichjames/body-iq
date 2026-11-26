/**
 * Turns a database error into something safe to show. The real error is logged server-side only, so raw Postgres or
 * RLS text ("permission denied for table ...") never reaches the screen.
 */
export function dbError(error: { message?: string; code?: string }, full = false): string {
  console.error("database error", error.code ?? "", error.message ?? "");
  const tail = error.code === "23505" ? "That already exists." : error.code === "23514" || error.code === "22003" ? "One of the values isn't allowed." : "Please try again.";
  return full ? (tail === "Please try again." ? `Something went wrong. ${tail}` : tail) : tail;
}
