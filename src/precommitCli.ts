/**
 * Standalone: `node out/precommitCli.js <repoRoot>`
 * Exits 1 if there are "mine" debug lines in the git index, 0 otherwise.
 */
import { runPrecommitScan } from "./precommitNode";

const root = process.argv[2] || process.cwd();
const email = process.env["LOGGHOST_USER_EMAIL"] || undefined;
const r = runPrecommitScan(root, email);
if (r.code === 0) {
  process.exit(0);
}
const lines = r.mine.slice(0, 5).map(
  (m) => `  ${m.file}:${m.line0 + 1}`
);
process.stderr.write(
  "Log Ghost: staged 'mine' debug lines:\n" +
    lines.join("\n") +
    (r.mine.length > 5 ? `\n  …and ${r.mine.length - 5} more` : "") +
    "\n"
);
process.exit(1);
