import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync("python3", ["-m", "blixtbo.knowledge"], {
  cwd: path.join(root, "server"),
  stdio: "inherit",
  env: { ...process.env, BLIXTBO_REPO: root },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
