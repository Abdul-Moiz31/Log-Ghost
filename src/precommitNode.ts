import { execFileSync } from "child_process";
import * as path from "path";
import { parseSingleBlameHunk, type BlameInfo } from "./blameParse";
import { scanStagedTextForDebugLines } from "./stagedScan";

export type StagedMineHit = { file: string; line0: number; email: string };

function getStagedFileContent(root: string, rel: string): string {
  const s = rel.split(path.sep).join("/");
  return execFileSync("git", ["-C", root, "show", `:${s}`], {
    encoding: "utf8",
    maxBuffer: 1 << 22,
  });
}

function getUserEmailRoot(root: string): string {
  try {
    return String(
      execFileSync("git", ["-C", root, "config", "user.email"], { encoding: "utf8" })
    )
      .trim()
      .toLowerCase();
  } catch {
    return "";
  }
}

function blameLine(root: string, rel: string, line0: number): BlameInfo | null {
  const line1 = line0 + 1;
  try {
    const out = String(
      execFileSync(
        "git",
        [
          "-C",
          root,
          "blame",
          "-L",
          `${line1},${line1}`,
          "--porcelain",
          "--",
          rel,
        ],
        { encoding: "utf8", maxBuffer: 64 * 1024 }
      )
    );
    return parseSingleBlameHunk(out.split(/\r\n|\n/));
  } catch {
    return null;
  }
}

function isMine(email: string, user: string): boolean {
  if (!user) {
    return false;
  }
  if (!email.includes("@")) {
    return true;
  }
  return email.trim().toLowerCase() === user;
}

/**
 * @returns 0 = ok, 1 = found mine in staged, 2 = not a repo / error
 */
export function runPrecommitScan(
  root: string,
  overrideUserEmail?: string
): { code: number; mine: StagedMineHit[] } {
  const abs = path.resolve(root);
  let inGit = true;
  try {
    execFileSync("git", ["-C", abs, "rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8",
    });
  } catch {
    inGit = false;
  }
  if (!inGit) {
    return { code: 0, mine: [] };
  }
  const me = (
    overrideUserEmail ||
    process.env["LOGGHOST_USER_EMAIL"] ||
    getUserEmailRoot(abs) ||
    ""
  ).toLowerCase();
  let list = "";
  try {
    list = String(
      execFileSync("git", ["-C", abs, "diff", "--cached", "--name-only", "-z"], {
        encoding: "utf8",
        maxBuffer: 1 << 20,
      })
    );
  } catch {
    return { code: 0, mine: [] };
  }
  const files = list.split("\0").filter(Boolean);
  const mine: StagedMineHit[] = [];
  for (const rel of files) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|py)$/i.test(rel)) {
      continue;
    }
    let text: string;
    try {
      text = getStagedFileContent(abs, rel);
    } catch {
      continue;
    }
    const lines = scanStagedTextForDebugLines(rel, text);
    for (const { line0 } of lines) {
      const b = blameLine(abs, rel, line0);
      const em = b?.email || "";
      if (b && isMine(em, me)) {
        mine.push({ file: rel, line0, email: em });
      }
    }
  }
  return { code: mine.length > 0 ? 1 : 0, mine };
}

