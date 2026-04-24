import * as vscode from "vscode";
import { iconForSev, labelForSev } from "./severityV2";
import { initialsFromName, formatTimeAgo } from "./timeAgo";
import type { LogEntry } from "./types";

/**
 * [severity] [AB Name · time] · remove · keep · ignore always
 */
export function buildCodeLenses(
  document: vscode.TextDocument,
  entries: LogEntry[]
): vscode.CodeLens[] {
  const out: vscode.CodeLens[] = [];
  for (const e of entries) {
    if (e.fileUri !== document.uri.toString()) {
      continue;
    }
    const R0 = new vscode.Range(e.line, 0, e.line, 0);
    const R = new vscode.Range(
      e.line,
      e.matchStart,
      e.line,
      Math.max(e.matchStart, e.matchEnd)
    );
    const sevL = labelForSev(e.severity);
    const ab = initialsFromName(e.author);
    const t = e.authorTime ? formatTimeAgo(e.authorTime) : "—";
    const who = `${ab} ${e.author.split(/\s/)[0] || e.author} · ${t}`;
    const long = `${iconForSev(e.severity)} ${sevL}  [${who}]  ·  remove  ·  keep  ·  ignore always`;
    out.push(
      new vscode.CodeLens(R0, {
        title: long,
        tooltip: "Log Ghost — first row is informational; use the actions on the right.",
        command: "logGhost.severityNop",
      })
    );
    out.push(
      new vscode.CodeLens(R, {
        title: "remove",
        command: "logGhost.removeEnriched",
        arguments: [e.fileUri, e.line],
      })
    );
    out.push(
      new vscode.CodeLens(R, {
        title: "keep",
        command: "logGhost.keepSession",
        arguments: [e.fileUri, e.line],
      })
    );
    out.push(
      new vscode.CodeLens(R, {
        title: "ignore always",
        command: "logGhost.ignoreToFile",
        arguments: [e.fileUri, e.line],
      })
    );
  }
  return out;
}

export function registerCodeLens(
  context: vscode.ExtensionContext,
  getEntries: (d: vscode.TextDocument) => LogEntry[] | undefined,
  languageFilter: (id: string) => boolean,
  onChange: vscode.Event<void>
) {
  const p = vscode.languages.registerCodeLensProvider(
    [{ scheme: "file" }, { scheme: "untitled" }],
    {
      onDidChangeCodeLenses: onChange,
      provideCodeLenses(doc) {
        if (!languageFilter(doc.languageId)) {
          return [];
        }
        if (!vscode.workspace.getConfiguration("logGhost").get<boolean>("showCodeLens", true)) {
          return [];
        }
        const ent = getEntries(doc);
        if (!ent) {
          return [];
        }
        return buildCodeLenses(doc, ent);
      },
    }
  );
  const actions = vscode.languages.registerCodeActionsProvider(
    [{ scheme: "file" }, { scheme: "untitled" }],
    {
      provideCodeActions(document, _r, context) {
        if (!languageFilter(document.languageId)) {
          return [];
        }
        const out: vscode.CodeAction[] = [];
        for (const d of context.diagnostics) {
          if (d.source !== "Log Ghost") {
            continue;
          }
          const fix = new vscode.CodeAction(
            "Remove this debug line",
            vscode.CodeActionKind.QuickFix
          );
          fix.diagnostics = [d];
          fix.isPreferred = true;
          fix.command = {
            title: "Remove",
            command: "logGhost.removeEnriched",
            arguments: [document.uri.toString(), d.range.start.line],
          };
          out.push(fix);
        }
        return out;
      },
    },
    { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
  );
  context.subscriptions.push(p, actions);
}
