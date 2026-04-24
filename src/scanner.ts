import * as vscode from "vscode";
import {
  type FoundDebug,
  analyzeDocument as detectorAnalyze,
} from "./detector";
import type { LogSeverity } from "./types";

/**
 * Heuristic classification per spec:
 * - critical: secrets, env, keys, private data
 * - debug: request/response, variables, function results, typical debugging
 * - safe: mostly string literals, intentional
 */
export function classifySeverity(
  lineText: string,
  f: FoundDebug,
  languageId: string
): LogSeverity {
  if (isCriticalLine(lineText, f, languageId)) {
    return "critical";
  }
  if (isSafeIntentional(lineText, f, languageId)) {
    return "safe";
  }
  return "debug";
}

function isCriticalLine(
  line: string,
  f: FoundDebug,
  _lang: string
): boolean {
  const L = line + f.matchText;
  if (
    /\b(password|passwd|token|secret|api[_-]?key|bearer|authorization|ssn|credit\s*card|private[_-]?key|access[_-]?token|refresh[_-]?token|authToken|apikey)\b/i.test(
      L
    )
  ) {
    return true;
  }
  if (/\bprivate\b|user\.password|user\.ssn|\.creditCard/i.test(L)) {
    return true;
  }
  if (/\bprocess\.env\.|import\.meta\.env\./.test(L)) {
    return true;
  }
  if (/\b(localStorage|sessionStorage)\.getItem/i.test(L)) {
    return true;
  }
  if (/atob\s*\(|btoa\s*\(/.test(L) && /token|key|auth|secret/i.test(L)) {
    return true;
  }
  return false;
}

/** Low-risk: single template-free string in console, or trivial print in Python. */
function isSafeIntentional(
  line: string,
  f: FoundDebug,
  languageId: string
): boolean {
  const m = f.matchText;
  const inJs = ["javascript", "javascriptreact", "typescript", "typescriptreact"].includes(
    languageId
  );
  if (inJs) {
    if (/\bconsole\.(info|debug)\s*\(\s*['"`]/.test(m) && !/\$\{|`/.test(line)) {
      return true;
    }
    if (
      /console\.log\s*\(\s*['"`](?:[^\\]|\\.)*['"`]\s*\)/.test(m) &&
      !/\$\{/.test(f.matchText) &&
      !/\+\s*["'`]|\)\s*\+|,\s*[^"'\s\)]/m.test(f.matchText)
    ) {
      return true;
    }
  }
  if (languageId === "python") {
    if (/^print\s*\(\s*["'][^"']*["']\s*\)\s*$/i.test(m)) {
      return true;
    }
  }
  if (inJs) {
    if (/\/\/\s*(intentional|ok|permanent|do not remove)/i.test(line)) {
      return true;
    }
  }
  return false;
}

export function scanDocument(
  document: vscode.TextDocument,
  config: vscode.WorkspaceConfiguration
): FoundDebug[] {
  return detectorAnalyze(document, config);
}
