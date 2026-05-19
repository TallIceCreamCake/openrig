import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, PlusSquare } from 'lucide-react';

interface SidebarContextMenuProps {
  x: number;
  y: number;
  label: string;
  href: string;
  onOpenInTab: () => void;
  onClose: () => void;
}

const SidebarContextMenu: React.FC<SidebarContextMenuProps> = ({
  x,
  y,
  label,
  href,
  onOpenInTab,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Slight delay so the mousedown that triggered the context menu doesn't immediately close it
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handleDown);
      document.addEventListener('keydown', handleKey);
    }, 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Keep within viewport
  const menuW = 228;
  const menuH = 120;
  const adjX = x + menuW > window.innerWidth ? x - menuW : x;
  const adjY = y + menuH > window.innerHeight ? y - menuH : y;

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[99999] bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 py-1.5 overflow-hidden"
      style={{
        top: adjY,
        left: adjX,
        width: menuW,
        animation: 'contextMenuIn 120ms cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      <style>{`
        @keyframes contextMenuIn {
          from { opacity: 0; transform: scale(0.95) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {/* Title */}
      <div className="px-3 pt-1 pb-2 border-b border-gray-100 dark:border-gray-800">
        <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide truncate">
          {label}
        </p>
      </div>

      {/* Actions */}
      <div className="pt-1">
        <button
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          onClick={() => { onOpenInTab(); onClose(); }}
        >
          <div className="h-6 w-6 rounded-md bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center flex-shrink-0">
            <PlusSquare className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <span>Ouvrir dans un nouvel onglet</span>
        </button>

        <button
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          onClick={() => { window.open(href, '_blank', 'noopener,noreferrer'); onClose(); }}
        >
          <div className="h-6 w-6 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
            <ExternalLink className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
          </div>
          <span>Ouvrir dans le navigateur</span>
        </button>
      </div>
    </div>,
    document.body
  );
};

export default SidebarContextMenu;
