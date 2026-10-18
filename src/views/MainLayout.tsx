import { useApp } from '../AppContext';
import type { Tab } from '../AppContext';
import BottomTabBar from '../components/BottomTabBar';
import MapTab from './MapTab';
import TimelineTab from './TimelineTab';
import SettingsTab from './SettingsTab';

export default function MainLayout({ tab }: { tab: Tab }) {
  const { navigate } = useApp();
  return (
    <>
      <main className="screen">
        {tab === 'map' && <MapTab />}
        {tab === 'timeline' && <TimelineTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>
      <BottomTabBar activeTab={tab} onTabChange={t => navigate({ type: 'main', tab: t }, { replace: true })} />
    </>
  );
}
