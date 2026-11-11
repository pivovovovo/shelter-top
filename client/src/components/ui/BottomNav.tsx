import React from 'react';
import clsx from 'clsx';

export interface NavTab {
  id: string;
  label: string;
  icon: string;
  badge?: number;
}

interface BottomNavProps {
  tabs: NavTab[];
  active: string;
  onChange: (id: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ tabs, active, onChange }) => (
  <nav className="bottom-nav">
    <div className="flex justify-around items-stretch px-2">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={clsx(
              'flex-1 flex flex-col items-center justify-center gap-1 py-2 px-1 relative min-h-[56px] transition-colors',
              isActive ? 'text-bunker-amber' : 'text-bunker-muted'
            )}
          >
            <span className={clsx('text-xl leading-none transition-transform', isActive && 'scale-110')}>
              {tab.icon}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wide">{tab.label}</span>
            {tab.badge != null && tab.badge > 0 && (
              <span className="absolute top-1 right-1/4 min-w-[18px] h-[18px] bg-bunker-red text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-warm-sm">
                {tab.badge > 9 ? '9+' : tab.badge}
              </span>
            )}
            {isActive && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-bunker-amber rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  </nav>
);