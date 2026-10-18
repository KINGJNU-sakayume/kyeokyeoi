import { useState } from 'react';
import { useApp } from '../AppContext';
import { deleteMemory } from '../db/index';
import { formatTimeDisplay } from '../utils/timeUtils';
import { forgetPhotoURL } from '../utils/photoUtils';
import { displayRegion, useRegions } from '../map/geodata';
import PhotoGallery from '../components/PhotoGallery';
import ConfirmDialog from '../components/ConfirmDialog';
import { EMOTIONS } from '../utils/emotions';
import { IconBack } from '../components/icons';

const EMOTION_LABEL = new Map(EMOTIONS.map(e => [e.emoji, e.label]));

export default function MemoryDetailView({ memoryId }: { memoryId: string }) {
  const { memories, goBack, refreshMemories, openEditSheet, showToast } = useApp();
  const regions = useRegions();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const memory = memories.find(m => m.id === memoryId);
  const back = () => goBack({ type: 'main', tab: 'timeline' });

  async function handleDelete() {
    if (!memory) return;
    setDeleting(true);
    try {
      await deleteMemory(memory.id);
      memory.photoIds.forEach(forgetPhotoURL);
      await refreshMemories();
      showToast('지웠어요.');
      back();
    } catch {
      showToast('지우지 못했어요. 다시 시도해 주세요.');
      setDeleting(false);
      setConfirm(false);
    }
  }

  if (!memory) {
    return (
      <div className="screen">
        <div className="topbar">
          <button type="button" className="icon-btn" onClick={back} aria-label="뒤로"><IconBack /></button>
        </div>
        <div className="empty">
          <p className="empty__title">이 추억을 찾을 수 없어요</p>
          <p className="empty__body">지워졌거나 다른 기기에서 만든 링크일 수 있어요.</p>
        </div>
      </div>
    );
  }

  const time = formatTimeDisplay(memory);
  const region = displayRegion(memory.regionCode, memory.regionLabel, regions);
  const song = memory.song && [memory.song.artist, memory.song.title].filter(Boolean).join(', ');

  return (
    <div className="screen">
      <div className="topbar">
        <button type="button" className="icon-btn" onClick={back} aria-label="뒤로"><IconBack /></button>
        <span className="topbar__spacer" />
        <button type="button" className="text-btn" onClick={() => openEditSheet(memory.id)}>고치기</button>
      </div>

      <article className="screen__scroll">
        <div className="detail">
          <PhotoGallery photoIds={memory.photoIds} />
          {memory.isFirst && <p className="detail__first">첫 경험</p>}
          <h1 className="detail__title">{memory.title}</h1>

          {(region || time || song || memory.emotions.length > 0) && (
            <dl className="facts">
              {time && <><dt>언제</dt><dd>{time}</dd></>}
              {region && <><dt>어디서</dt><dd>{region}</dd></>}
              {memory.emotions.length > 0 && (
                <>
                  <dt>기분</dt>
                  <dd>{memory.emotions.map(e => `${e} ${EMOTION_LABEL.get(e) ?? ''}`.trim()).join('  ')}</dd>
                </>
              )}
              {song && <><dt>노래</dt><dd>{song}</dd></>}
            </dl>
          )}

          {memory.memo && <p className="detail__memo">{memory.memo}</p>}

          <div className="detail__foot">
            <span>{new Date(memory.createdAt).toLocaleDateString('ko-KR')}에 기록</span>
            <button type="button" className="text-btn text-btn--danger" onClick={() => setConfirm(true)} disabled={deleting}>
              지우기
            </button>
          </div>
        </div>
      </article>

      {confirm && (
        <ConfirmDialog
          message="이 추억을 지울까요?"
          subMessage="사진까지 함께 지워지고 되돌릴 수 없어요."
          confirmLabel="지우기"
          destructive
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
