import * as vscode from "vscode";
import { GHOST_TOOLTIP } from "./detector";
import type { LogEntry, LogSeverity } from "./types";

const md = () => {
  const m = new vscode.MarkdownString(GHOST_TOOLTIP);
  m.isTrusted = false;
  return m;
};

function media(ctx: vscode.ExtensionContext, name: string): vscode.Uri {
  return vscode.Uri.joinPath(ctx.extensionUri, "media", name);
}

/**
 * Gutter: critical / debug (warn svg) / safe (info svg)
 */
function gutterDecoration(
  context: vscode.ExtensionContext,
  file: string,
  lineTint?: string
): vscode.TextEditorDecorationType {
  return vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: lineTint,
    gutterIconPath: media(context, file),
    gutterIconSize: "contain",
  });
}

export function createDecorationSet(context: vscode.ExtensionContext): {
  applyToEditor: (editor: vscode.TextEditor, rows: LogEntry[]) => void;
} {
  const gutterBySev: Record<LogSeverity, vscode.TextEditorDecorationType> = {
    critical: gutterDecoration(
      context,
      "gutter-critical.svg",
      "rgba(254, 202, 202, 0.12)"
    ),
    debug: gutterDecoration(
      context,
      "gutter-warn.svg",
      "rgba(254, 243, 199, 0.14)"
    ),
    safe: gutterDecoration(
      context,
      "gutter-info.svg",
      "rgba(220, 252, 231, 0.12)"
    ),
  };

  const mixedGutter = gutterDecoration(
    context,
    "gutter-mixed.svg",
    "rgba(237, 233, 254, 0.18)"
  );

  const sev: Record<LogSeverity, vscode.TextEditorDecorationType> = {
    critical: vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(252, 165, 165, 0.22)",
      border: "1px solid rgba(220, 38, 38, 0.45)",
      borderRadius: "4px",
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      overviewRulerColor: new vscode.ThemeColor("editorError.foreground"),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    }),
    debug: vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(253, 230, 138, 0.2)",
      border: "1px solid rgba(217, 119, 6, 0.5)",
      borderRadius: "4px",
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      overviewRulerColor: new vscode.ThemeColor("editorWarning.foreground"),
      overviewRulerLane: vscode.OverviewRulerLane.Center,
    }),
    safe: vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(187, 247, 208, 0.2)",
      border: "1px solid rgba(22, 163, 74, 0.45)",
      borderRadius: "4px",
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      overviewRulerColor: new vscode.ThemeColor("editorInfo.foreground"),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    }),
  };

  const inlineMixed = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(196, 181, 253, 0.22)",
    border: "1px solid rgba(109, 40, 217, 0.45)",
    borderRadius: "4px",
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    overviewRulerColor: "rgba(124, 58, 237, 0.75)",
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });

  context.subscriptions.push(
    mixedGutter,
    inlineMixed,
    gutterBySev.critical,
    gutterBySev.debug,
    gutterBySev.safe,
    sev.critical,
    sev.debug,
    sev.safe
  );

  const applyToEditor = (editor: vscode.TextEditor, rows: LogEntry[]) => {
    const showInline = vscode.workspace
      .getConfiguration("logGhost")
      .get<boolean>("inlineHighlight", true);

    const gSev: Record<LogSeverity, vscode.DecorationOptions[]> = {
      critical: [],
      debug: [],
      safe: [],
    };
    const mGutter: vscode.DecorationOptions[] = [];
    const bySev: Record<LogSeverity, vscode.DecorationOptions[]> = {
      critical: [],
      debug: [],
      safe: [],
    };
    const mix: vscode.DecorationOptions[] = [];

    for (const r of rows) {
      const line = editor.document.lineAt(r.line);
      const h = md();
      const lineOpt: vscode.DecorationOptions = {
        range: line.range,
        hoverMessage: h,
      };
      if (r.lineKind === "mixed") {
        mGutter.push(lineOpt);
      } else {
        gSev[r.severity].push(lineOpt);
      }
      if (showInline) {
        const r0 = Math.min(r.matchStart, line.text.length);
        const r1 = Math.min(Math.max(r.matchEnd, r0), line.text.length);
        const ir = new vscode.Range(r.line, r0, r.line, r1);
        const io: vscode.DecorationOptions = { range: ir, hoverMessage: h };
        if (r.lineKind === "mixed") {
          mix.push(io);
        } else {
          bySev[r.severity].push(io);
        }
      }
    }
    editor.setDecorations(gutterBySev.critical, gSev.critical);
    editor.setDecorations(gutterBySev.debug, gSev.debug);
    editor.setDecorations(gutterBySev.safe, gSev.safe);
    editor.setDecorations(mixedGutter, mGutter);
    if (showInline) {
      editor.setDecorations(sev.critical, bySev.critical);
      editor.setDecorations(sev.debug, bySev.debug);
      editor.setDecorations(sev.safe, bySev.safe);
      editor.setDecorations(inlineMixed, mix);
    } else {
      editor.setDecorations(sev.critical, []);
      editor.setDecorations(sev.debug, []);
      editor.setDecorations(sev.safe, []);
      editor.setDecorations(inlineMixed, []);
    }
  };

  return { applyToEditor };
}
