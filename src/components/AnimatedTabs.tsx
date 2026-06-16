import { useState } from 'react';

interface AnimatedTabsProps {
  tabs: Array<{
    id: string;
    label: string;
    content: React.ReactNode;
  }>;
  defaultTab?: string;
  className?: string;
}

export const AnimatedTabs = ({
  tabs,
  defaultTab,
  className = '',
}: AnimatedTabsProps) => {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);
  const activeIndex = tabs.findIndex(t => t.id === activeTab);

  return (
    <div className={className}>
      <div className="tabs-animated relative flex border-b border-border">
        {tabs.map((tab, idx) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              px-4 py-3 font-medium text-sm
              transition-colors duration-300
              ${activeTab === tab.id
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
        {/* Animated indicator */}
        <div
          className="tab-indicator"
          style={{
            left: `${activeIndex * 100}%`,
            width: `${100 / tabs.length}%`,
          }}
        />
      </div>

      {/* Tab content with fade animation */}
      <div className="mt-4">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`
              transition-all duration-300
              ${activeTab === tab.id
                ? 'opacity-100'
                : 'hidden opacity-0'
              }
            `}
          >
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AnimatedTabs;
