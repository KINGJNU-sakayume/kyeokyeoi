import { useEffect, useRef, useState } from 'react';
import { SVG_WIDTH, SVG_HEIGHT, loadRegions } from './geodata'
import type { RegionData } from './geodata';

interface KoreaMapProps {
  regionColors?: Map<string, string>;
  onRegionClick?: (code: string, name: string, x: number, y: number) => void;
  compact?: boolean;
  selectedCode?: string | null;
}

export default function KoreaMap({ regionColors, onRegionClick, compact, selectedCode }: KoreaMapProps) {
  const [regions, setRegions] = useState<RegionData[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    loadRegions().then(r => {
      setRegions(r);
      setLoading(false);
    });
  }, []);

  function handleTouchEnd(e: React.TouchEvent, region: RegionData) {
    if (!onRegionClick) return;
    e.preventDefault(); // Prevents subsequent click event from firing

    const touch = e.changedTouches[0];
    const rect = containerRef.current?.getBoundingClientRect();
    const x = rect ? touch.clientX - rect.left : touch.clientX;
    const y = rect ? touch.clientY - rect.top : touch.clientY;

    onRegionClick(region.code, region.name, x, y);
  }

  function handleClick(e: React.MouseEvent, region: RegionData) {
    if (!onRegionClick) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : e.clientX;
    const y = rect ? e.clientY - rect.top : e.clientY;

    onRegionClick(region.code, region.name, x, y);
  }

  const viewBox = `0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`;

  if (loading) {
    return (
      <svg
        viewBox={viewBox}
        style={{ width: '100%', height: compact ? '200px' : 'auto' }}
        aria-label="지도 로딩 중"
      >
        <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="var(--color-map-bg)" rx="8" />
        <text x={SVG_WIDTH / 2} y={SVG_HEIGHT / 2} textAnchor="middle" fill="var(--color-text-secondary)" fontSize="14">
          지도 로딩 중...
        </text>
      </svg>
    );
  }

  if (regions.length === 0) {
    return (
      <svg
        viewBox={viewBox}
        style={{ width: '100%', height: compact ? '200px' : 'auto' }}
        aria-label="지도를 불러올 수 없습니다"
      >
        <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="var(--color-map-bg)" rx="8" />
        <text x={SVG_WIDTH / 2} y={SVG_HEIGHT / 2} textAnchor="middle" fill="var(--color-text-secondary)" fontSize="14">
          지도를 불러올 수 없습니다
        </text>
      </svg>
    );
  }

  return (
    <svg
      ref={containerRef}
      viewBox={viewBox}
      style={{ width: '100%', height: compact ? '200px' : 'auto', display: 'block' }}
      aria-label="대한민국 지도"
      role="img"
    >
      <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="var(--color-map-bg)" />
      {regions.map(region => {
        const fill = regionColors?.get(region.code) ?? '#DDDDD6';
        const isSelected = selectedCode === region.code;
        return (
          <path
            key={region.code}
            d={region.path}
            fill={fill}
            stroke={isSelected ? 'var(--color-primary-deep)' : 'none'}
            strokeWidth={isSelected ? '1.5' : '0'}
            strokeLinejoin="round"
            data-region-code={region.code}
            style={{ cursor: onRegionClick ? 'pointer' : 'default', outline: 'none' }}
            onClick={e => handleClick(e, region)}
            onTouchEnd={e => handleTouchEnd(e, region)}
            aria-label={region.name}
          />
        );
      })}
    </svg>
  );
}
