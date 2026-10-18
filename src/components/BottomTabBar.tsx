import type { Tab } from '../AppContext';
import { IconLayers, IconMap, IconSettings } from './icons';

const TABS: { id: Tab; label: string; Icon: () => React.JSX.Element }[] = [
  { id: 'map', label: '지도', Icon: IconMap },
  { id: 'timeline', label: '타임라인', Icon: IconLayers },
  { id: 'settings', label: '설정', Icon: IconSettings },
];

export default function BottomTabBar({ activeTab, onTabChange }: { activeTab: Tab; onTabChange: (tab: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="화면">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className="tabbar__item"
          aria-current={id === activeTab ? 'page' : undefined}
          onClick={() => onTabChange(id)}
        >
          <Icon />
          {label}
        </button>
      ))}
    </nav>
  );
}
