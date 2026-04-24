import * as vscode from "vscode";
import { FoundDebug, analyzeDocument } from "./detector";

export interface CleanFileResult {
  /** Lines removed (1-based) */
  removedLines: number[];
  /** Lines skipped (mixed) */
  skippedMixed: number[];
}

export function cleanDocumentEdits(
  document: vscode.TextDocument,
  config: vscode.WorkspaceConfiguration
): { edit: vscode.WorkspaceEdit; result: CleanFileResult } {
  const found = analyzeDocument(document, config);
  const standalone = found.filter((f) => f.kind === "standalone");
  const mixed = found.filter((f) => f.kind === "mixed");
  const edit = new vscode.WorkspaceEdit();
  const removedLines: number[] = [];
  const sorted = [...standalone].sort((a, b) => b.line - a.line);
  for (const s of sorted) {
    const line = document.lineAt(s.line);
    edit.delete(document.uri, line.rangeIncludingLineBreak);
    removedLines.push(s.line + 1);
  }
  return {
    edit,
    result: {
      removedLines: removedLines.sort((a, b) => a - b),
      skippedMixed: mixed.map((m) => m.line + 1),
    },
  };
}

/**
 * Remove one standalone debug line, or return null if that line is not a safe full-line removal.
 */
export function removeStandaloneLineEdit(
  document: vscode.TextDocument,
  line0: number,
  cfg: vscode.WorkspaceConfiguration
): vscode.WorkspaceEdit | null {
  const found = analyzeDocument(document, cfg);
  const hit = found.find(
    (f) => f.line === line0 && f.kind === "standalone"
  );
  if (!hit) {
    return null;
  }
  return removeLineEdit(document, line0);
}

/** Remove the entire line (UX "remove" for any flagged log line) */
export function removeLineEdit(
  document: vscode.TextDocument,
  line0: number
): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  edit.delete(document.uri, document.lineAt(line0).rangeIncludingLineBreak);
  return edit;
}
