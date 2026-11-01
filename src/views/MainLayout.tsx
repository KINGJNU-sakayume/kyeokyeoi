import { useApp } from '../AppContext';
import type { Tab } from '../AppContext';
import BottomTabBar from '../components/BottomTabBar';
import MapTab from './MapTab';
import TimelineTab from './TimelineTab';
import MemoriesTab from './MemoriesTab';
import CollectionsTab from './CollectionsTab';
import { IconSettings } from '../components/icons';
import SettingsTab from './SettingsTab';

export default function MainLayout({ tab }: { tab: Tab }) {
  const { navigate, setArchiveTarget } = useApp();
  return (
    <>
      <main className={`screen app-main ${tab === 'map' ? 'app-main--map' : ''}`}>
        <button className="icon-btn settings-entry" aria-label={tab === 'settings' ? '설정 닫기' : '설정 열기'} onClick={() => navigate({ type: 'main', tab: tab === 'settings' ? 'map' : 'settings' })}><IconSettings /></button>
        {tab === 'map' && <MapTab />}
        {tab === 'timeline' && <TimelineTab />}
        {tab === 'memories' && <MemoriesTab />}
        {tab === 'collections' && <CollectionsTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>
      <BottomTabBar activeTab={tab} onTabChange={t => { setArchiveTarget(null); navigate({ type: 'main', tab: t }, { replace: true }); }} />
    </>
  );
}
