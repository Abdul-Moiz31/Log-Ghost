import * as vscode from "vscode";
import type { LogSeverity } from "./types";

export function labelForSev(s: LogSeverity): string {
  switch (s) {
    case "critical":
      return "critical — sensitive data";
    case "debug":
      return "debug — remove before commit";
    case "safe":
      return "safe — looks intentional";
    default:
      return s;
  }
}

/** Gutter / CodeLens (VS Code `$(id)`). */
export function iconForSev(s: LogSeverity): string {
  switch (s) {
    case "critical":
      return "$(error)";
    case "debug":
      return "$(debug-disconnect)";
    case "safe":
      return "$(pass)";
    default:
      return "$(info)";
  }
}

/** Tree row label: plain text (tree labels do not render `$(id)`). */
export function treeGlyphForSev(s: LogSeverity): string {
  switch (s) {
    case "critical":
      return "●";
    case "debug":
      return "◆";
    case "safe":
      return "○";
    default:
      return "·";
  }
}

export function badgeFor(crit: number, mine: number, total: number): string {
  return `$(error)${crit}  $(account)${mine}  $(zap)${total}`;
}

export function diagnosticSeverity(s: LogSeverity): vscode.DiagnosticSeverity {
  if (s === "critical") {
    return vscode.DiagnosticSeverity.Error;
  }
  if (s === "debug") {
    return vscode.DiagnosticSeverity.Warning;
  }
  return vscode.DiagnosticSeverity.Information;
}
