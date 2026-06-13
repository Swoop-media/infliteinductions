export const NO_DEPT = "No department";

export function deptKey(d: string | null | undefined): string {
  return d && d.trim() ? d.trim() : NO_DEPT;
}

// Group items by department. Real departments are sorted alphabetically; the
// "No department" bucket always sorts last. Item order within a group is preserved.
export function groupByDept<T extends { department: string | null }>(
  items: T[]
): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = deptKey(it.department);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(it);
  }
  return Array.from(map.entries()).sort((a, b) => {
    if (a[0] === NO_DEPT) return 1;
    if (b[0] === NO_DEPT) return -1;
    return a[0].localeCompare(b[0]);
  });
}

// Distinct, reasonably high-contrast colours for department arrows/badges.
export const DEPT_PALETTE = [
  "#2563eb", // blue
  "#16a34a", // green
  "#db2777", // pink
  "#d97706", // amber
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#dc2626", // red
  "#65a30d", // lime
  "#9333ea", // purple
  "#0d9488", // teal
  "#c026d3", // fuchsia
  "#b45309", // brown
];

export const NO_DEPT_COLOR = "#6b7280"; // gray

// Build a stable department -> colour map. Sorting first keeps colours stable
// regardless of the order departments happen to appear in the data.
export function buildColorMap(departments: (string | null | undefined)[]): Map<string, string> {
  const keys = Array.from(new Set(departments.map(deptKey)))
    .filter((d) => d !== NO_DEPT)
    .sort((a, b) => a.localeCompare(b));
  const map = new Map<string, string>();
  keys.forEach((d, i) => map.set(d, DEPT_PALETTE[i % DEPT_PALETTE.length]));
  map.set(NO_DEPT, NO_DEPT_COLOR);
  return map;
}
