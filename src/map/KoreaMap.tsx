import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { unionBox, useRegions } from './geodata';

interface KoreaMapProps {
  /** 지역 코드 → 채우기 색 */
  fills?: Map<string, string>;
  selectedCode?: string | null;
  onRegionTap?: (code: string) => void;
  /** 확대·이동과 탭을 받을지 (지역 선택 미리보기에서는 끔) */
  interactive?: boolean;
  /** 처음 보여줄 영역 [minX, minY, maxX, maxY] */
  focusBox?: [number, number, number, number] | null;
  className?: string;
}

type View = { x: number; y: number; w: number; h: number };
const TAP_SLOP = 8;
const MAX_ZOOM = 12;
const OFFSHORE = new Set(['37430']); // 울릉군(독도 포함)

export default function KoreaMap({ fills, selectedCode, onRegionTap, interactive = true, focusBox, className }: KoreaMapProps) {
  const set = useRegions();
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // 화면 비율에 맞춰 보이는 영역을 잡아야 세로로 긴 휴대폰에서도 지도가 꽉 차요
  const [aspect, setAspect] = useState<number | null>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setAspect(width / height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [set]);
  const full = useMemo<View | null>(() => (set ? { x: 0, y: 0, w: set.width, h: set.height } : null), [set]);

  // 처음 화면: 고른 영역, 없으면 울릉·독도를 뺀 본토와 제주에 맞춰요 (축소하면 전체가 보여요)
  const home = useMemo(() => {
    if (!set) return null;
    if (focusBox) return { box: focusBox, pad: 0.35, minW: set.width / 6 };
    return { box: unionBox(set.regions.filter(r => !OFFSHORE.has(r.code))), pad: 0.04, minW: 0 };
  }, [set, focusBox]);

  const initial = useMemo<View | null>(() => {
    if (!full) return null;
    const a = aspect ?? full.w / full.h;
    const box = home?.box ?? [0, 0, full.w, full.h];
    const pad = home?.pad ?? 0;
    const bw = box[2] - box[0], bh = box[3] - box[1];
    const w = Math.min(full.w, Math.max(bw * (1 + pad * 2), bh * a * (1 + pad * 2), full.w / MAX_ZOOM, home?.minW ?? 0));
    const h = w / a;
    return clampView({ x: box[0] + bw / 2 - w / 2, y: box[1] + bh / 2 - h / 2, w, h }, full, a);
  }, [full, home, aspect]);

  const [view, setView] = useState<View | null>(initial);
  const [shownInitial, setShownInitial] = useState(initial);
  if (shownInitial !== initial) {
    // 고른 지역이 바뀌면 그쪽으로 다시 맞춰요
    setShownInitial(initial);
    setView(initial);
  }
  const viewRef = useRef<View | null>(initial);
  useEffect(() => { viewRef.current = view; }, [view]);

  const aspectRef = useRef<number | null>(null);
  useEffect(() => { aspectRef.current = aspect; }, [aspect]);

  const apply = useCallback((v: View) => {
    if (!full) return;
    const c = clampView(v, full, aspectRef.current ?? full.w / full.h);
    viewRef.current = c;
    setView(c);
  }, [full]);

  /** 화면 좌표 → 지도 좌표 */
  const toMap = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current, v = viewRef.current;
    if (!svg || !v) return { x: 0, y: 0, s: 1 };
    const rect = svg.getBoundingClientRect();
    const s = Math.max(v.w / rect.width, v.h / rect.height);
    const ox = (rect.width * s - v.w) / 2, oy = (rect.height * s - v.h) / 2;
    return { x: v.x - ox + (clientX - rect.left) * s, y: v.y - oy + (clientY - rect.top) * s, s };
  }, []);

  const zoomAt = useCallback((factor: number, mx: number, my: number) => {
    const v = viewRef.current;
    if (!v || !full) return;
    const w = Math.min(full.w, Math.max(full.w / MAX_ZOOM, v.w / factor));
    const k = w / v.w;
    apply({ x: mx - (mx - v.x) * k, y: my - (my - v.y) * k, w, h: v.h * k });
  }, [apply, full]);

  // ---- 포인터: 한 손가락 이동, 두 손가락 확대, 짧은 탭은 지역 선택 ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ code: string | null; startX: number; startY: number; moved: boolean; multi: boolean; pinchDist: number }>({
    code: null, startX: 0, startY: 0, moved: false, multi: false, pinchDist: 0,
  });

  function onPointerDown(e: React.PointerEvent) {
    if (!interactive) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 1) {
      const el = (e.target as Element).closest('[data-code]');
      g.code = el?.getAttribute('data-code') ?? null;
      g.startX = e.clientX; g.startY = e.clientY; g.moved = false; g.multi = false;
    } else {
      g.multi = true;
      g.pinchDist = pinchDistance();
    }
  }

  function pinchDistance() {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!interactive || !prev) return;
    const g = gesture.current;
    if (pointers.current.size === 1) {
      if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > TAP_SLOP) {
        g.moved = true;
        svgRef.current?.setPointerCapture(e.pointerId);
      }
      if (g.moved) {
        const v = viewRef.current;
        const { s } = toMap(e.clientX, e.clientY);
        if (v) apply({ ...v, x: v.x - (e.clientX - prev.x) * s, y: v.y - (e.clientY - prev.y) * s });
      }
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    } else {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const d = pinchDistance();
      if (g.pinchDist > 0 && d > 0) {
        const [a, b] = [...pointers.current.values()];
        const mid = toMap((a.x + b.x) / 2, (a.y + b.y) / 2);
        zoomAt(d / g.pinchDist, mid.x, mid.y);
      }
      g.pinchDist = d;
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!interactive) return;
    const g = gesture.current;
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (wasSingle && !g.moved && !g.multi && g.code && e.type === 'pointerup') onRegionTap?.(g.code);
    if (pointers.current.size === 0) g.multi = false;
    else g.pinchDist = pinchDistance();
  }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !interactive) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toMap(e.clientX, e.clientY);
      zoomAt(Math.exp(-e.deltaY * 0.0025), p.x, p.y);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [interactive, toMap, zoomAt, set]);

  function zoomButton(factor: number) {
    const v = viewRef.current;
    if (v) zoomAt(factor, v.x + v.w / 2, v.y + v.h / 2);
  }

  if (set === undefined || !view) {
    return <div ref={wrapRef} className={`map ${className ?? ''}`} aria-busy="true" />;
  }
  if (set === null) {
    return (
      <div ref={wrapRef} className={`map map--error ${className ?? ''}`}>
        <p>지도를 불러오지 못했어요. 인터넷에 연결된 상태로 한 번 열면 그다음부터는 오프라인에서도 보여요.</p>
      </div>
    );
  }

  const moved = !!initial && (Math.abs(view.w - initial.w) > 1 || Math.abs(view.x - initial.x) > 1 || Math.abs(view.y - initial.y) > 1);
  const canZoomOut = !!full && view.w < full.w - 1;
  const selected = selectedCode ? set.byCode.get(selectedCode) : undefined;

  return (
    <div ref={wrapRef} className={`map ${className ?? ''}`}>
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        className={interactive ? 'map__svg map__svg--interactive' : 'map__svg'}
        role="img"
        aria-label="대한민국 시군구 지도"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {set.regions.map(r => (
          <path
            key={r.code}
            d={r.path}
            data-code={r.code}
            fill={fills?.get(r.code) ?? 'var(--land)'}
            className="map__region"
          >
            <title>{r.name}</title>
          </path>
        ))}
        {selected && <path d={selected.path} className="map__selected" />}
      </svg>
      {interactive && (
        <div className="map__controls" role="group" aria-label="지도 확대">
          <button type="button" className="icon-btn" onClick={() => zoomButton(1.6)} aria-label="확대">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button type="button" className="icon-btn" onClick={() => zoomButton(1 / 1.6)} aria-label="축소" disabled={!canZoomOut}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
          </button>
          {moved && (
            <button type="button" className="icon-btn" onClick={() => initial && apply(initial)} aria-label="처음 위치로">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function clampView(v: View, full: View, aspect: number): View {
  const w = Math.min(full.w, Math.max(full.w / MAX_ZOOM, v.w));
  const h = w / aspect;
  // 지도 밖으로 반 화면 이상 밀려나지 않게. 한 축이 지도보다 넓으면 그 축은 가운데에 둬요.
  const x = w >= full.w ? 0 : Math.min(full.w - w / 2, Math.max(-w / 2, v.x));
  const y = h >= full.h ? (full.h - h) / 2 : Math.min(full.h - h / 2, Math.max(-h / 2, v.y));
  return { x, y, w, h };
}
