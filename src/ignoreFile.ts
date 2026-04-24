import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

const FILE = "logGhost.ignore";

/**
 * Each line: `line:pattern` (0-based or 1-based line with pattern regex source)
 * Or `global:pattern` to ignore any line matching pattern anywhere.
 */
export type IgnoreRule = { type: "line"; line: number; pattern: RegExp } | { type: "global"; pattern: RegExp };

let cached: { path: string; mtime: number; rules: IgnoreRule[] } | null = null;

function parseFile(content: string, logBad: (s: string) => void): IgnoreRule[] {
  const out: IgnoreRule[] = [];
  for (const raw of content.split(/\r\n|\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const idx = line.indexOf(":");
    if (idx < 0) {
      logBad(`Log Ghost: ignore line has no ':': ${line}`);
      continue;
    }
    const key = line.slice(0, idx).trim();
    const patSrc = line.slice(idx + 1).trim();
    if (!patSrc) {
      continue;
    }
    try {
      if (key.toLowerCase() === "global" || key === "*") {
        out.push({ type: "global", pattern: new RegExp(patSrc, "i") });
        continue;
      }
      const lineNum = parseInt(key, 10);
      if (Number.isNaN(lineNum)) {
        logBad(`Log Ghost: bad line number in logGhost.ignore: ${key}`);
        continue;
      }
      const line0 = lineNum > 0 ? lineNum - 1 : lineNum;
      out.push({ type: "line", line: line0, pattern: new RegExp(patSrc, "i") });
    } catch {
      logBad(`Log Ghost: invalid RegExp in logGhost.ignore: ${patSrc}`);
    }
  }
  return out;
}

function ignorePathForWorkspace(wf: vscode.WorkspaceFolder): string {
  return path.join(wf.uri.fsPath, ".vscode", FILE);
}

export function loadLogGhostIgnore(
  wf: vscode.WorkspaceFolder
): { rules: IgnoreRule[]; filePath: string } {
  const p = ignorePathForWorkspace(wf);
  try {
    const st = fs.statSync(p);
    if (cached && cached.path === p && cached.mtime === st.mtimeMs) {
      return { rules: cached.rules, filePath: p };
    }
    const content = fs.readFileSync(p, "utf8");
    const rules = parseFile(content, (m) => {
      void vscode.window.showWarningMessage(m);
    });
    cached = { path: p, mtime: st.mtimeMs, rules };
    return { rules, filePath: p };
  } catch {
    if (cached?.path === p) {
      cached = { path: p, mtime: 0, rules: [] };
    }
    return { rules: [], filePath: p };
  }
}

export function shouldIgnoreLine(
  line0: number,
  lineText: string,
  rules: IgnoreRule[]
): boolean {
  for (const r of rules) {
    if (r.type === "global") {
      r.pattern.lastIndex = 0;
      if (r.pattern.test(lineText)) {
        return true;
      }
    } else if (r.type === "line" && r.line === line0) {
      r.pattern.lastIndex = 0;
      if (r.pattern.test(lineText)) {
        return true;
      }
    }
  }
  return false;
}

export function invalidateIgnoreCache() {
  cached = null;
}

export async function appendLogGhostIgnore(
  wf: vscode.WorkspaceFolder,
  line0: number,
  pattern: string
): Promise<void> {
  const p = ignorePathForWorkspace(wf);
  const dir = path.dirname(p);
  await fs.promises.mkdir(dir, { recursive: true });
  const line = `${line0 + 1}:${pattern}\n`;
  try {
    await fs.promises.appendFile(p, line, { encoding: "utf8" });
  } catch (e) {
    throw e;
  }
  invalidateIgnoreCache();
}
