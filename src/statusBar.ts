import * as vscode from "vscode";
import type { LogWorkspaceCounts } from "./types";

export function createLogGhostStatusBar(): {
  item: vscode.StatusBarItem;
  update: (c: LogWorkspaceCounts) => void;
} {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  item.command = "logGhost.focusView";
  item.tooltip = "Log Ghost — click to open the sidebar";
  const update = (c: LogWorkspaceCounts) => {
    const { total, critical, mine } = c;
    item.text = `Log Ghost: ${total} logs · ${critical} critical · ${mine} are yours`;
    if (critical > 0) {
      item.color = new vscode.ThemeColor("problemsWarningIcon.foreground");
    } else if (total > 0) {
      item.color = new vscode.ThemeColor("testing.iconPassed");
    } else {
      item.color = new vscode.ThemeColor("statusBarItem.secondaryForeground");
    }
  };
  return { item, update };
}
