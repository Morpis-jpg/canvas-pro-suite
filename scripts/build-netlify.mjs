import { cp, mkdir, rm, stat } from "node:fs/promises";

const entries = ["index.html", "version.json", "css", "js", "vendor", "tools"];
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const entry of entries) {
  try {
    await stat(entry);
    await cp(entry, "dist/" + entry, { recursive: true });
    console.log("copied", entry);
  } catch {
    console.log("skipped (missing)", entry);
  }
}
