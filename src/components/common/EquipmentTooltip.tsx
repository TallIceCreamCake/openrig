import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Package } from 'lucide-react';

export interface EquipmentTooltipData {
  name: string;
  type?: string | null;
  subtype?: string | null;
  price?: number | null;
  imageUrl?: string | null;
}

interface Props {
  data: EquipmentTooltipData;
  anchorX: number;
  anchorY: number;
}

const TOOLTIP_W = 220;
const TOOLTIP_H = 72;

const EquipmentTooltip: React.FC<Props> = ({ data, anchorX, anchorY }) => {
  const ref = useRef<HTMLDivElement>(null);

  // Adjust position to stay in viewport
  const x = anchorX + 14 + TOOLTIP_W > window.innerWidth ? anchorX - TOOLTIP_W - 8 : anchorX + 14;
  const y = Math.min(anchorY - TOOLTIP_H / 2, window.innerHeight - TOOLTIP_H - 8);

  return createPortal(
    <div
      ref={ref}
      style={{ top: y, left: x, width: TOOLTIP_W }}
      className="fixed z-[12070] pointer-events-none"
    >
      <div className="flex gap-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-2 items-center">
        {/* Image */}
        <div className="flex-shrink-0 h-12 w-12 rounded-md bg-gray-100 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
          {data.imageUrl ? (
            <img
              src={data.imageUrl}
              alt={data.name}
              className="h-full w-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <Package className="h-5 w-5 text-gray-300 dark:text-gray-600" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight">
            {data.name}
          </div>
          {(data.type || data.subtype) && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate leading-snug mt-0.5">
              {[data.type, data.subtype].filter(Boolean).join(' › ')}
            </div>
          )}
          {typeof data.price === 'number' && data.price > 0 && (
            <div className="text-[10px] font-medium text-blue-600 dark:text-blue-400 mt-0.5 tabular-nums">
              {data.price.toFixed(0)} €/j
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

/** Hook — manages hover delay + tooltip visibility, anchored to element rect */
export function useEquipmentTooltip() {
  const [tooltip, setTooltip] = useState<(EquipmentTooltipData & { x: number; y: number }) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef = useRef<Record<string, Partial<EquipmentTooltipData>>>({});

  const clear = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTooltip(null);
  };

  const trigger = (
    e: React.MouseEvent,
    initial: EquipmentTooltipData,
    /** Optional async fetcher to enrich data (e.g. image_url, subtype) */
    enrich?: () => Promise<Partial<EquipmentTooltipData>>,
  ) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Anchor to the element's bounding rect, not the mouse cursor
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = rect.right;
    const y = rect.top + rect.height / 2;

    // Start enrichment in background immediately so data is ready after delay
    let enriched: Partial<EquipmentTooltipData> = {};
    const enrichPromise = enrich ? enrich().then((d) => { enriched = d; }) : Promise.resolve();

    timerRef.current = setTimeout(async () => {
      await enrichPromise;
      setTooltip({ ...initial, ...enriched, x, y });
    }, 600);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { tooltip, trigger, clear, cacheRef };
}

export default EquipmentTooltip;
