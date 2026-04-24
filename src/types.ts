import * as vscode from "vscode";
import type { LineKind } from "./detector";

export function getPrimaryWorkspace():
  | vscode.WorkspaceFolder
  | undefined {
  return vscode.workspace.workspaceFolders?.[0];
}

/** User-facing severity: critical = secrets, debug = typical debugging, safe = string-only. */
export type LogSeverity = "critical" | "debug" | "safe";

export type LogEntry = {
  id: string;
  /** Workspace-relative or fs path */
  filePath: string;
  fileUri: string;
  line: number;
  lineKind: LineKind;
  matchText: string;
  matchStart: number;
  matchEnd: number;
  severity: LogSeverity;
  author: string;
  email: string;
  authorTime: number;
  commitHash: string;
  isMine: boolean;
  languageId: string;
};

export type LogWorkspaceCounts = {
  total: number;
  critical: number;
  mine: number;
  teammates: number;
};

export type TreeFilter = "all" | "mine" | "teammates" | "critical";
