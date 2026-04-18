export function formatSeconds(value: number): string {
  return `${value.toFixed(value >= 10 ? 1 : 2)}s`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatBytes(value: number): string {
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDateTime(value: number | string): string {
  const date = typeof value === "string" ? new Date(value) : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
