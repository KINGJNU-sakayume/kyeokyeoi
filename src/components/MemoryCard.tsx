import type { Memory } from '../db/index';
import { formatTimeDisplay } from '../utils/timeUtils';
import { usePhotoURL } from '../utils/photoUtils';
import { displayRegion, useRegions } from '../map/geodata';

interface MemoryCardProps {
  memory: Memory;
  onClick: () => void;
  /** 지역 화면처럼 지역이 뻔할 때는 지역 표시를 빼요 */
  hideRegion?: boolean;
}

/** 타임라인과 지역 시트의 추억 한 줄 */
export default function MemoryCard({ memory, onClick, hideRegion }: MemoryCardProps) {
  const regions = useRegions();
  const thumb = usePhotoURL(memory.photoIds[0]);
  const time = formatTimeDisplay(memory);
  const region = hideRegion ? null : displayRegion(memory.regionCode, memory.regionLabel, regions);

  return (
    <button type="button" className="entry" onClick={onClick}>
      <div className="entry__main">
        {memory.isFirst && <span className="entry__first">첫 경험</span>}
        <p className="entry__title">{memory.title}</p>
        {(region || time || memory.emotions.length > 0) && (
          <p className="entry__meta">
            {region && <span>{region}</span>}
            {time && <span>{time}</span>}
            {memory.emotions.length > 0 && <span aria-label="감정">{memory.emotions.join('')}</span>}
          </p>
        )}
        {memory.memo && <p className="entry__memo">{memory.memo}</p>}
      </div>
      {memory.photoIds.length > 0 && (
        thumb ? <img className="entry__thumb" src={thumb} alt="" /> : <span className="entry__thumb" />
      )}
    </button>
  );
}
