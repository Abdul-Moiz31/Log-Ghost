import * as path from "path";
import * as vscode from "vscode";
import { initialsFromName, formatTimeAgo } from "./timeAgo";
import type { LogEntry } from "./types";
import { LogWorkspaceState } from "./workspace";
import { labelForSev, treeGlyphForSev, badgeFor } from "./severityV2";

export const TREE_ID = "logGhost.explorer";

export type LgFileNode = {
  kind: "file";
  uri: vscode.Uri;
  label: string;
  crit: number;
  mine: number;
  total: number;
};

export type LgLogNode = {
  kind: "log";
  entry: LogEntry;
};

export class LogGhostTreeProvider
  implements vscode.TreeDataProvider<LgFileNode | LgLogNode>
{
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private state: LogWorkspaceState) {
    this.state.onDidChange(() => {
      this.emitter.fire();
    });
  }

  filterAll = () => this.state.setFilter("all");
  filterMine = () => this.state.setFilter("mine");
  filterTeammates = () => this.state.setFilter("teammates");
  filterCritical = () => this.state.setFilter("critical");

  refresh = () => {
    this.emitter.fire();
  };

  getTreeItem(
    e: LgFileNode | LgLogNode
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    if (e.kind === "file") {
      const ti = new vscode.TreeItem(
        e.label,
        vscode.TreeItemCollapsibleState.Expanded
      );
      ti.description = badgeFor(e.crit, e.mine, e.total);
      ti.contextValue = "logGhostFile";
      ti.id = e.uri.toString();
      ti.iconPath = new vscode.ThemeIcon("file");
      ti.resourceUri = e.uri;
      return ti;
    }
    const en = e.entry;
    const prev = en.matchText.replace(/\s+/g, " ").trim();
    const cut = prev.length > 46 ? prev.slice(0, 44) + "…" : prev;
    const it = new vscode.TreeItem(
      `L${en.line + 1}  ${treeGlyphForSev(en.severity)}  ${cut}`,
      vscode.TreeItemCollapsibleState.None
    );
    it.description = `${initialsFromName(en.author)} ${en.author.split(/\s/)[0] || en.author} · ${formatTimeAgo(en.authorTime)}`;
    it.iconPath = new vscode.ThemeIcon("debug");
    const sevL = labelForSev(en.severity);
    const md = new vscode.MarkdownString();
    md.isTrusted = false;
    md.appendMarkdown(
      `**${sevL}** · \`${en.email || "unknown"}\`\n\nRight-click the line for **Remove** / **Keep**, or use CodeLens.\n\n`
    );
    md.appendCodeblock(en.matchText, "typescript");
    it.tooltip = md;
    it.contextValue = "logGhostLine";
    it.id = en.id;
    it.resourceUri = vscode.Uri.parse(en.fileUri);
    it.command = {
      title: "Reveal",
      command: "logGhost.reveal",
      arguments: [en.fileUri, en.line, en.matchStart, en.matchEnd],
    };
    return it;
  }

  getChildren(
    e?: LgFileNode | LgLogNode
  ): (LgFileNode | LgLogNode)[] {
    if (!e) {
      return this.buildFiles();
    }
    if (e.kind === "file") {
      return this.state
        .getFilteredEntries()
        .filter((l) => l.fileUri === e.uri.toString())
        .map((entry) => ({ kind: "log" as const, entry }));
    }
    return [];
  }

  private buildFiles(): LgFileNode[] {
    const m = new Map<string, { uri: vscode.Uri; crit: number; mine: number; log: LogEntry[] }>();
    for (const e of this.state.getFilteredEntries()) {
      const u = e.fileUri;
      let x = m.get(u);
      if (!x) {
        x = {
          uri: vscode.Uri.parse(u),
          crit: 0,
          mine: 0,
          log: [],
        };
        m.set(u, x);
      }
      x.log.push(e);
      if (e.severity === "critical") {
        x.crit++;
      }
      if (e.isMine) {
        x.mine++;
      }
    }
    return [...m.entries()]
      .map(([k, v]) => ({
        kind: "file" as const,
        uri: v.uri,
        label: path.basename(v.log[0]!.filePath),
        crit: v.crit,
        mine: v.mine,
        total: v.log.length,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }
}
