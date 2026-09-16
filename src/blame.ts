import { execFile } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";
import { tmpdir } from "os";
import * as vscode from "vscode";
import { type BlameInfo } from "./blameParse";
const execFileAsync = promisify(execFile);

export type { BlameInfo };

/** Full-file blame: one git call, map 1-based line -> BlameInfo */
export async function blameEntireFile(
  repoRoot: string,
  absFile: string,
  currentText: string,
  lineCount: number
): Promise<Map<number, BlameInfo>> {
  const out = new Map<number, BlameInfo>();
  const rel = path.relative(repoRoot, path.resolve(absFile)).split(path.sep).join("/");
  if (rel.startsWith("..") || lineCount === 0) {
    return out;
  }
  const tmp = path.join(
    tmpdir(),
    `lg-blame-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`
  );
  try {
    fs.writeFileSync(tmp, currentText, { encoding: "utf8" });
    const { stdout } = await execFileAsync(
      "git",
      [
        "-C",
        repoRoot,
        "blame",
        "-e",
        "-p",
        "-w",
        `--contents=${tmp}`,
        "--",
        rel,
      ],
      { encoding: "utf8", maxBuffer: 4 << 20 }
    );
    const lines = String(stdout).split(/\r\n|\n/);
    let curMail = "";
    let curAuth = "";
    let curTime = 0;
    let curHash = "";
    let curFinal = 0;
    const reHead = /^([0-9a-f]{40})\s+\d+\s+(\d+)\s+\d+/;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const h = reHead.exec(line);
      if (h) {
        curHash = h[1];
        curFinal = parseInt(h[2], 10);
      }
      const mm = /^author-mail (.*)$/.exec(line);
      if (mm) {
        const raw = mm[1].trim();
        const inner = raw.match(/^<([^>]+)>/);
        curMail = inner ? inner[1] : raw.replace(/[<>]/g, "");
      }
      const ma = /^author (.*)$/.exec(line);
      if (ma) {
        curAuth = ma[1].trim();
      }
      const mt = /^author-time (\d+)/.exec(line);
      if (mt) {
        curTime = parseInt(mt[1], 10);
      }
      if (line.length > 0 && line[0] === "\t") {
        if (curFinal > 0) {
          out.set(curFinal, {
            commitHash: curHash,
            author: curAuth,
            email: curMail,
            authorTime: curTime,
          });
        }
      }
    }
  } catch {
    return out;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // ignore
    }
  }
  return out;
}

export async function getGitRepoRoot(startPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", startPath, "rev-parse", "--show-toplevel"],
      { encoding: "utf8" }
    );
    const t = String(stdout).trim();
    return t || null;
  } catch {
    return null;
  }
}

export async function getGitUserEmail(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", repoRoot, "config", "user.email"],
      { encoding: "utf8" }
    );
    const e = String(stdout).trim();
    return e || null;
  } catch {
    return null;
  }
}

export function resolveUserEmail(
  cfg: vscode.WorkspaceConfiguration,
  repoEmail: string | null
): string | null {
  const override = cfg.get<string>("logGhost.currentUserEmail", "");
  if (override && override.trim()) {
    return override.trim().toLowerCase();
  }
  return repoEmail ? repoEmail.toLowerCase() : null;
}

export function isMineEmailBlame(
  blameEmail: string,
  userEmail: string | null
): boolean {
  if (!userEmail || !blameEmail) {
    return false;
  }
  if (!blameEmail.includes("@")) {
    return true;
  }
  return blameEmail.trim().toLowerCase() === userEmail;
}
