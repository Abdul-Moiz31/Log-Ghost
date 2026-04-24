/**
 * No vscode / node-only for CLI precommit.
 */
export type BlameInfo = {
  commitHash: string;
  author: string;
  email: string;
  authorTime: number;
};

export function parseSingleBlameHunk(lines: string[]): BlameInfo | null {
  const reHead = /^([0-9a-f]{40})\s+\d+\s+(\d+)\s+(\d+)/;
  const h0 = reHead.exec(lines[0] || "");
  if (!h0) {
    return null;
  }
  const commitHash = h0[1];
  let author = "";
  let email = "";
  let time = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("\t")) {
      break;
    }
    const mAuth = /^author (.*)$/.exec(line);
    if (mAuth) {
      author = mAuth[1]!.trim();
    }
    const mMail = /^author-mail (.*)$/.exec(line);
    if (mMail) {
      const raw = mMail[1]!.trim();
      const inner = raw.match(/^<([^>]+)>/);
      email = inner ? inner[1]! : raw.replace(/[<>]/g, "");
    }
    const mTime = /^author-time (\d+)/.exec(line);
    if (mTime) {
      time = parseInt(mTime[1]!, 10);
    }
  }
  return { commitHash, author, email, authorTime: time };
}
