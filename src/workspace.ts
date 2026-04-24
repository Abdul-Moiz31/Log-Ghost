import * as path from "path";
import * as vscode from "vscode";
import {
  blameEntireFile,
  getGitRepoRoot,
  getGitUserEmail,
  isMineEmailBlame,
  resolveUserEmail,
} from "./blame";
import { classifySeverity, scanDocument } from "./scanner";
import type { FoundDebug } from "./detector";
import type { LogEntry, LogSeverity, LogWorkspaceCounts, TreeFilter } from "./types";
export type { TreeFilter } from "./types";
import { loadLogGhostIgnore, shouldIgnoreLine } from "./ignoreFile";

const entryId = (uri: string, line0: number) => `${uri}#L${line0}`;

function makeEntry(
  doc: vscode.TextDocument,
  f: FoundDebug,
  sev: LogSeverity,
  b: { commitHash: string; author: string; email: string; authorTime: number } | null,
  me: string | null
): LogEntry {
  const uri = doc.uri;
  return {
    id: entryId(uri.toString(), f.line),
    filePath: uri.fsPath,
    fileUri: uri.toString(),
    line: f.line,
    lineKind: f.kind,
    matchText: f.matchText,
    matchStart: f.matchStart,
    matchEnd: f.matchEnd,
    severity: sev,
    author: b?.author || "?",
    email: b?.email || "",
    authorTime: b?.authorTime || 0,
    commitHash: b?.commitHash || "",
    isMine: b ? isMineEmailBlame(b.email, me) : false,
    languageId: doc.languageId,
  };
}

export class LogWorkspaceState {
  private byUri = new Map<string, LogEntry[]>();
  private onChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onChange.event;
  public filter: TreeFilter = "all";

  getEntries(): LogEntry[] {
    const o: LogEntry[] = [];
    for (const v of this.byUri.values()) {
      o.push(...v);
    }
    return o;
  }

  getFilteredEntries(): LogEntry[] {
    const all = this.getEntries();
    return all.filter((e) => {
      if (this.filter === "all") {
        return true;
      }
      if (this.filter === "mine") {
        return e.isMine;
      }
      if (this.filter === "teammates") {
        return !e.isMine;
      }
      if (this.filter === "critical") {
        return e.severity === "critical";
      }
      return true;
    });
  }

  byFile(uriStr: string): LogEntry[] {
    return this.byUri.get(uriStr) || [];
  }

  forDocument(doc: vscode.TextDocument): LogEntry[] {
    return this.byFile(doc.uri.toString());
  }

  counts(): LogWorkspaceCounts {
    const all = this.getEntries();
    let critical = 0;
    let mine = 0;
    let tm = 0;
    for (const e of all) {
      if (e.severity === "critical") {
        critical++;
      }
      if (e.isMine) {
        mine++;
      } else {
        tm++;
      }
    }
    return { total: all.length, critical, mine, teammates: tm };
  }

  setFilter(f: TreeFilter) {
    this.filter = f;
    this.onChange.fire();
  }

  private async fileToEntries(
    doc: vscode.TextDocument,
    config: vscode.WorkspaceConfiguration
  ): Promise<LogEntry[] | null> {
    if (doc.uri.scheme !== "file") {
      return null;
    }
    const wf = vscode.workspace.getWorkspaceFolder(doc.uri);
    if (!wf) {
      return null;
    }
    const { rules } = loadLogGhostIgnore(wf);
    const found = scanDocument(doc, config);
    if (found.length === 0) {
      return [];
    }
    const root = await getGitRepoRoot(path.dirname(doc.uri.fsPath));
    const me = root
      ? resolveUserEmail(config, await getGitUserEmail(root))
      : resolveUserEmail(config, null);
    const blameByLine1 = root
      ? await blameEntireFile(root, doc.uri.fsPath, doc.getText(), doc.lineCount)
      : new Map();
    const out: LogEntry[] = [];
    for (const f of found) {
      const lineText = doc.lineAt(f.line).text;
      if (shouldIgnoreLine(f.line, lineText, rules)) {
        continue;
      }
      const sev = classifySeverity(lineText, f, doc.languageId);
      const b = blameByLine1.get(f.line + 1) || null;
      out.push(
        makeEntry(
          doc,
          f,
          sev,
          b
            ? {
                commitHash: b.commitHash,
                author: b.author,
                email: b.email,
                authorTime: b.authorTime,
              }
            : null,
          me
        )
      );
    }
    return out;
  }

  async refreshFile(doc: vscode.TextDocument) {
    const key = doc.uri.toString();
    if (doc.uri.scheme !== "file") {
      this.byUri.delete(key);
      this.onChange.fire();
      return;
    }
    const config = vscode.workspace.getConfiguration();
    const en = await this.fileToEntries(doc, config);
    if (en === null) {
      return;
    }
    this.byUri.set(key, en);
    this.onChange.fire();
  }

  clearUri(uri: vscode.Uri) {
    this.byUri.delete(uri.toString());
    this.onChange.fire();
  }

  /**
   * Full workspace scan: every file with matching ext / language.
   */
  async scanWorkspace(config: vscode.WorkspaceConfiguration) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return;
    }
    this.byUri.clear();
    const exts = new Set<string>();
    const langs = (config.get<string[]>("logGhost.languages") || []).map((s) => s.toLowerCase());
    const extFromLang: [string, string[]][] = [
      ["javascript", [".js", ".cjs", ".mjs"]],
      ["javascriptreact", [".jsx"]],
      ["typescript", [".ts"]],
      ["typescriptreact", [".tsx"]],
      ["python", [".py"]],
      ["go", [".go"]],
      ["php", [".php"]],
    ];
    for (const [lid, e] of extFromLang) {
      if (langs.includes(lid)) {
        for (const x of e) {
          exts.add(x);
        }
      }
    }
    if (exts.size === 0) {
      return;
    }
    const files = await vscode.workspace.findFiles(
      "**/*",
      "{**/node_modules/**,**/.git/**,**/out/**,**/dist/**,**/build/**,**/vendor/**,**/.svn/**,**/bower_components/**}"
    );
    for (const uri of files) {
      const ext = path.extname(uri.fsPath).toLowerCase();
      if (!exts.has(ext) || (ext === ".ts" && uri.fsPath.endsWith(".d.ts"))) {
        continue;
      }
      let doc: vscode.TextDocument;
      try {
        doc = await vscode.workspace.openTextDocument(uri);
      } catch {
        continue;
      }
      if (!langs.includes(doc.languageId.toLowerCase())) {
        continue;
      }
      const en = await this.fileToEntries(doc, config);
      if (en && en.length) {
        this.byUri.set(uri.toString(), en);
      }
    }
    this.onChange.fire();
  }
}
