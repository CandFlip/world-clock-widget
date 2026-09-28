export type SupportMethod = { id: string; label: string; instructions: string; image: string; url: string; active: string };

export function mergeMethodRows(defaults: SupportMethod[], rows: SupportMethod[], includeHidden = false): SupportMethod[] {
  const overrides = new Map(rows.map((row) => [row.id, row]));
  const resolved = defaults.map((row) => overrides.get(row.id) || row);
  const custom = rows.filter((row) => !defaults.some((item) => item.id === row.id));
  return [...resolved, ...custom].filter((row) => row.active !== '-1' && (includeHidden || row.active === '1'));
}
