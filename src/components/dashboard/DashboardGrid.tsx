import React, { useEffect, useState } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { Link2, Link2Off, Pencil, X, ChevronDown, Check } from 'lucide-react';
import { createPortal } from 'react-dom';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { DashboardWidget, WidgetLayout, DashboardWidgetOptions } from '../../types/dashboard';
import { useTranslation } from '../../context/TranslationContext';
import { ColorPickerButton } from '../ui-kit';
import { QUICK_ACTION_GROUPS, QUICK_ACTIONS_BY_ID, DEFAULT_QUICK_ACTION_IDS } from '../../constants/quickActions';

const ResponsiveGridLayout = WidthProvider(Responsive);
const DEFAULT_CALENDAR_OPTIONS = {
  days: 1 as 1 | 2,
  showRentals: true,
  showLogistics: true,
  showMaintenance: true,
  showManual: true,
  showCurrentTimeLine: true,
  showSecondaryText: true,
  density: 'comfortable' as 'comfortable' | 'compact',
};
const DEFAULT_CLOCK_OPTIONS = {
  showSeconds: false,
  showYear: true,
  dateFormat: 'long' as 'long' | 'numeric',
  timeFormat: 'auto' as 'auto' | '24h' | '12h',
  autoSize: true,
  sizePercent: 85,
  timeSizePercent: 100,
  dateSizePercent: 100,
  datePosition: 'top' as 'top' | 'bottom',
  timeColor: '#111827',
  dateColor: '#4b5563',
  colorsLinked: false,
};
const DEFAULT_UPCOMING_RENTALS_OPTIONS = {
  showClient: true,
  showDate: true,
  showLocation: true,
  showEquipmentCount: true,
  showStatus: true,
  limit: 5,
};

interface DashboardGridProps {
  widgets: DashboardWidget[];
  activeWidgetIds: string[];
  layouts: { [key: string]: WidgetLayout[] };
  onLayoutChange: (layout: WidgetLayout[], layouts: { [key: string]: WidgetLayout[] }) => void;
  isEditing: boolean;
  onRemoveWidget: (widgetId: string) => void;
  widgetOptions?: DashboardWidgetOptions;
  onWidgetOptionsChange?: (widgetId: string, options: Record<string, unknown>) => void;
}

