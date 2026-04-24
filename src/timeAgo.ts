export function formatTimeAgo(unix: number): string {
  if (!unix) {
    return "—";
  }
  const s = Math.max(0, Math.floor(Date.now() / 1000) - unix);
  if (s < 60) {
    return "just now";
  }
  const m = Math.floor(s / 60);
  if (m < 60) {
    return `${m}m ago`;
  }
  const h = Math.floor(m / 60);
  if (h < 24) {
    return `${h}h ago`;
  }
  const d = Math.floor(h / 24);
  if (d < 7) {
    return `${d}d ago`;
  }
  const w = Math.floor(d / 7);
  if (w < 4) {
    return `${w}w ago`;
  }
  return new Date(unix * 1000).toLocaleDateString();
}

export function initialsFromName(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) {
    return "?";
  }
  if (p.length === 1) {
    return p[0]!.slice(0, 2).toUpperCase();
  }
  return (p[0]![0] + p[1]![0]).toUpperCase();
}
