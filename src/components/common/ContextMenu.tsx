import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import CompactColorPicker from './CompactColorPicker';

export interface ContextMenuAction {
  type?: 'action';
  label: string;
  icon?: React.ReactNode;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface ContextMenuColors {
  type: 'colors';
  label: string;
  colors: string[];
  current?: string | null;
  onSelect: (color: string) => void;
}

export interface ContextMenuSeparator {
  type: 'separator';
}

export type ContextMenuItemDef = ContextMenuAction | ContextMenuColors | ContextMenuSeparator;

interface Props {
  x: number;
  y: number;
  items: ContextMenuItemDef[];
  onClose: () => void;
}

const ContextMenu: React.FC<Props> = ({ x, y, items, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  // Adjust to stay inside viewport
  const menuW = 200;
  const menuH = items.length * 32 + 16;
  const adjX = x + menuW > window.innerWidth ? x - menuW : x;
  const adjY = y + menuH > window.innerHeight ? Math.max(4, y - menuH) : y;

  return createPortal(
    <div
      ref={ref}
      style={{ top: adjY, left: adjX }}
      className="fixed z-[9999] min-w-[190px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl py-1 select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.type === 'separator') {
          return <div key={i} className="my-1 border-t border-gray-100 dark:border-gray-800" />;
        }

        if (item.type === 'colors') {
          return (
            <div key={i} className="px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                {item.label}
              </div>
              <div className="flex gap-1.5 flex-wrap items-center">
                {item.colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => { item.onSelect(color); onClose(); }}
                    className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none ${
                      item.current === color
                        ? 'border-gray-700 dark:border-gray-200 scale-110'
                        : 'border-transparent hover:border-gray-400'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
                <CompactColorPicker
                  value={item.current || '#6B7280'}
                  onChange={(color) => { item.onSelect(color); onClose(); }}
                />
              </div>
            </div>
          );
        }

        return (
          <button
            key={i}
            onClick={() => { if (!item.disabled) { item.action(); onClose(); } }}
            disabled={item.disabled}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors ${
              item.disabled
                ? 'opacity-40 cursor-default text-gray-500 dark:text-gray-400'
                : item.danger
                ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {item.icon && <span className="h-4 w-4 flex-shrink-0 flex items-center justify-center">{item.icon}</span>}
            {item.label}
          </button>
        );
      })}
    </div>,
    document.body,
  );
};

export default ContextMenu;
