import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ClockWidgetOptions } from '../../../types/dashboard';
import { useTranslation } from '../../../context/TranslationContext';

interface ClockDateWidgetProps {
  options?: ClockWidgetOptions;
}

const DEFAULT_OPTIONS: Required<ClockWidgetOptions> = {
  showSeconds: false,
  showYear: true,
  dateFormat: 'long',
  timeFormat: 'auto',
  autoSize: true,
  sizePercent: 85,
  timeSizePercent: 100,
  dateSizePercent: 100,
  datePosition: 'top',
  timeColor: '#111827',
  dateColor: '#4b5563',
  colorsLinked: false,
};

const normalizeHexColor = (value: string | undefined, fallback: string) => {
  if (!value) return fallback;
  const raw = value.trim();
  const normalized = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized) ? normalized : fallback;
};

const ClockDateWidget: React.FC<ClockDateWidgetProps> = ({ options }) => {
  const { language } = useTranslation();
  const region = language === 'en' ? 'en-US' : 'fr-FR';
  const [now, setNow] = useState(() => new Date());
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [wrapperSize, setWrapperSize] = useState({ width: 0, height: 0 });

  const resolvedOptions = useMemo(
    () => ({
      ...DEFAULT_OPTIONS,
      ...(options || {}),
      dateFormat: options?.dateFormat === 'numeric' ? 'numeric' : 'long',
      timeFormat: options?.timeFormat === '12h' || options?.timeFormat === '24h' ? options.timeFormat : 'auto',
      autoSize: typeof options?.autoSize === 'boolean' ? options.autoSize : true,
      sizePercent: typeof options?.sizePercent === 'number'
        ? Math.max(50, Math.min(100, options.sizePercent))
        : 85,
      timeSizePercent: typeof options?.timeSizePercent === 'number'
        ? Math.max(50, Math.min(150, options.timeSizePercent))
        : 100,
      dateSizePercent: typeof options?.dateSizePercent === 'number'
        ? Math.max(50, Math.min(150, options.dateSizePercent))
        : 100,
      datePosition: options?.datePosition === 'bottom' ? 'bottom' : 'top',
      timeColor: normalizeHexColor(options?.timeColor, '#111827'),
      dateColor: normalizeHexColor(options?.dateColor, '#4b5563'),
      colorsLinked: typeof options?.colorsLinked === 'boolean' ? options.colorsLinked : false,
    }),
    [options],
  );

  useEffect(() => {
    const tickMs = resolvedOptions.showSeconds ? 1000 : 15000;
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, tickMs);
    return () => window.clearInterval(interval);
  }, [resolvedOptions.showSeconds]);

  useEffect(() => {
    const container = wrapperRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setWrapperSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const hour12 =
    resolvedOptions.timeFormat === '12h'
      ? true
      : resolvedOptions.timeFormat === '24h'
        ? false
        : undefined;

  const timeText = new Intl.DateTimeFormat(region, {
    hour: '2-digit',
    minute: '2-digit',
    second: resolvedOptions.showSeconds ? '2-digit' : undefined,
    hour12,
  }).format(now);

  const dateTextRaw = new Intl.DateTimeFormat(region, {
    weekday: resolvedOptions.dateFormat === 'long' ? 'long' : undefined,
    day: '2-digit',
    month: resolvedOptions.dateFormat === 'long' ? 'long' : '2-digit',
    year: resolvedOptions.showYear ? 'numeric' : undefined,
  }).format(now);

  const dateText = language === 'fr'
    ? dateTextRaw.charAt(0).toUpperCase() + dateTextRaw.slice(1)
    : dateTextRaw;

  const horizontalPadding = 32;
  const verticalPadding = 32;
  const usableWidth = Math.max(120, wrapperSize.width - horizontalPadding);
  const usableHeight = Math.max(120, wrapperSize.height - verticalPadding);
  const estimatedTimeChars = resolvedOptions.showSeconds ? 8 : 5;
  const maxFromWidth = usableWidth / (estimatedTimeChars * 0.56);
  const maxFromHeight = usableHeight * 0.58;
  const autoTimeFontSize = Math.max(28, Math.min(160, Math.min(maxFromWidth, maxFromHeight)));
  const scaleFactor = resolvedOptions.autoSize ? 1 : (resolvedOptions.sizePercent / 100);
  const timeScale = resolvedOptions.autoSize ? 1 : (resolvedOptions.timeSizePercent / 100);
  const dateScale = resolvedOptions.autoSize ? 1 : (resolvedOptions.dateSizePercent / 100);
  const timeFontSize = Math.max(20, autoTimeFontSize * scaleFactor * timeScale);
  const baseDateFontSize = autoTimeFontSize * 0.33;
  const dateFontSize = Math.max(12, Math.min(72, baseDateFontSize * scaleFactor * dateScale));

  const resolvedTimeColor = normalizeHexColor(resolvedOptions.timeColor, '#111827');
  const resolvedDateColor = resolvedOptions.colorsLinked
    ? resolvedTimeColor
    : normalizeHexColor(resolvedOptions.dateColor, '#4b5563');

  return (
    <div ref={wrapperRef} className="h-full p-4">
      <div className="flex h-full flex-col items-center justify-center text-center leading-none">
        {resolvedOptions.datePosition === 'top' && (
          <p className="mb-3 font-medium" style={{ fontSize: `${dateFontSize}px`, color: resolvedDateColor }}>
            {dateText}
          </p>
        )}
        <p className="font-semibold tracking-tight tabular-nums" style={{ fontSize: `${timeFontSize}px`, color: resolvedTimeColor }}>
          {timeText}
        </p>
        {resolvedOptions.datePosition === 'bottom' && (
          <p className="mt-3 font-medium" style={{ fontSize: `${dateFontSize}px`, color: resolvedDateColor }}>
            {dateText}
          </p>
        )}
      </div>
    </div>
  );
};

export default ClockDateWidget;
