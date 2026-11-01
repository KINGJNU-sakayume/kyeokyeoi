import { useState } from 'react';
import { useApp } from '../AppContext';
import type { MemoryCollection } from '../db';
import { deleteCollection } from '../db';
import ArchiveEditor from '../components/ArchiveEditor';
import MemoryCard from '../components/MemoryCard';
import ConfirmDialog from '../components/ConfirmDialog';
export default function CollectionsTab() {
  const { collections, memories, navigate, refreshArchive, showToast, archiveTarget } = useApp();
  const [editing, setEditing] = useState<MemoryCollection | 'new' | null>(null);
  const [selected, setSelected] = useState<string | null>(archiveTarget?.startsWith('collection:') ? archiveTarget.slice(11) : null);
  const [removing, setRemoving] = useState<MemoryCollection | null>(null);
  const automatic = [
    { id: 'auto:first', title: '처음 해본 일들', memoryIds: memories.filter(m => m.isFirst).map(m => m.id) },
    { id: 'auto:photo', title: '사진을 함께 남긴 기억', memoryIds: memories.filter(m => m.photoIds.length > 0).map(m => m.id) },
  ].filter(c => c.memoryIds.length > 0);
  const manual = collections.find(c => c.id === selected);
  const current = collections.find(c => c.id === selected) ?? automatic.find(c => c.id === selected);
  return <div className="screen"><div className="screen__scroll archive-page">
    <header className="page-head"><h1 className="page-title">컬렉션</h1><p className="page-lede">여러 시간과 장소의 기억을 한 주제로 모아요.</p></header>
    {current ? <div className="collection-detail"><button className="text-btn" onClick={() => setSelected(null)}>모든 컬렉션</button><h2 className="chapter-title">{current.title}</h2>
      {memories.filter(m => current.memoryIds.includes(m.id)).map(m => <MemoryCard key={m.id} memory={m} onClick={() => navigate({ type: 'detail', memoryId: m.id })} />)}
      {!current.memoryIds.some(id => memories.some(m => m.id === id)) && <p className="field__hint">아직 담긴 기억이 없어요.</p>}
      {manual && <><button className="text-btn" onClick={() => setEditing(manual)}>기억·이름 고치기</button><button className="text-btn text-btn--danger" onClick={() => setRemoving(manual)}>컬렉션 삭제</button></>}
    </div> : <div className="collection-list"><button className="text-btn" onClick={() => setEditing('new')}>컬렉션 만들기</button>
      {collections.length > 0 && <h2 className="group__title">직접 만든 컬렉션</h2>}{collections.map(c => <button key={c.id} className="row" onClick={() => setSelected(c.id)}><span className="row__label">{c.title}</span><span className="row__value">{memories.filter(m => c.memoryIds.includes(m.id)).length}개</span></button>)}
      {!collections.length && <p className="group__note">컬렉션 없이도 모든 기억을 기록하고 탐색할 수 있어요.</p>}
      {automatic.length > 0 && <><h2 className="group__title automatic-heading">자동 모음</h2>{automatic.map(c => <button className="row" key={c.id} onClick={() => setSelected(c.id)}><span className="row__label">{c.title}<small>{c.id === 'auto:first' ? '첫 경험으로 표시한 기억' : '사진 참조가 있는 기억'}</small></span><span className="row__value">{c.memoryIds.length}개</span></button>)}</>}
    </div>}
    {editing && <ArchiveEditor kind="collection" value={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    {removing && <ConfirmDialog message="컬렉션을 삭제할까요?" subMessage="원래 기억은 모두 유지돼요." confirmLabel="삭제" onCancel={() => setRemoving(null)} onConfirm={async () => { try { await deleteCollection(removing.id); await refreshArchive(); setRemoving(null); setSelected(null); } catch { showToast('삭제하지 못했어요.'); } }} />}
  </div></div>;
}
