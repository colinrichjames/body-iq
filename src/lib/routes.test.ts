import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Every literal internal link in the app must point at a page that exists (no linked 404s).
const ROOT = join(process.cwd(), "src/app");

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** URL path patterns of every page and route handler, e.g. /races/[id]/edit. */
function routes(): RegExp[] {
  return walk(ROOT)
    .filter((f) => /(^|\/)(page|route)\.tsx?$/.test(f))
    .map((f) => {
      const rel = f.slice(ROOT.length).replace(/\/(page|route)\.tsx?$/, "") || "/";
      const url = rel.split("/").filter((s) => s && !/^\(.*\)$/.test(s)).join("/");
      const pattern = "/" + url.replace(/\[\[?\.\.\.[^\]]+\]\]?/g, ".*").replace(/\[[^\]]+\]/g, "[^/]+");
      return new RegExp(`^${pattern}$`);
    });
}

describe("internal links", () => {
  it("never point at a page that doesn't exist", () => {
    const known = routes();
    const bad: string[] = [];
    for (const f of walk(join(process.cwd(), "src")).filter((x) => /\.tsx$/.test(x) && !/\.test\./.test(x))) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/href=(?:"|\{`)(\/[A-Za-z0-9\-_/]*)(?=["?#`$])/g)) {
        const path = m[1].length > 1 ? m[1].replace(/\/$/, "") : m[1];
        if (/^\/(api|auth|export|undo|sw\.js|manifest)/.test(path)) continue;
        // A link built from a variable ends in a slash before ${...}: check that its parent exists instead.
        const dynamic = src.slice(m.index!, m.index! + m[0].length + 2).includes("${") && m[1].endsWith("/");
        if (dynamic) continue;
        if (!known.some((r) => r.test(path)) && !existsSync(join(process.cwd(), "public", path))) bad.push(`${f.replace(process.cwd() + "/", "")}: ${path}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
