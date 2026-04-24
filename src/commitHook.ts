import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { runPrecommitScan, type StagedMineHit } from "./precommitNode";

const HOOK_MARKER = "# Log Ghost hook (managed by extension)";

export function writePreCommitHookIfEnabled(
  ctx: vscode.ExtensionContext,
  wf: vscode.WorkspaceFolder
): void {
  const cfg = vscode.workspace.getConfiguration("logGhost");
  if (!cfg.get<boolean>("preCommitHook", true)) {
    return;
  }
  const gitDir = path.join(wf.uri.fsPath, ".git");
  const hookPath = path.join(gitDir, "hooks", "pre-commit");
  if (!fs.existsSync(gitDir)) {
    return;
  }
  const hooksDir = path.dirname(hookPath);
  try {
    fs.mkdirSync(hooksDir, { recursive: true });
  } catch {
    return;
  }
  const cliJs = path.join(ctx.extensionPath, "out", "precommitCli.js");
  if (!fs.existsSync(cliJs)) {
    return;
  }
  let existing = "";
  try {
    existing = fs.readFileSync(hookPath, "utf8");
  } catch {
    existing = "";
  }
  const block = `#!/bin/sh
${HOOK_MARKER}
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLI="${cliJs.replace(/\\/g, "/")}"
export LOGGHOST_USER_EMAIL="$(git -C "$ROOT" config user.email 2>/dev/null)"
if [ -f "$CLI" ] && command -v node >/dev/null 2>&1; then
  node "$CLI" "$ROOT"
  EC=$?
  if [ "$EC" -ne 0 ]; then
    echo ""
    echo "Log Ghost blocked the commit. Fix via sidebar, or: git commit --no-verify"
    exit 1
  fi
fi
exit 0
`;
  if (existing.includes(HOOK_MARKER)) {
    fs.writeFileSync(hookPath, block, { encoding: "utf8", mode: 0o755 });
  } else if (!existing.trim()) {
    fs.writeFileSync(hookPath, block, { encoding: "utf8", mode: 0o755 });
  }
  // If user had a custom hook without marker, do not overwrite
}

export async function removeMineFromStaged(wf: vscode.WorkspaceFolder): Promise<number> {
  const r = runPrecommitScan(wf.uri.fsPath);
  if (r.mine.length === 0) {
    return 0;
  }
  const byFile = new Map<string, StagedMineHit[]>();
  for (const m of r.mine) {
    if (!byFile.has(m.file)) {
      byFile.set(m.file, []);
    }
    byFile.get(m.file)!.push(m);
  }
  let n = 0;
  for (const [rel, hits] of byFile) {
    const p = path.join(wf.uri.fsPath, rel);
    let t: string;
    try {
      t = fs.readFileSync(p, "utf8");
    } catch {
      continue;
    }
    const crlf = t.includes("\r\n");
    const joiner = crlf ? "\r\n" : "\n";
    const lines = t.split(/\r\n|\n/);
    for (const h of hits.sort((a, b) => b.line0 - a.line0)) {
      if (h.line0 >= 0 && h.line0 < lines.length) {
        lines.splice(h.line0, 1);
        n++;
      }
    }
    let body = lines.join(joiner);
    if (t.endsWith("\n") || t.endsWith("\r\n")) {
      body += joiner;
    }
    fs.writeFileSync(p, body, { encoding: "utf8" });
    try {
      execFileSync("git", ["-C", wf.uri.fsPath, "add", rel], { encoding: "utf8" });
    } catch {
      // ignore
    }
  }
  return n;
}

export async function showPreCommitWarningIfStaged(
  wf: vscode.WorkspaceFolder
): Promise<"ok" | "aborted" | "removed"> {
  const r = runPrecommitScan(
    wf.uri.fsPath,
    vscode.workspace.getConfiguration("logGhost").get<string>("currentUserEmail") || undefined
  );
  if (r.code === 0) {
    return "ok";
  }
  const n = r.mine.length;
  const sample = r.mine
    .slice(0, 5)
    .map((m) => `${m.file}:${m.line0 + 1}`);
  const more = n > 5 ? `\n…+${n - 5} more` : "";
  const msg = `You added ${n} console log(s) while debugging\n${sample.join("\n")}${more}`;
  const act = await vscode.window.showWarningMessage(
    msg,
    { modal: true },
    "Remove mine and continue",
    "Commit anyway (not recommended)"
  );
  if (act === "Remove mine and continue") {
    const removed = await removeMineFromStaged(wf);
    void removed;
    void vscode.window.showInformationMessage(
      `Log Ghost: removed ${removed} line(s) and re-staged. Run commit again.`
    );
    return "removed";
  }
  if (act === "Commit anyway (not recommended)") {
    return "ok";
  }
  return "aborted";
}
