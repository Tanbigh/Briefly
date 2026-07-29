export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSeconds = Math.max(1, Math.round((now - then) / 1000));

  const units: [number, string][] = [
    [60, "s"],
    [60, "m"],
    [24, "h"],
    [7, "d"],
    [4.345, "w"]
  ];

  let value = diffSeconds;
  let unit = "s";
  for (const [factor, label] of units) {
    if (value < factor) {
      unit = label;
      break;
    }
    value = Math.floor(value / factor);
    unit = label;
  }

  return `${value}${unit} ago`;
}
