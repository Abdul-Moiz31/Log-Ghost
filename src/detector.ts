import * as vscode from "vscode";

export type LineKind = "standalone" | "mixed";

export interface FoundDebug {
  line: number;
  kind: LineKind;
  /**
   * Matched text span for this finding (entire call / statement to highlight).
   */
  matchText: string;
  matchStart: number;
  matchEnd: number;
}

const TOOLTIP = "Debug statement — Log Ghost can remove this";
export const GHOST_TOOLTIP = TOOLTIP;

/** JS/TS: console.* and debugger */
function findJsTs(text: string): { start: number; end: number; raw: string } | null {
  const d = text.match(/\bdebugger\s*;?/);
  if (d && d.index !== undefined) {
    return { start: d.index, end: d.index + d[0].length, raw: d[0] };
  }
  const m = text.match(/\bconsole\.(log|warn|error|debug|info)\s*\(/);
  if (m && m.index !== undefined) {
    const open = text.indexOf("(", m.index);
    if (open < 0) {
      return { start: m.index, end: m.index + m[0].length, raw: m[0] };
    }
    const close = findMatchingParen(text, open);
    if (close < 0) {
      return { start: m.index, end: text.length, raw: text.slice(m.index) };
    }
    return { start: m.index, end: close + 1, raw: text.slice(m.index, close + 1) };
  }
  return null;
}

function findMatchingParen(s: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (c === "(") {
      depth++;
    } else if (c === ")") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function stripTrailingLineComment(s: string): string {
  const idx = s.indexOf("//");
  if (idx < 0) {
    return s;
  }
  // naive: not inside string — good enough for gutter detection
  const before = s.slice(0, idx);
  const quotes = (before.match(/['"`]/g) || []).length;
  if (quotes % 2 === 0) {
    return s.slice(0, idx).trimEnd();
  }
  return s;
}

export function isStandaloneJsTs(lineText: string, span: { start: number; end: number }): boolean {
  const core = lineText.trimEnd();
  const noTrail = stripTrailingLineComment(core);
  const t = noTrail.trim();
  if (!t) {
    return false;
  }
  // span covers full meaningful content (allow leading indent)
  const before = lineText.slice(0, span.start).trim();
  const after = lineText.slice(span.end).trim();
  // remove trailing ; after span for console
  const a = after.replace(/^;\s*/, "").replace(/\/\/.*$/, "").trim();
  return before === "" && a === "";
}

/** Go: fmt.Print, Printf, Println; log.Printf, Println */
function findGo(text: string): { start: number; end: number; raw: string } | null {
  const a = text.match(/\bfmt\.(Print|Printf|Println)\s*\(/);
  const b = text.match(/\blog\.(Printf|Println)\s*\(/);
  const candidates: RegExpMatchArray[] = [];
  if (a && a.index !== undefined) {
    candidates.push(a);
  }
  if (b && b.index !== undefined) {
    candidates.push(b);
  }
  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((x, y) => x.index! - y.index!);
  const m = candidates[0];
  const start = m.index!;
  const open = text.indexOf("(", start);
  if (open < 0) {
    return { start, end: start + m[0].length, raw: m[0] };
  }
  const close = findMatchingParen(text, open);
  if (close < 0) {
    return { start, end: text.length, raw: text.slice(start) };
  }
  return { start, end: close + 1, raw: text.slice(start, close + 1) };
}

/** PHP */
function findPhp(text: string): { start: number; end: number; raw: string } | null {
  const re = /\b(var_dump|print_r|dd)\s*\(/g;
  let m: RegExpExecArray | null;
  let best: { start: number; end: number; raw: string } | null = null;
  let bestI = Number.POSITIVE_INFINITY;
  while ((m = re.exec(text)) !== null) {
    if (m.index < bestI) {
      const open = text.indexOf("(", m.index);
      if (open < 0) {
        const raw = m[0];
        best = { start: m.index, end: m.index + raw.length, raw };
        bestI = m.index;
        continue;
      }
      const close = findMatchingParen(text, open);
      const end = close >= 0 ? close + 1 : m.index + m[0].length;
      best = { start: m.index, end, raw: text.slice(m.index, end) };
      bestI = m.index;
    }
  }
  return best;
}

/** Python: print(…) that looks like debug: contains a variable or non-trivial expr */
function innerPrintHeuristicArg(inner: string): boolean {
  const trimmed = inner.trim();
  if (trimmed.length === 0) {
    return true;
  }
  if (/^f["']/.test(trimmed)) {
    return true;
  }
  if (trimmed.includes(",")) {
    return true;
  }
  if (/^("([^"\\]|\\.)*"|'([^'\\]|\\.)*')$/.test(trimmed)) {
    return false;
  }
  if (/^("""|''')/s.test(trimmed)) {
    if (/\{/.test(trimmed)) {
      return true;
    }
    return false;
  }
  return true;
}

function findPython(text: string): { start: number; end: number; raw: string } | null {
  const m = text.match(/\bprint\s*\(/);
  if (!m || m.index === undefined) {
    return null;
  }
  const idx = m.index;
  const open = text.indexOf("(", idx);
  if (open < 0) {
    return { start: idx, end: idx + m[0].length, raw: m[0] };
  }
  const close = findMatchingParen(text, open);
  if (close < 0) {
    return { start: idx, end: text.length, raw: text.slice(idx) };
  }
  const inner = text.slice(open + 1, close);
  if (!innerPrintHeuristicArg(inner)) {
    return null;
  }
  return { start: idx, end: close + 1, raw: text.slice(idx, close + 1) };
}

function isStandaloneForLanguage(
  languageId: string,
  lineText: string,
  span: { start: number; end: number }
): boolean {
  if (["javascript", "javascriptreact", "typescript", "typescriptreact"].includes(languageId)) {
    return isStandaloneJsTs(lineText, span);
  }
  if (["python"].includes(languageId)) {
    return isStandaloneJsTs(lineText, span);
  }
  if (["go", "php"].includes(languageId)) {
    return isStandaloneJsTs(lineText, span);
  }
  return isStandaloneJsTs(lineText, span);
}

function findBuiltIn(
  languageId: string,
  lineText: string
): { start: number; end: number; raw: string } | null {
  if (["javascript", "javascriptreact", "typescript", "typescriptreact"].includes(languageId)) {
    return findJsTs(lineText);
  }
  if (languageId === "python") {
    return findPython(lineText);
  }
  if (languageId === "go") {
    return findGo(lineText);
  }
  if (languageId === "php") {
    return findPhp(lineText);
  }
  return null;
}

function shouldIgnoreLine(line: string, ignored: RegExp[]): boolean {
  for (const r of ignored) {
    r.lastIndex = 0;
    if (r.test(line)) {
      return true;
    }
  }
  return false;
}

function compilePatterns(sources: string[], label: string): RegExp[] {
  const out: RegExp[] = [];
  for (const s of sources) {
    if (!s || !s.trim()) {
      continue;
    }
    try {
      out.push(new RegExp(s, "i"));
    } catch {
      void vscode.window.showWarningMessage(
        `Log Ghost: invalid ${label} RegExp: ${s}`
      );
    }
  }
  return out;
}

function findCustomLine(
  lineText: string,
  customs: RegExp[]
): { start: number; end: number; raw: string } | null {
  for (const r of customs) {
    r.lastIndex = 0;
    const m = r.exec(lineText);
    if (m) {
      const start = m.index;
      const end = start + (m[0].length > 0 ? m[0].length : 0);
      return { start, end, raw: m[0] };
    }
  }
  return null;
}

function languageEnabled(languageId: string, config: vscode.WorkspaceConfiguration): boolean {
  const list = (config.get<string[]>("logGhost.languages") || []).map((l) => l.toLowerCase());
  return list.includes(languageId.toLowerCase());
}

export function analyzeDocument(
  document: vscode.TextDocument,
  config: vscode.WorkspaceConfiguration
): FoundDebug[] {
  if (!languageEnabled(document.languageId, config)) {
    return [];
  }
  const customRaw = config.get<string[]>("logGhost.customPatterns") || [];
  const ignoreRaw = config.get<string[]>("logGhost.ignoredPatterns") || [];
  const customs = compilePatterns(customRaw, "custom");
  const ignored = compilePatterns(ignoreRaw, "ignored");

  const out: FoundDebug[] = [];
  for (let line = 0; line < document.lineCount; line++) {
    const lineText = document.lineAt(line).text;
    if (!lineText.trim()) {
      continue;
    }
    if (shouldIgnoreLine(lineText, ignored)) {
      continue;
    }
    const built = findBuiltIn(document.languageId, lineText);
    const custom = findCustomLine(lineText, customs);
    let use: { start: number; end: number; raw: string } | null = null;
    if (built && custom) {
      use = built.start <= custom.start ? built : custom;
    } else {
      use = built || custom;
    }
    if (!use) {
      continue;
    }
    const kind: LineKind = isStandaloneForLanguage(
      document.languageId,
      lineText,
      use
    )
      ? "standalone"
      : "mixed";
    out.push({
      line,
      kind,
      matchText: use.raw,
      matchStart: use.start,
      matchEnd: use.end,
    });
  }
  return out;
}

export function getWorkspaceScanLanguages(config: vscode.WorkspaceConfiguration): string[] {
  return config.get<string[]>("logGhost.languages") || [];
}
