import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// An upsert without ignoreDuplicates is ON CONFLICT DO UPDATE and needs the UPDATE privilege. day_finishes only grants
// select/insert/delete, so finishing a day failed with "permission denied for table day_finishes".
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

describe("upserts match table grants", () => {
  it("day_finishes upsert ignores duplicates instead of updating", () => {
    const src = readFileSync("src/app/(app)/nutrition/log/actions.ts", "utf8");
    const line = src.split("\n").find((l) => l.includes('from("day_finishes").upsert'));
    expect(line).toBeTruthy();
    expect(line).toContain("ignoreDuplicates: true");
  });
  it("every upserted table without UPDATE grant uses ignoreDuplicates", () => {
    const sql = walk("supabase/migrations").map((f) => readFileSync(f, "utf8")).join("\n");
    const noUpdate = ["day_finishes"].filter((t) => !new RegExp(`grant[^;]*update[^;]*on public\\.${t} to`, "i").test(sql));
    const files = walk("src").filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."));
    for (const f of files) {
      for (const l of readFileSync(f, "utf8").split("\n")) {
        for (const t of noUpdate) if (l.includes(`from("${t}").upsert`)) expect(l, f).toContain("ignoreDuplicates: true");
      }
    }
  });
});
