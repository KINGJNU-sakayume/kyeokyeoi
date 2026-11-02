/**
 * Match a 시군구 name written by a person or an assistant ("경기 고양시 일산서구", "경기도 고양시 일산서구",
 * "부산 해운대구") to exactly one region. Returns null unless the match is unambiguous, so a wrong guess
 * never gets pre-selected: "중구" alone or "고양시" alone stay unresolved.
 */
export interface RegionLike {
  code: string;
  name: string;
  prov: string;
}
export interface ProvinceLike {
  code: string;
  name: string;
  short: string;
}

const squash = (s: string) => s.normalize('NFC').replace(/[\s·,]/g, '');

export function matchRegion<R extends RegionLike>(hint: string, regions: R[], provinces: ProvinceLike[]): R | null {
  const h = squash(hint);
  if (!h) return null;
  const provinceByCode = new Map(provinces.map((p) => [p.code, p]));
  const forms = (r: R): string[] => {
    const p = provinceByCode.get(r.prov);
    if (r.prov === '29') return ['세종', '세종시', '세종특별자치시'];
    const prefixes = p ? ['', p.short, p.name, p.short + '시', p.short + '도'] : [''];
    return prefixes.map((pre) => squash(pre + r.name));
  };
  const exact = regions.filter((r) => forms(r).includes(h));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  // Allow a trailing 동/읍/면 or venue after the 시군구 ("경기 고양시 일산서구 대화동"), longest match only.
  let best: R[] = [];
  let bestLength = 0;
  for (const r of regions)
    for (const f of forms(r))
      if (f && h.startsWith(f) && f.length >= 4) {
        if (f.length > bestLength) {
          best = [r];
          bestLength = f.length;
        } else if (f.length === bestLength && !best.includes(r)) best.push(r);
      }
  return best.length === 1 ? best[0] : null;
}
