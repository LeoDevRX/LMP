/**
 * Mesh name matching for baking, like Substance Painter's "Match: By mesh name":
 * "Helmet_low" pairs with "Helmet_high" (and "Helmet_high_bolts"), because both reduce to the key "helmet".
 */
export interface NameRules { low: string; high: string; ignoreBf: string }
export const DEFAULT_NAME_RULES: NameRules = { low: '_low', high: '_high', ignoreBf: '_ignorebf' };

/** The part of a mesh name before its low / high suffix (lower case); the whole name when it has neither. */
export function meshKey(name: string, r: NameRules = DEFAULT_NAME_RULES): string {
  let n = (name || '').toLowerCase().trim();
  n = n.replace(/\.\d{3}$/, ''); // Blender's ".001" duplicates
  for (const suf of [r.low, r.high]) {
    const s = (suf || '').toLowerCase();
    if (!s) continue;
    const i = n.lastIndexOf(s);
    if (i > 0) { n = n.slice(0, i); break; }
  }
  return n.replace(/[_\-. ]+$/, '');
}

/** True when the name carries the "ignore backface" suffix. */
export function wantsIgnoreBf(name: string, r: NameRules = DEFAULT_NAME_RULES): boolean {
  const s = (r.ignoreBf || '').toLowerCase();
  return !!s && (name || '').toLowerCase().includes(s);
}

/** Small integer ids for keys, shared between low and high meshes. */
export function keyIds(names: string[][], r: NameRules = DEFAULT_NAME_RULES): number[][] {
  const ids = new Map<string, number>();
  return names.map((list) => list.map((n) => {
    const k = meshKey(n, r);
    if (!ids.has(k)) ids.set(k, ids.size);
    return ids.get(k)!;
  }));
}
