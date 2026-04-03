import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../AppContext';
import KoreaMap from '../map/KoreaMap';
import { getVisitCounts, getMemoriesByRegion, getVisitedRegionCount, getCoveragePercent } from '../map/regionUtils';
import { getHeatmapColor } from '../theme/index';
import { loadRegions } from '../map/geodata';

interface Popup {
  regionCode: string;
  regionName: string;
  x: number;
  y: number;
}

export default function MapTab() {
  const { memories, theme, openAddSheet, navigate } = useApp();
  const [popup, setPopup] = useState<Popup | null>(null);
  const [totalRegions, setTotalRegions] = useState(0);

  useEffect(() => {
    loadRegions().then(r => setTotalRegions(r.length));
  }, []);

  const visitCounts = useMemo(() => getVisitCounts(memories), [memories]);
  const regionColors = useMemo(() => {
    const map = new Map<string, string>();
    for (const [code, count] of visitCounts) {
      map.set(code, getHeatmapColor(count, theme));
    }
    return map;
  }, [visitCounts, theme]);

  const visitedCount = useMemo(() => getVisitedRegionCount(memories), [memories]);
  const coverage = useMemo(() => getCoveragePercent(visitedCount, totalRegions), [visitedCount, totalRegions]);
  const isEmpty = memories.length === 0;

  function handleRegionClick(code: string, name: string, x: number, y: number) {
    setPopup({ regionCode: code, regionName: name, x, y });
  }

  function handleDismissPopup() {
    setPopup(null);
  }

  const popupMemories = popup ? getMemoriesByRegion(popup.regionCode, memories) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Map area */}
      <div
        style={{ flex: 1, overflow: 'hidden', position: 'relative', background: 'var(--color-map-bg)' }}
        onClick={handleDismissPopup}
      >
        <div style={{ padding: '8px', height: '100%', display: 'flex', alignItems: 'center' }}
          onClick={e => e.stopPropagation()}>
          <KoreaMap
            regionColors={regionColors}
            onRegionClick={handleRegionClick}
          />
        </div>

        {/* Empty state */}
        {isEmpty && (
          <div style={{
            position: 'absolute', top: '30%', left: 0, right: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            pointerEvents: 'none',
          }}>
            <p style={{
              fontSize: '15px', fontWeight: 600, color: 'var(--color-primary-deep)',
              background: 'rgba(255,255,255,0.85)', padding: '10px 18px',
              borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)',
            }}>
              0개의 추억에서 하나씩 쌓입니다
            </p>
          </div>
        )}

        {/* Region popup */}
        {popup && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: Math.min(popup.x, 280),
              top: popup.y > 200 ? popup.y - 140 : popup.y + 10,
              zIndex: 20,
              background: 'var(--color-bg)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              padding: '12px 14px',
              minWidth: '160px',
              maxWidth: '220px',
              border: '1px solid var(--color-border)',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-primary)', marginBottom: '4px' }}>
              {popup.regionName}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
              추억 {popupMemories.length}개
            </div>
            {popupMemories.slice(0, 3).map(m => (
              <button
                key={m.id}
                onClick={() => { navigate({ type: 'detail', memoryId: m.id }); setPopup(null); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  fontSize: '13px', padding: '4px 0',
                  color: 'var(--color-text-primary)', cursor: 'pointer',
                  borderBottom: '1px solid var(--color-border)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {m.title}
              </button>
            ))}
            {popupMemories.length > 3 && (
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                +{popupMemories.length - 3}개 더
              </p>
            )}
            <button
              onClick={handleDismissPopup}
              style={{
                marginTop: '8px', fontSize: '12px', color: 'var(--color-text-secondary)',
                padding: '4px 0',
              }}
            >
              닫기
            </button>
          </div>
        )}

        {/* FAB */}
        <button
          onClick={() => { handleDismissPopup(); openAddSheet(); }}
          style={{
            position: 'absolute', bottom: '16px', right: '16px',
            width: '52px', height: '52px',
            borderRadius: '50%',
            background: 'var(--color-accent)',
            color: 'white',
            fontSize: '28px', fontWeight: 300,
            boxShadow: 'var(--shadow-md)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10,
            animation: isEmpty ? 'pulse 1.8s ease-in-out infinite' : 'none',
            transition: 'transform 0.15s',
          }}
          aria-label="추억 추가"
        >
          +
        </button>
      </div>

      {/* Stats row */}
      <div style={{
        display: 'flex',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
        flexShrink: 0,
      }}>
        {[
          { label: '방문 지역', value: `${visitedCount}곳` },
          { label: '커버리지', value: `${coverage}%` },
          { label: '총 추억', value: `${memories.length}개` },
        ].map((stat, i) => (
          <div key={i} style={{
            flex: 1,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '12px 8px',
            borderRight: i < 2 ? '1px solid var(--color-border)' : 'none',
          }}>
            <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-primary)' }}>
              {stat.value}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
