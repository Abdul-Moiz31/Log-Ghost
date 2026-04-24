/**
 * No vscode import — for CLI pre-commit / hook.
 * Broad match for common debug output (align with detector for JS/TS first).
 */
export function findMatchingParen(s: string, openIdx: number): number {
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

function findJsTsLine(text: string): { start: number; end: number } | null {
  const d = text.match(/\bdebugger\s*;?/);
  if (d && d.index !== undefined) {
    return { start: d.index, end: d.index + d[0].length };
  }
  const m = text.match(/\bconsole\.(log|warn|error|debug|info)\s*\(/);
  if (m && m.index !== undefined) {
    const open = text.indexOf("(", m.index);
    if (open < 0) {
      return { start: m.index, end: m.index + m[0].length };
    }
    const close = findMatchingParen(text, open);
    if (close < 0) {
      return { start: m.index, end: text.length };
    }
    return { start: m.index, end: close + 1 };
  }
  return null;
}

function findPythonLine(text: string): { start: number; end: number } | null {
  const m = text.match(/\bprint\s*\(/);
  if (m && m.index !== undefined) {
    const open = text.indexOf("(", m.index);
    if (open < 0) {
      return { start: m.index, end: m.index + m[0].length };
    }
    const close = findMatchingParen(text, open);
    if (close < 0) {
      return { start: m.index, end: text.length };
    }
    return { start: m.index, end: close + 1 };
  }
  return null;
}

const extLang: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".php": "php",
};

function findLine(
  lineText: string,
  languageId: string
): { start: number; end: number } | null {
  if (
    [
      "javascript",
      "javascriptreact",
      "typescript",
      "typescriptreact",
    ].includes(languageId)
  ) {
    return findJsTsLine(lineText);
  }
  if (languageId === "python") {
    return findPythonLine(lineText);
  }
  return null;
}

export function scanStagedTextForDebugLines(
  filePath: string,
  content: string
): { line0: number }[] {
  const ext = filePath.toLowerCase().lastIndexOf(".");
  const e = ext >= 0 ? filePath.slice(ext) : "";
  const lang = extLang[e];
  if (!lang) {
    return [];
  }
  const out: { line0: number }[] = [];
  const lines = content.split(/\r\n|\n/);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!;
    if (!t.trim()) {
      continue;
    }
    if (findLine(t, lang)) {
      out.push({ line0: i });
    }
  }
  return out;
}
