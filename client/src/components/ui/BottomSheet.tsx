import React, { useEffect } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxHeight?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  open,
  onClose,
  title,
  children,
  maxHeight = '85vh',
}) => {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      {/* Затемнение фона */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Сама панель */}
      <div
        className="relative w-full bg-bunker-surface rounded-t-3xl border-t border-bunker-border animate-slide-up flex flex-col shadow-[0_-8px_32px_rgba(0,0,0,0.6)]"
        style={{ maxHeight, paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="w-12 h-1.5 bg-bunker-border rounded-full mx-auto mt-3 mb-2 flex-shrink-0" />
        
        {title && (
          <div className="px-4 pb-2 border-b border-bunker-border flex items-center justify-between flex-shrink-0">
            <h3 className="text-base font-bold text-bunker-text">{title}</h3>
            <button onClick={onClose} className="text-bunker-muted hover:text-bunker-text p-2 -mr-2 text-lg">
              ✕
            </button>
          </div>
        )}
        <div className="overflow-y-auto overscroll-contain p-4 scroll-hide">{children}</div>
      </div>
    </div>
  );
};