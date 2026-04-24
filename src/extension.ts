import * as vscode from "vscode";
import { GHOST_TOOLTIP } from "./detector";
import { createDecorationSet } from "./decorations";
import { registerCodeLens } from "./codeLens";
import { cleanDocumentEdits } from "./cleaner";
import { labelForSev, diagnosticSeverity } from "./severityV2";
import { LogWorkspaceState } from "./workspace";
import { LogGhostTreeProvider, TREE_ID, type LgFileNode, type LgLogNode } from "./treeProvider";
import { createLogGhostStatusBar } from "./statusBar";
import { appendLogGhostIgnore, invalidateIgnoreCache, loadLogGhostIgnore } from "./ignoreFile";
import { showPreCommitWarningIfStaged, writePreCommitHookIfEnabled } from "./commitHook";
import { getPrimaryWorkspace, type LogEntry } from "./types";

/** Full workspace config — `detector` expects `logGhost.*` keys. */
function fullConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration();
}

function logCfg(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("logGhost");
}

function languageSupported(
  id: string,
  cfg: vscode.WorkspaceConfiguration = fullConfig()
): boolean {
  const list = (cfg.get<string[]>("logGhost.languages") || []).map((s) =>
    s.toLowerCase()
  );
  return list.includes(id.toLowerCase());
}

function sk(doc: vscode.TextDocument, line0: number): string {
  return `${doc.uri.toString()}#L${line0}`;
}

const sessionDismissed = new Set<string>();
let state: LogWorkspaceState;
let diagnostics: vscode.DiagnosticCollection;
const ui = new vscode.EventEmitter<void>();
let treeProvider: LogGhostTreeProvider;
let treeViewRef: vscode.TreeView<LgFileNode | LgLogNode> | null = null;
let statusBar: { item: vscode.StatusBarItem; update: (c: import("./types").LogWorkspaceCounts) => void };
let decor: ReturnType<typeof createDecorationSet> | null = null;
let liveTimer: ReturnType<typeof setTimeout> | undefined;

function visibleEntries(doc: vscode.TextDocument): LogEntry[] {
  return state
    .forDocument(doc)
    .filter((e) => !sessionDismissed.has(sk(doc, e.line)));
}

function toDiagnostics(document: vscode.TextDocument, list: LogEntry[]): vscode.Diagnostic[] {
  return list.map((f) => {
    const r = new vscode.Range(
      f.line,
      f.matchStart,
      f.line,
      Math.max(f.matchStart, f.matchEnd)
    );
    const sevL = labelForSev(f.severity);
    const base =
      f.lineKind === "mixed"
        ? `[${sevL}] Mixed line — not auto-removed.`
        : `[${sevL}] ${GHOST_TOOLTIP}`;
    const d = new vscode.Diagnostic(r, base, diagnosticSeverity(f.severity));
    d.source = "Log Ghost";
    d.code = f.lineKind;
    d.tags = f.lineKind === "standalone" ? [vscode.DiagnosticTag.Unnecessary] : [];
    return d;
  });
}

async function refreshFile(doc: vscode.TextDocument) {
  await state.refreshFile(doc);
  doUi(doc);
}

function doUi(doc: vscode.TextDocument) {
  updateChrome(doc);
  ui.fire();
}

