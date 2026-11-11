import React, { useState } from 'react';
import clsx from 'clsx';

interface CollapsibleProps {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accent?: 'amber' | 'red' | 'green' | 'purple' | 'gold';
}

const accentClass = {
  amber: 'border-bunker-amber/30 text-bunker-amber',
  red: 'border-bunker-red/30 text-bunker-red',
  green: 'border-bunker-green/30 text-bunker-green',
  purple: 'border-bunker-purple/30 text-bunker-purple',
  gold: 'border-bunker-gold/30 text-bunker-gold',
};

export const Collapsible: React.FC<CollapsibleProps> = ({
  title,
  children,
  defaultOpen,
  accent = 'amber',
}) => {
  const [open, setOpen] = useState(defaultOpen ?? false);
  
  return (
    <div className={clsx('card overflow-hidden border-2 transition-colors', open ? accentClass[accent] : 'border-bunker-border')}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left min-h-[44px]"
      >
        <div className="flex-1 min-w-0 font-bold text-sm">{title}</div>
        <span className={clsx('text-lg transition-transform flex-shrink-0 text-bunker-muted', open && 'rotate-180')}>⌄</span>
      </button>
      {open && <div className="px-4 pb-4 animate-fade-in border-t border-bunker-border/50 pt-3">{children}</div>}
    </div>
  );
};