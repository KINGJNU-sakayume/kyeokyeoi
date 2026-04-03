import { useApp } from '../AppContext'
import type { Tab } from '../AppContext';
import BottomTabBar from '../components/BottomTabBar';
import MapTab from './MapTab';
import TimelineTab from './TimelineTab';
import SettingsTab from './SettingsTab';
import AddMemorySheet from '../components/AddMemorySheet';

interface MainLayoutProps {
  tab: Tab;
}

export default function MainLayout({ tab }: MainLayoutProps) {
  const { navigate, addSheetOpen } = useApp();

  function handleTabChange(newTab: Tab) {
    navigate({ type: 'main', tab: newTab });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {tab === 'map' && <MapTab />}
        {tab === 'timeline' && <TimelineTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>
      <BottomTabBar activeTab={tab} onTabChange={handleTabChange} />
      {addSheetOpen && <AddMemorySheet />}
    </div>
  );
}