function updateChrome(focused?: vscode.TextDocument) {
  statusBar.update(state.counts());
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId && languageSupported(doc.languageId)) {
      if (doc.uri.scheme !== "file" && doc.uri.scheme !== "untitled") {
        continue;
      }
      const list = visibleEntries(doc);
      diagnostics.set(doc.uri, toDiagnostics(doc, list));
    }
  }
  if (focused) {
    const e = vscode.window.activeTextEditor;
    if (e && e.document === focused) {
      decor?.applyToEditor(e, visibleEntries(focused));
    }
  }
  const cur = state.getEntries();
  void vscode.commands.executeCommand("setContext", "logGhost:hasFindings", cur.length > 0);
  const solo = cur.filter(
    (x) => x.lineKind === "standalone" && x.severity !== "critical"
  );
  void vscode.commands.executeCommand(
    "setContext",
    "logGhost:hasRemovableStandalone",
    solo.length > 0
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

export async function activate(ctx: vscode.ExtensionContext) {
  const wf0 = getPrimaryWorkspace();
  if (wf0) {
    loadLogGhostIgnore(wf0);
    writePreCommitHookIfEnabled(ctx, wf0);
  }
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders((ev) => {
      for (const f of ev.added) {
        loadLogGhostIgnore(f);
        writePreCommitHookIfEnabled(ctx, f);
      }
    })
  );

  state = new LogWorkspaceState();
  diagnostics = vscode.languages.createDiagnosticCollection("log-ghost");
  ctx.subscriptions.push(diagnostics, ui);
  statusBar = createLogGhostStatusBar();
  ctx.subscriptions.push(statusBar.item);
  statusBar.update({ total: 0, critical: 0, mine: 0, teammates: 0 });

  decor = createDecorationSet(ctx);
  treeProvider = new LogGhostTreeProvider(state);
  treeViewRef = vscode.window.createTreeView(TREE_ID, {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  ctx.subscriptions.push(treeViewRef);
  ctx.subscriptions.push(
    state.onDidChange(() => {
      const ed = vscode.window.activeTextEditor;
      if (ed) {
        doUi(ed.document);
      } else {
        updateChrome();
        ui.fire();
      }
    })
  );

  void vscode.commands.executeCommand("setContext", "logGhost:supported", false);

  registerCodeLens(
    ctx,
    (d) => visibleEntries(d),
    (id) => languageSupported(id),
    ui.event
  );

  const deb = () => Math.max(0, logCfg().get<number>("liveDebounceMs", 150) ?? 150);

  const onDoc = async (doc: vscode.TextDocument) => {
    if (doc.uri.scheme !== "file" && doc.uri.scheme !== "untitled") {
      return;
    }
    if (!languageSupported(doc.languageId)) {
      return;
    }
    await refreshFile(doc);
  };

  const initial = async () => {
    const w = getPrimaryWorkspace();
    if (w) {
      await state.scanWorkspace(fullConfig());
    }
    const ed = vscode.window.activeTextEditor;
    if (ed) {
      if (languageSupported(ed.document.languageId)) {
        await onDoc(ed.document);
        void vscode.commands.executeCommand("setContext", "logGhost:supported", true);
      }
    }
    statusBar.update(state.counts());
  };
  void initial();

  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((e) => {
      if (e && languageSupported(e.document.languageId)) {
        void refreshFile(e.document);
        void vscode.commands.executeCommand("setContext", "logGhost:supported", true);
      } else {
        void vscode.commands.executeCommand("setContext", "logGhost:supported", false);
      }
    })
  );

  ctx.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((ev) => {
      const ed = vscode.window.activeTextEditor;
      if (!ed || ed.document !== ev.document) {
        return;
      }
      if (!languageSupported(ed.document.languageId)) {
        return;
      }
      const d = deb();
      if (liveTimer) {
        clearTimeout(liveTimer);
        liveTimer = undefined;
      }
      if (d === 0) {
        void onDoc(ed.document);
        return;
      }
      liveTimer = setTimeout(() => {
        liveTimer = undefined;
        void onDoc(ed.document);
      }, d);
    })
  );

  ctx.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (doc.uri.path.endsWith("logGhost.ignore") || doc.uri.path.endsWith(".vscode/logGhost.ignore")) {
        invalidateIgnoreCache();
      }
      if (doc.uri.scheme === "file" && languageSupported(doc.languageId)) {
        const w = getPrimaryWorkspace();
        if (w) {
          loadLogGhostIgnore(w);
        }
        await onDoc(doc);
        void state.scanWorkspace(fullConfig());
        statusBar.update(state.counts());
        treeProvider.refresh();
      }
    })
  );

  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((ev) => {
      if (ev.affectsConfiguration("logGhost")) {
        const ed = vscode.window.activeTextEditor;
        if (ed) {
          void onDoc(ed.document);
        }
        const w = getPrimaryWorkspace();
        if (w) {
          writePreCommitHookIfEnabled(ctx, w);
        }
      }
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("logGhost.focusView", () => {
      void vscode.commands.executeCommand("workbench.view.extension.logGhost");
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("logGhost.filter.all", () => {
      treeProvider.filterAll();
    })
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand("logGhost.filter.mine", () => {
      treeProvider.filterMine();
    })
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand("logGhost.filter.teammates", () => {
      treeProvider.filterTeammates();
    })
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand("logGhost.filter.critical", () => {
      treeProvider.filterCritical();
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("logGhost.removeEnriched", async (uriStr: string, line0: number) => {
      if (typeof uriStr !== "string" || typeof line0 !== "number") {
        return;
      }
      const uri = vscode.Uri.parse(uriStr);
      const doc = await vscode.workspace.openTextDocument(uri);
      const ed = new vscode.WorkspaceEdit();
      ed.delete(doc.uri, doc.lineAt(line0).rangeIncludingLineBreak);
      if (await vscode.workspace.applyEdit(ed)) {
        await refreshFile(doc);
      }
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("logGhost.keepSession", async (uriStr: string, line0: number) => {
      if (typeof uriStr !== "string" || typeof line0 !== "number") {
        return;
      }
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uriStr));
      sessionDismissed.add(sk(doc, line0));
      doUi(doc);
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("logGhost.ignoreToFile", async (uriStr: string, line0: number) => {
      const wf = getPrimaryWorkspace();
      if (!wf) {
        return;
      }
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uriStr));
      const line = doc.lineAt(line0).text;
      const sub = line.trim();
      await appendLogGhostIgnore(
        wf,
        line0,
        escapeRegex(sub.length > 200 ? sub.slice(0, 200) : sub)
      );
      invalidateIgnoreCache();
      loadLogGhostIgnore(wf);
      await refreshFile(doc);
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("logGhost.reveal", (uriStr: string, line0: number, c0: number, c1: number) => {
      void vscode.workspace.openTextDocument(vscode.Uri.parse(uriStr)).then((doc) => {
        return vscode.window.showTextDocument(doc).then((ed) => {
          ed.selection = new vscode.Selection(line0, c0, line0, c1);
          ed.revealRange(ed.selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        });
      });
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("logGhost.tree.removeLine", () => {
      const t = treeViewRef?.selection?.[0];
      if (t && "kind" in t && t.kind === "log") {
        void vscode.commands.executeCommand("logGhost.removeEnriched", t.entry.fileUri, t.entry.line);
      }
    })
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand("logGhost.tree.keepLine", () => {
      const t = treeViewRef?.selection?.[0];
      if (t && "kind" in t && t.kind === "log") {
        void vscode.commands.executeCommand("logGhost.keepSession", t.entry.fileUri, t.entry.line);
      }
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("logGhost.removeMineInWorkspace", async () => {
      const w = getPrimaryWorkspace();
      if (!w) {
        return;
      }
      const mine = state
        .getEntries()
        .filter((e) => e.isMine && e.lineKind === "standalone");
      if (mine.length === 0) {
        void vscode.window.showInformationMessage("Log Ghost: no removable “mine” standalone lines.");
        return;
      }
      // Modal dialogs already include a system dismiss/cancel; do not add "Cancel" or it duplicates.
      const choice = await vscode.window.showWarningMessage(
        `Remove ${mine.length} of your standalone log line(s) across the workspace?`,
        { modal: true },
        "Remove mine"
      );
      if (choice !== "Remove mine") {
        return;
      }
      const we = new vscode.WorkspaceEdit();
      for (const e of mine.sort((a, b) => b.line - a.line)) {
        const d = await vscode.workspace.openTextDocument(vscode.Uri.parse(e.fileUri));
        we.delete(d.uri, d.lineAt(e.line).rangeIncludingLineBreak);
      }
      await vscode.workspace.applyEdit(we);
      void state.scanWorkspace(fullConfig());
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("logGhost.removeAllInWorkspace", async () => {
      const all = state
        .getEntries()
        .filter((e) => e.lineKind === "standalone");
      if (all.length === 0) {
        void vscode.window.showInformationMessage("Log Ghost: no removable standalone lines.");
        return;
      }
      const choice = await vscode.window.showWarningMessage(
        `Remove all ${all.length} standalone log line(s) across the workspace? Mixed lines are skipped.`,
        { modal: true },
        "Remove all"
      );
      if (choice !== "Remove all") {
        return;
      }
      const we = new vscode.WorkspaceEdit();
      for (const e of all.sort((a, b) => b.line - a.line)) {
        const d = await vscode.workspace.openTextDocument(vscode.Uri.parse(e.fileUri));
        we.delete(d.uri, d.lineAt(e.line).rangeIncludingLineBreak);
      }
      await vscode.workspace.applyEdit(we);
      void state.scanWorkspace(fullConfig());
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("logGhost.cleanCurrentFile", () => {
      const e = vscode.window.activeTextEditor;
      if (!e) {
        return;
      }
      const { edit } = cleanDocumentEdits(e.document, fullConfig());
      void vscode.workspace.applyEdit(edit).then(() => refreshFile(e.document));
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("logGhost.severityNop", () => {
      // code lens first row
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("logGhost.precommitCheck", async () => {
      const w = getPrimaryWorkspace();
      if (!w) {
        return;
      }
      await showPreCommitWarningIfStaged(w);
    })
  );
}

export function deactivate() {
  if (liveTimer) {
    clearTimeout(liveTimer);
  }
}