const DashboardGrid: React.FC<DashboardGridProps> = ({
  widgets,
  activeWidgetIds,
  layouts,
  onLayoutChange,
  isEditing,
  onRemoveWidget,
  widgetOptions,
  onWidgetOptionsChange,
}) => {
  const { t } = useTranslation();
  const [optionsWidgetId, setOptionsWidgetId] = useState<string | null>(null);
  const [expandedActionGroups, setExpandedActionGroups] = useState<Record<string, boolean>>({});

  const toggleActionGroup = (groupId: string) => {
    setExpandedActionGroups((prev) => ({ ...prev, [groupId]: !(prev[groupId] ?? true) }));
  };

  useEffect(() => {
    if (!isEditing) {
      setOptionsWidgetId(null);
    }
  }, [isEditing]);

  useEffect(() => {
    if (!optionsWidgetId) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOptionsWidgetId(null);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [optionsWidgetId]);

  // Filter widgets to only show active ones
  const activeWidgets = widgets.filter(widget => activeWidgetIds.includes(widget.id));
  const widgetById = new Map(activeWidgets.map((widget) => [widget.id, widget] as const));
  
  // Ensure layouts exist for all active widgets
  const currentLayouts = layouts.lg || [];
  const validLayouts = currentLayouts
    .filter(layout => activeWidgetIds.includes(layout.i))
    .map((layout) => {
      const widget = widgetById.get(layout.i);
      if (!widget) return layout;
      return {
        ...layout,
        minW: widget.defaultLayout.minW ?? layout.minW,
        minH: widget.defaultLayout.minH ?? layout.minH,
        maxW: widget.id === 'calendar'
          ? widget.defaultLayout.maxW
          : (widget.defaultLayout.maxW ?? layout.maxW),
        maxH: widget.id === 'calendar'
          ? widget.defaultLayout.maxH
          : (widget.defaultLayout.maxH ?? layout.maxH),
      };
    });

  // Add missing layouts for new widgets
  const missingWidgets = activeWidgets.filter(widget => 
    !validLayouts.find(layout => layout.i === widget.id)
  );

  missingWidgets.forEach(widget => {
    const maxY = validLayouts.length > 0 
      ? Math.max(...validLayouts.map(l => l.y + l.h))
      : 0;
    
    validLayouts.push({
      i: widget.id,
      x: 0,
      y: maxY,
      w: widget.defaultLayout.w,
      h: widget.defaultLayout.h,
      minW: widget.defaultLayout.minW,
      minH: widget.defaultLayout.minH,
      maxW: widget.defaultLayout.maxW,
      maxH: widget.defaultLayout.maxH,
    });
  });

  const finalLayouts = {
    lg: validLayouts,
    md: validLayouts,
    sm: validLayouts.map(l => ({ ...l, w: Math.min(l.w, 6) })),
    xs: validLayouts.map(l => ({ ...l, w: Math.min(l.w, 4) })),
    xxs: validLayouts.map(l => ({ ...l, w: 2 })),
  };
  const optionsWidget = activeWidgets.find((widget) => widget.id === optionsWidgetId) || null;
  const calendarOptions = {
    ...DEFAULT_CALENDAR_OPTIONS,
    ...(widgetOptions?.calendar || {}),
    days: widgetOptions?.calendar?.days === 2 ? 2 : 1,
    density: widgetOptions?.calendar?.density === 'compact' ? 'compact' : 'comfortable',
  };
  const calendarDays = calendarOptions.days;
  const applyCalendarOptions = (nextOptions: Record<string, unknown>) => {
    onWidgetOptionsChange?.('calendar', nextOptions);
  };
  const clockOptions = {
    ...DEFAULT_CLOCK_OPTIONS,
    ...(widgetOptions?.clock || {}),
    dateFormat: widgetOptions?.clock?.dateFormat === 'numeric' ? 'numeric' : 'long',
    timeFormat: widgetOptions?.clock?.timeFormat === '12h' || widgetOptions?.clock?.timeFormat === '24h'
      ? widgetOptions.clock.timeFormat
      : 'auto',
    autoSize: typeof widgetOptions?.clock?.autoSize === 'boolean' ? widgetOptions.clock.autoSize : true,
    sizePercent: typeof widgetOptions?.clock?.sizePercent === 'number'
      ? Math.max(50, Math.min(100, Math.round(widgetOptions.clock.sizePercent)))
      : 85,
    timeSizePercent: typeof widgetOptions?.clock?.timeSizePercent === 'number'
      ? Math.max(50, Math.min(150, Math.round(widgetOptions.clock.timeSizePercent)))
      : 100,
    dateSizePercent: typeof widgetOptions?.clock?.dateSizePercent === 'number'
      ? Math.max(50, Math.min(150, Math.round(widgetOptions.clock.dateSizePercent)))
      : 100,
    datePosition: widgetOptions?.clock?.datePosition === 'bottom' ? 'bottom' : 'top',
    timeColor: typeof widgetOptions?.clock?.timeColor === 'string' ? widgetOptions.clock.timeColor : '#111827',
    dateColor: typeof widgetOptions?.clock?.dateColor === 'string' ? widgetOptions.clock.dateColor : '#4b5563',
    colorsLinked: typeof widgetOptions?.clock?.colorsLinked === 'boolean' ? widgetOptions.clock.colorsLinked : false,
  };
  const applyClockOptions = (nextOptions: Record<string, unknown>) => {
    onWidgetOptionsChange?.('clock-date', nextOptions);
  };
  const upcomingRentalsOptions = {
    ...DEFAULT_UPCOMING_RENTALS_OPTIONS,
    ...(widgetOptions?.upcomingRentals || {}),
    showClient: typeof widgetOptions?.upcomingRentals?.showClient === 'boolean'
      ? widgetOptions.upcomingRentals.showClient
      : DEFAULT_UPCOMING_RENTALS_OPTIONS.showClient,
    showDate: typeof widgetOptions?.upcomingRentals?.showDate === 'boolean'
      ? widgetOptions.upcomingRentals.showDate
      : DEFAULT_UPCOMING_RENTALS_OPTIONS.showDate,
    showLocation: typeof widgetOptions?.upcomingRentals?.showLocation === 'boolean'
      ? widgetOptions.upcomingRentals.showLocation
      : DEFAULT_UPCOMING_RENTALS_OPTIONS.showLocation,
    showEquipmentCount: typeof widgetOptions?.upcomingRentals?.showEquipmentCount === 'boolean'
      ? widgetOptions.upcomingRentals.showEquipmentCount
      : DEFAULT_UPCOMING_RENTALS_OPTIONS.showEquipmentCount,
    showStatus: typeof widgetOptions?.upcomingRentals?.showStatus === 'boolean'
      ? widgetOptions.upcomingRentals.showStatus
      : DEFAULT_UPCOMING_RENTALS_OPTIONS.showStatus,
    limit: typeof widgetOptions?.upcomingRentals?.limit === 'number'
      ? Math.max(3, Math.min(10, Math.round(widgetOptions.upcomingRentals.limit)))
      : DEFAULT_UPCOMING_RENTALS_OPTIONS.limit,
    sortOrder: (['start_asc', 'start_desc', 'client_asc', 'client_desc'] as const).includes(
      widgetOptions?.upcomingRentals?.sortOrder as never,
    )
      ? widgetOptions!.upcomingRentals!.sortOrder!
      : ('start_asc' as const),
  };
  const applyUpcomingRentalsOptions = (nextOptions: Record<string, unknown>) => {
    onWidgetOptionsChange?.('upcoming-rentals', nextOptions);
  };
  const quickActionsSelectedIds = Array.isArray(widgetOptions?.quickActions?.actionIds)
    ? widgetOptions!.quickActions!.actionIds!.filter((id) => Boolean(QUICK_ACTIONS_BY_ID[id]))
    : DEFAULT_QUICK_ACTION_IDS;
  const quickActionsColumns = ([2, 3, 4, 5] as const).includes(widgetOptions?.quickActions?.columns as never)
    ? widgetOptions!.quickActions!.columns!
    : 'auto';
  const applyQuickActionsOptions = (nextOptions: Record<string, unknown>) => {
    onWidgetOptionsChange?.('quick-actions', nextOptions);
  };
  const toggleQuickAction = (actionId: string) => {
    const isSelected = quickActionsSelectedIds.includes(actionId);
    const nextIds = isSelected
      ? quickActionsSelectedIds.filter((id) => id !== actionId)
      : [...quickActionsSelectedIds, actionId];
    applyQuickActionsOptions({ actionIds: nextIds });
  };
  const finance = widgetOptions?.finance || {};
  const financeOptions = {
    period: finance.period === '6m' || finance.period === 'ytd' ? finance.period : '12m',
    chartType: finance.chartType === 'line' || finance.chartType === 'bar' ? finance.chartType : 'area',
    showInvoiced: finance.showInvoiced !== false,
    showCollected: finance.showCollected !== false,
    showKpiInvoiced: finance.showKpiInvoiced !== false,
    showKpiCollected: finance.showKpiCollected !== false,
    showKpiOutstanding: finance.showKpiOutstanding !== false,
    showKpiOverdue: finance.showKpiOverdue !== false,
    showOverdueList: finance.showOverdueList !== false,
  };
  const applyFinanceOptions = (nextOptions: Record<string, unknown>) => {
    onWidgetOptionsChange?.('finance', nextOptions);
  };
  const optionsModalContent = optionsWidgetId ? (
    <div className="fixed inset-0 z-[12000] overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 py-6 text-center sm:p-0">
        <button
          type="button"
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={() => setOptionsWidgetId(null)}
          aria-label={t('common.close')}
        />

        <div className="relative inline-block w-full max-w-lg transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Options du widget</h3>
              <p className="text-sm text-gray-500">{optionsWidget?.title}</p>
            </div>
            <button
              type="button"
              onClick={() => setOptionsWidgetId(null)}
              className="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-100"
              aria-label={t('common.close')}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
            {optionsWidgetId === 'calendar' && onWidgetOptionsChange ? (
              <>
                <section className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-700">Période affichée</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => applyCalendarOptions({ days: 1 })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        calendarDays === 1
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      1 jour
                    </button>
                    <button
                      type="button"
                      onClick={() => applyCalendarOptions({ days: 2 })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        calendarDays === 2
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      2 jours
                    </button>
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-700">Événements à afficher</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => applyCalendarOptions({ showRentals: !calendarOptions.showRentals })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        calendarOptions.showRentals
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Projets
                    </button>
                    <button
                      type="button"
                      onClick={() => applyCalendarOptions({ showLogistics: !calendarOptions.showLogistics })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        calendarOptions.showLogistics
                          ? 'border-sky-500 bg-sky-50 text-sky-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Logistique
                    </button>
                    <button
                      type="button"
                      onClick={() => applyCalendarOptions({ showMaintenance: !calendarOptions.showMaintenance })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        calendarOptions.showMaintenance
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Maintenance
                    </button>
                    <button
                      type="button"
                      onClick={() => applyCalendarOptions({ showManual: !calendarOptions.showManual })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        calendarOptions.showManual
                          ? 'border-slate-500 bg-slate-100 text-slate-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Événements
                    </button>
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-700">Affichage visuel</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => applyCalendarOptions({ showCurrentTimeLine: !calendarOptions.showCurrentTimeLine })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        calendarOptions.showCurrentTimeLine
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Ligne actuelle
                    </button>
                    <button
                      type="button"
                      onClick={() => applyCalendarOptions({ showSecondaryText: !calendarOptions.showSecondaryText })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        calendarOptions.showSecondaryText
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Détails
                    </button>
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-700">Densité</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => applyCalendarOptions({ density: 'comfortable' })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        calendarOptions.density === 'comfortable'
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Confort
                    </button>
                    <button
                      type="button"
                      onClick={() => applyCalendarOptions({ density: 'compact' })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        calendarOptions.density === 'compact'
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Compact
                    </button>
                  </div>
                </section>
              </>
            ) : optionsWidgetId === 'clock-date' && onWidgetOptionsChange ? (
              <>
                <section className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-700">Affichage horaire</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => applyClockOptions({ timeFormat: 'auto' })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        clockOptions.timeFormat === 'auto'
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Auto
                    </button>
                    <button
                      type="button"
                      onClick={() => applyClockOptions({ timeFormat: '24h' })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        clockOptions.timeFormat === '24h'
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      24h
                    </button>
                    <button
                      type="button"
                      onClick={() => applyClockOptions({ timeFormat: '12h' })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        clockOptions.timeFormat === '12h'
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      12h
                    </button>
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-700">Format de date</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => applyClockOptions({ dateFormat: 'long' })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        clockOptions.dateFormat === 'long'
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Manuscrite
                    </button>
                    <button
                      type="button"
                      onClick={() => applyClockOptions({ dateFormat: 'numeric' })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        clockOptions.dateFormat === 'numeric'
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      XX/XX/XXXX
                    </button>
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-700">Position de la date</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => applyClockOptions({ datePosition: 'top' })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        clockOptions.datePosition === 'top'
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Date en haut
                    </button>
                    <button
                      type="button"
                      onClick={() => applyClockOptions({ datePosition: 'bottom' })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        clockOptions.datePosition === 'bottom'
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Date en bas
                    </button>
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-700">Couleurs</p>
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-gray-500">Lier les couleurs</span>
                      <button
                        type="button"
                        onClick={() => applyClockOptions({ colorsLinked: !clockOptions.colorsLinked })}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${
                          clockOptions.colorsLinked
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                        title={clockOptions.colorsLinked ? 'Délier couleurs heure/date' : 'Lier couleurs heure/date'}
                      >
                        {clockOptions.colorsLinked ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-xs text-gray-500">Heure</span>
                        <div className="flex items-center gap-2">
                          <ColorPickerButton
                            value={clockOptions.timeColor}
                            onChange={(value) => applyClockOptions(
                              clockOptions.colorsLinked
                                ? { timeColor: value, dateColor: value }
                                : { timeColor: value },
                            )}
                            size="sm"
                            ariaLabel="Couleur de l'heure"
                          />
                          <input
                            type="text"
                            value={clockOptions.timeColor}
                            onChange={(event) => applyClockOptions(
                              clockOptions.colorsLinked
                                ? { timeColor: event.target.value, dateColor: event.target.value }
                                : { timeColor: event.target.value },
                            )}
                            className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-gray-500">Date</span>
                        <div className="flex items-center gap-2">
                          <ColorPickerButton
                            value={clockOptions.colorsLinked ? clockOptions.timeColor : clockOptions.dateColor}
                            onChange={(value) => applyClockOptions(
                              clockOptions.colorsLinked
                                ? { timeColor: value, dateColor: value }
                                : { dateColor: value },
                            )}
                            size="sm"
                            ariaLabel="Couleur de la date"
                            className={clockOptions.colorsLinked ? 'opacity-70' : ''}
                          />
                          <input
                            type="text"
                            value={clockOptions.colorsLinked ? clockOptions.timeColor : clockOptions.dateColor}
                            onChange={(event) => applyClockOptions(
                              clockOptions.colorsLinked
                                ? { timeColor: event.target.value, dateColor: event.target.value }
                                : { dateColor: event.target.value },
                            )}
                            className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700"
                            disabled={clockOptions.colorsLinked}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-700">Éléments affichés</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => applyClockOptions({ showSeconds: !clockOptions.showSeconds })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        clockOptions.showSeconds
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Secondes
                    </button>
                    <button
                      type="button"
                      onClick={() => applyClockOptions({ showYear: !clockOptions.showYear })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        clockOptions.showYear
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Année
                    </button>
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-gray-700">Taille</p>
                    <div className="inline-flex rounded-md border border-gray-300 p-0.5">
                      <button
                        type="button"
                        onClick={() => applyClockOptions({ autoSize: true })}
                        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                          clockOptions.autoSize
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Auto
                      </button>
                      <button
                        type="button"
                        onClick={() => applyClockOptions({ autoSize: false })}
                        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                          !clockOptions.autoSize
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Manuel
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Taille globale</span>
                      <span>{clockOptions.autoSize ? 'Auto (max)' : `${clockOptions.sizePercent}%`}</span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={100}
                      step={1}
                      value={clockOptions.sizePercent}
                      onChange={(event) => applyClockOptions({ sizePercent: Number(event.target.value) })}
                      disabled={clockOptions.autoSize}
                      className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                    />

                    <div className="pt-1">
                      <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                        <span>Taille heure</span>
                        <span>{clockOptions.autoSize ? 'Auto' : `${clockOptions.timeSizePercent}%`}</span>
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={150}
                        step={1}
                        value={clockOptions.timeSizePercent}
                        onChange={(event) => applyClockOptions({ timeSizePercent: Number(event.target.value) })}
                        disabled={clockOptions.autoSize}
                        className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>

                    <div className="pt-1">
                      <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                        <span>Taille date</span>
                        <span>{clockOptions.autoSize ? 'Auto' : `${clockOptions.dateSizePercent}%`}</span>
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={150}
                        step={1}
                        value={clockOptions.dateSizePercent}
                        onChange={(event) => applyClockOptions({ dateSizePercent: Number(event.target.value) })}
                        disabled={clockOptions.autoSize}
                        className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                  </div>
                </section>
              </>
            ) : optionsWidgetId === 'upcoming-rentals' && onWidgetOptionsChange ? (
              <>
                <section className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-700">Détails affichés</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => applyUpcomingRentalsOptions({ showClient: !upcomingRentalsOptions.showClient })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        upcomingRentalsOptions.showClient
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Client
                    </button>
                    <button
                      type="button"
                      onClick={() => applyUpcomingRentalsOptions({ showDate: !upcomingRentalsOptions.showDate })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        upcomingRentalsOptions.showDate
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Date
                    </button>
                    <button
                      type="button"
                      onClick={() => applyUpcomingRentalsOptions({ showLocation: !upcomingRentalsOptions.showLocation })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        upcomingRentalsOptions.showLocation
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Lieu
                    </button>
                    <button
                      type="button"
                      onClick={() => applyUpcomingRentalsOptions({ showEquipmentCount: !upcomingRentalsOptions.showEquipmentCount })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        upcomingRentalsOptions.showEquipmentCount
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Équipements
                    </button>
                    <button
                      type="button"
                      onClick={() => applyUpcomingRentalsOptions({ showStatus: !upcomingRentalsOptions.showStatus })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        upcomingRentalsOptions.showStatus
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Statut
                    </button>
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between text-sm font-medium text-gray-700">
                    <span>Nombre de projets affichés</span>
                    <span className="text-xs text-gray-500">{upcomingRentalsOptions.limit}</span>
                  </div>
                  <div className="mt-3">
                    <input
                      type="range"
                      min={3}
                      max={10}
                      step={1}
                      value={upcomingRentalsOptions.limit}
                      onChange={(event) => applyUpcomingRentalsOptions({ limit: Number(event.target.value) })}
                      className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200"
                    />
                    <div className="mt-1 flex justify-between text-[11px] text-gray-400">
                      <span>3</span>
                      <span>10</span>
                    </div>
                  </div>
                </section>
              </>
            ) : optionsWidgetId === 'quick-actions' && onWidgetOptionsChange ? (
              <>
                <section className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-700">Colonnes</p>
                  <div className="mt-2 grid grid-cols-5 gap-2">
                    {(['auto', 2, 3, 4, 5] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => applyQuickActionsOptions({ columns: value })}
                        className={`rounded-md border px-2 py-2 text-sm font-medium transition-colors ${
                          quickActionsColumns === value
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {value === 'auto' ? 'Auto' : value}
                      </button>
                    ))}
                  </div>
                </section>

                <p className="px-1 text-xs text-gray-500">
                  {quickActionsSelectedIds.length} raccourci{quickActionsSelectedIds.length > 1 ? 's' : ''} sélectionné{quickActionsSelectedIds.length > 1 ? 's' : ''}
                </p>

                {QUICK_ACTION_GROUPS.map((group) => {
                  const isOpen = expandedActionGroups[group.id] ?? true;
                  const selectedCount = group.actions.filter((action) => quickActionsSelectedIds.includes(action.id)).length;
                  return (
                    <section key={group.id} className="overflow-hidden rounded-lg border border-gray-200">
                      <button
                        type="button"
                        onClick={() => toggleActionGroup(group.id)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center justify-between gap-2 bg-gray-50 px-3 py-2.5 text-left transition-colors hover:bg-gray-100"
                      >
                        <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                          {group.label}
                          {selectedCount > 0 && (
                            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                              {selectedCount}
                            </span>
                          )}
                        </span>
                        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                      </button>
                      {isOpen && (
                        <div className="grid grid-cols-1 gap-1.5 p-2 sm:grid-cols-2">
                          {group.actions.map((action) => {
                            const Icon = action.icon;
                            const selected = quickActionsSelectedIds.includes(action.id);
                            return (
                              <button
                                key={action.id}
                                type="button"
                                onClick={() => toggleQuickAction(action.id)}
                                className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                                  selected
                                    ? 'border-blue-300 bg-blue-50'
                                    : 'border-gray-200 bg-white hover:bg-gray-50'
                                }`}
                              >
                                <span className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg ${action.tone}`}>
                                  <Icon className="h-4 w-4" />
                                </span>
                                <span className="flex-1 truncate text-sm text-gray-700">{action.label}</span>
                                <span
                                  className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-md border transition-colors ${
                                    selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-transparent'
                                  }`}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}
              </>
            ) : optionsWidgetId === 'finance' && onWidgetOptionsChange ? (
              <>
                <section className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-700">Période</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {([['6m', '6 mois'], ['12m', '12 mois'], ['ytd', 'Année']] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => applyFinanceOptions({ period: value })}
                        className={`rounded-md border px-2 py-2 text-sm font-medium transition-colors ${
                          financeOptions.period === value
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-700">Type de graphique</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {([['area', 'Aires'], ['line', 'Lignes'], ['bar', 'Barres']] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => applyFinanceOptions({ chartType: value })}
                        className={`rounded-md border px-2 py-2 text-sm font-medium transition-colors ${
                          financeOptions.chartType === value
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-700">Courbes affichées</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {([['showInvoiced', 'Facturé'], ['showCollected', 'Encaissé']] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => applyFinanceOptions({ [key]: !financeOptions[key] })}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                          financeOptions[key]
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-700">Indicateurs</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {([
                      ['showKpiInvoiced', 'Facturé'],
                      ['showKpiCollected', 'Encaissé'],
                      ['showKpiOutstanding', 'En attente'],
                      ['showKpiOverdue', 'En retard'],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => applyFinanceOptions({ [key]: !financeOptions[key] })}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                          financeOptions[key]
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-gray-700">Liste des factures en retard</p>
                    <button
                      type="button"
                      onClick={() => applyFinanceOptions({ showOverdueList: !financeOptions.showOverdueList })}
                      className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                        financeOptions.showOverdueList
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {financeOptions.showOverdueList ? 'Affichée' : 'Masquée'}
                    </button>
                  </div>
                </section>
              </>
            ) : (
              <p className="text-sm text-gray-500">Aucune option disponible pour ce widget.</p>
            )}
          </div>

          <div className="flex justify-end border-t border-gray-200 px-5 py-3">
            <button
              type="button"
              onClick={() => setOptionsWidgetId(null)}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="relative">
      <ResponsiveGridLayout
        className="layout dashboard-grid"
        layouts={finalLayouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={60}
        isDraggable={isEditing}
        isResizable={isEditing}
        onLayoutChange={onLayoutChange}
        margin={[16, 16]}
        containerPadding={[0, 0]}
        compactType="vertical"
        preventCollision={false}
        useCSSTransforms={true}
        draggableCancel=".dashboard-widget-action"
      >
        {activeWidgets.map((widget) => {
          const WidgetComponent = widget.component;
          const canConfigure = (widget.id === 'calendar' || widget.id === 'clock-date' || widget.id === 'upcoming-rentals' || widget.id === 'quick-actions' || widget.id === 'finance') && Boolean(onWidgetOptionsChange);
          return (
            <div
              key={widget.id}
              className={`dashboard-card overflow-hidden flex flex-col ${
                isEditing ? 'dashboard-card-editing cursor-move' : ''
              }`}
            >
              {/* Widget Header */}
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 min-w-0">
                  <span className="dashboard-card-title-tick h-3.5 w-1 rounded-full flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{widget.title}</span>
                </h3>
                {widget.id === 'upcoming-rentals' && !isEditing && onWidgetOptionsChange && (
                  <label className="dashboard-widget-action inline-flex items-center gap-1.5 text-xs text-gray-500 flex-shrink-0">
                    <span className="hidden sm:inline">{t('dashboard.widgets.upcomingRentals.sort.label')}</span>
                    <select
                      value={upcomingRentalsOptions.sortOrder}
                      onChange={(event) => applyUpcomingRentalsOptions({ sortOrder: event.target.value })}
                      className="h-7 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 outline-none transition-colors focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="start_asc">{t('dashboard.widgets.upcomingRentals.sort.startAsc')}</option>
                      <option value="start_desc">{t('dashboard.widgets.upcomingRentals.sort.startDesc')}</option>
                      <option value="client_asc">{t('dashboard.widgets.upcomingRentals.sort.clientAsc')}</option>
                      <option value="client_desc">{t('dashboard.widgets.upcomingRentals.sort.clientDesc')}</option>
                    </select>
                  </label>
                )}
                {isEditing && (
                  <div className="relative flex items-center gap-1 flex-shrink-0">
                    {canConfigure && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOptionsWidgetId(widget.id);
                        }}
                        className="dashboard-widget-action p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Configurer le widget"
                        aria-label="Configurer le widget"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveWidget(widget.id);
                      }}
                      className="dashboard-widget-action p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title={t('dashboard.grid.removeWidget')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              
              {/* Widget Content */}
              <div className="flex-1 overflow-hidden">
                <WidgetComponent {...(widget.props || {})} />
              </div>
            </div>
          );
        })}
      </ResponsiveGridLayout>

      {optionsModalContent && typeof document !== 'undefined' ? createPortal(optionsModalContent, document.body) : null}
    </div>
  );
};

export default DashboardGrid;
