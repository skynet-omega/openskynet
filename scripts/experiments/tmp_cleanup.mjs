import { execSync } from "node:child_process";
import fs from "node:fs";

const stdout = execSync("find src/ -name '*.js' -type f").toString();
const files = stdout
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

let count = 0;
for (const jsFile of files) {
  const tsFile = jsFile.slice(0, -3) + ".ts";
  if (fs.existsSync(tsFile)) {
    fs.unlinkSync(jsFile);
    console.log("Deleted: " + jsFile);
    count++;
  }
}
console.log(`Successfully purged ${count} stale JS files shadowing the TS source.`);
