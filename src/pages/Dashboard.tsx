import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings, RotateCcw, ClipboardList, Package, Calendar as CalIcon, Boxes, Users, Building2, Wrench, Plus, Check } from 'lucide-react';
import Button from '../components/ui/Button';
import { Link } from 'react-router-dom';
import DashboardGrid from '../components/dashboard/DashboardGrid';
import AddWidgetModal from '../components/dashboard/AddWidgetModal';
import DayCalendarWidget from '../components/dashboard/widgets/DayCalendarWidget';
import PendingRentalsWidget from '../components/dashboard/widgets/PendingRentalsWidget';
import StockAlertsWidget from '../components/dashboard/widgets/StockAlertsWidget';
import EquipmentStatusWidget from '../components/dashboard/widgets/EquipmentStatusWidget';
import RecentActivityWidget from '../components/dashboard/widgets/RecentActivityWidget';
import UpcomingRentalsWidget from '../components/dashboard/widgets/UpcomingRentalsWidget';
import MaintenanceWidget from '../components/dashboard/widgets/MaintenanceWidget';
import PersonnelGanttWidget from '../components/dashboard/widgets/PersonnelGanttWidget';
import StockPlanningWidget from '../components/dashboard/widgets/StockPlanningWidget';
import UserTasksWidget from '../components/dashboard/widgets/UserTasksWidget';
import ClockDateWidget from '../components/dashboard/widgets/ClockDateWidget';
import {
  DashboardWidget,
  WidgetLayout,
  DashboardState,
  DashboardWidgetOptions,
  CalendarWidgetOptions,
  ClockWidgetOptions,
  UpcomingRentalsWidgetOptions,
} from '../types/dashboard';
import { useUIPreferences } from '../hooks/useUIPreferences';
import { useDashboardData } from '../hooks/useDashboardData';
import { useTranslation } from '../context/TranslationContext';

const CALENDAR_WIDGET_DEFAULT_OPTIONS: Required<CalendarWidgetOptions> = {
  days: 1,
  showRentals: true,
  showLogistics: true,
  showMaintenance: true,
  showManual: true,
  showCurrentTimeLine: true,
  showSecondaryText: true,
  density: 'comfortable',
};

const CLOCK_WIDGET_DEFAULT_OPTIONS: Required<ClockWidgetOptions> = {
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

const UPCOMING_RENTALS_WIDGET_DEFAULT_OPTIONS: Required<UpcomingRentalsWidgetOptions> = {
  showClient: true,
  showDate: true,
  showLocation: true,
  showEquipmentCount: true,
  showStatus: true,
  limit: 5,
  sortOrder: 'start_asc',
};

const getCalendarLayoutSizing = (days: 1 | 2) => ({
  preferredW: days === 2 ? 8 : 4,
  minW: days === 2 ? 6 : 3,
  defaultH: 6,
  minH: 4,
});

const resolveCalendarWidgetOptions = (options: DashboardWidgetOptions | undefined): Required<CalendarWidgetOptions> => ({
  ...CALENDAR_WIDGET_DEFAULT_OPTIONS,
  ...(options?.calendar || {}),
});

const resolveClockWidgetOptions = (options: DashboardWidgetOptions | undefined): Required<ClockWidgetOptions> => ({
  ...CLOCK_WIDGET_DEFAULT_OPTIONS,
  ...(options?.clock || {}),
  dateFormat: options?.clock?.dateFormat === 'numeric' ? 'numeric' : 'long',
  timeFormat: options?.clock?.timeFormat === '12h' || options?.clock?.timeFormat === '24h' || options?.clock?.timeFormat === 'auto'
    ? options.clock.timeFormat
    : 'auto',
  autoSize: typeof options?.clock?.autoSize === 'boolean' ? options.clock.autoSize : true,
  sizePercent: typeof options?.clock?.sizePercent === 'number'
    ? Math.max(50, Math.min(100, options.clock.sizePercent))
    : 85,
  timeSizePercent: typeof options?.clock?.timeSizePercent === 'number'
    ? Math.max(50, Math.min(150, options.clock.timeSizePercent))
    : 100,
  dateSizePercent: typeof options?.clock?.dateSizePercent === 'number'
    ? Math.max(50, Math.min(150, options.clock.dateSizePercent))
    : 100,
  datePosition: options?.clock?.datePosition === 'bottom' ? 'bottom' : 'top',
  timeColor: typeof options?.clock?.timeColor === 'string' ? options.clock.timeColor : '#111827',
  dateColor: typeof options?.clock?.dateColor === 'string' ? options.clock.dateColor : '#4b5563',
  colorsLinked: typeof options?.clock?.colorsLinked === 'boolean' ? options.clock.colorsLinked : false,
});

const resolveUpcomingRentalsWidgetOptions = (
  options: DashboardWidgetOptions | undefined,
): Required<UpcomingRentalsWidgetOptions> => ({
  ...UPCOMING_RENTALS_WIDGET_DEFAULT_OPTIONS,
  ...(options?.upcomingRentals || {}),
  showClient: typeof options?.upcomingRentals?.showClient === 'boolean'
    ? options.upcomingRentals.showClient
    : UPCOMING_RENTALS_WIDGET_DEFAULT_OPTIONS.showClient,
  showDate: typeof options?.upcomingRentals?.showDate === 'boolean'
    ? options.upcomingRentals.showDate
    : UPCOMING_RENTALS_WIDGET_DEFAULT_OPTIONS.showDate,
  showLocation: typeof options?.upcomingRentals?.showLocation === 'boolean'
    ? options.upcomingRentals.showLocation
    : UPCOMING_RENTALS_WIDGET_DEFAULT_OPTIONS.showLocation,
  showEquipmentCount: typeof options?.upcomingRentals?.showEquipmentCount === 'boolean'
    ? options.upcomingRentals.showEquipmentCount
    : UPCOMING_RENTALS_WIDGET_DEFAULT_OPTIONS.showEquipmentCount,
  showStatus: typeof options?.upcomingRentals?.showStatus === 'boolean'
    ? options.upcomingRentals.showStatus
    : UPCOMING_RENTALS_WIDGET_DEFAULT_OPTIONS.showStatus,
  limit: typeof options?.upcomingRentals?.limit === 'number'
    ? Math.max(3, Math.min(10, Math.round(options.upcomingRentals.limit)))
    : UPCOMING_RENTALS_WIDGET_DEFAULT_OPTIONS.limit,
  sortOrder: options?.upcomingRentals?.sortOrder
    && ['start_asc', 'start_desc', 'client_asc', 'client_desc'].includes(options.upcomingRentals.sortOrder)
    ? options.upcomingRentals.sortOrder
    : UPCOMING_RENTALS_WIDGET_DEFAULT_OPTIONS.sortOrder,
});

// Factory to generate available widgets from live data
const buildAvailableWidgets = (
  data: ReturnType<typeof useDashboardData>,
  t: (key: string, vars?: Record<string, string | number>) => string,
  widgetOptions: DashboardWidgetOptions | undefined,
) => {
  const calendarOptions = resolveCalendarWidgetOptions(widgetOptions);
  const clockOptions = resolveClockWidgetOptions(widgetOptions);
  const upcomingRentalsOptions = resolveUpcomingRentalsWidgetOptions(widgetOptions);
  const calendarDays: 1 | 2 = calendarOptions.days;
  const calendarSizing = getCalendarLayoutSizing(calendarDays);
  const calendarLayout = {
    w: calendarSizing.preferredW,
    h: calendarSizing.defaultH,
    minW: calendarSizing.minW,
    minH: calendarSizing.minH,
  };

  const widgets: DashboardWidget[] = [
    {
      id: 'calendar',
      title: t('dashboard.widgets.calendar.title'),
      component: DayCalendarWidget,
      props: { events: data.events, options: calendarOptions },
      defaultLayout: calendarLayout,
    },
    {
      id: 'clock-date',
      title: t('dashboard.widgets.clockDate.title'),
      component: ClockDateWidget,
      props: { options: clockOptions },
      defaultLayout: { w: 3, h: 3, minW: 2, minH: 3 },
    },
    {
      id: 'pending-rentals',
      title: t('dashboard.widgets.pendingRentals.title'),
      component: PendingRentalsWidget,
      props: { rentals: data.rentals },
      defaultLayout: { w: 4, h: 4, minW: 3, minH: 4 },
    },
    {
      id: 'stock-alerts',
      title: t('dashboard.widgets.stockAlerts.title'),
      component: StockAlertsWidget,
      props: { alerts: [] }, // TODO: brancher quand seuil min sera disponible
      defaultLayout: { w: 4, h: 4, minW: 3, minH: 4 },
    },
    {
      id: 'equipment-status',
      title: t('dashboard.widgets.equipmentStatus.title'),
      component: EquipmentStatusWidget,
      props: { status: data.equipmentStatus },
      defaultLayout: { w: 3, h: 5, minW: 3, minH: 4 },
    },
    {
      id: 'recent-activity',
      title: t('dashboard.widgets.recentActivity.title'),
      component: RecentActivityWidget,
      props: { activities: data.activities },
      defaultLayout: { w: 4, h: 5, minW: 3, minH: 4 },
    },
    {
      id: 'upcoming-rentals',
      title: t('dashboard.widgets.upcomingRentals.title'),
      component: UpcomingRentalsWidget,
      props: { rentals: data.upcomingRentals, options: upcomingRentalsOptions },
      defaultLayout: { w: 4, h: 5, minW: 3, minH: 4 },
    },
    {
      id: 'maintenance',
      title: t('dashboard.widgets.maintenance.title'),
      component: MaintenanceWidget,
      props: { tasks: data.maintenanceTasks },
      defaultLayout: { w: 4, h: 5, minW: 3, minH: 4 },
    },
    {
      id: 'stock-planning',
      title: t('dashboard.widgets.stockPlanning.title'),
      component: StockPlanningWidget,
      props: {},
      defaultLayout: { w: 6, h: 4, minW: 4, minH: 3 },
    },
    {
      id: 'personnel-gantt',
      title: t('dashboard.widgets.personnelGantt.title'),
      component: PersonnelGanttWidget,
      props: { personnel: data.personnel, activities: data.personnelActivities },
      defaultLayout: { w: 12, h: 6, minW: 6, minH: 5 },
    },
    {
      id: 'user-tasks',
      title: 'Mes tâches',
      component: UserTasksWidget,
      props: {},
      defaultLayout: { w: 4, h: 5, minW: 3, minH: 4 },
    },
  ];
  return widgets;
};

// Default dashboard state
const defaultDashboardState: DashboardState = {
  activeWidgets: ['calendar', 'pending-rentals', 'equipment-status', 'personnel-gantt'],
  widgetOptions: {
    calendar: { ...CALENDAR_WIDGET_DEFAULT_OPTIONS },
    clock: { ...CLOCK_WIDGET_DEFAULT_OPTIONS },
    upcomingRentals: { ...UPCOMING_RENTALS_WIDGET_DEFAULT_OPTIONS },
  },
  layouts: {
    lg: [
      { i: 'calendar', x: 0, y: 0, w: 4, h: 6, minW: 3, minH: 4 },
      { i: 'pending-rentals', x: 4, y: 0, w: 4, h: 4, minW: 3, minH: 4 },
      { i: 'equipment-status', x: 8, y: 0, w: 4, h: 5, minW: 3, minH: 4 },
      { i: 'personnel-gantt', x: 0, y: 6, w: 12, h: 6, minW: 6, minH: 5 },
    ]
  }
};

const GearButton: React.FC<{ isEditing: boolean; onClick: () => void }> = ({ isEditing, onClick }) => {
  const [spinning, setSpinning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const spin = useCallback(() => {
    if (spinning) return;
    setSpinning(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSpinning(false), 800);
  }, [spinning]);

  const handleClick = useCallback(() => {
    spin();
    onClick();
  }, [spin, onClick]);

  return (
    <>
      <style>{`
        @keyframes gear-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .gear-icon-spin { animation: gear-spin 0.8s cubic-bezier(0.25, 0.1, 0.25, 1.0); }
      `}</style>
      {isEditing ? (
        <button
          onClick={onClick}
          className="h-9 px-4 flex items-center justify-center rounded-full shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500"
        >
          Enregistrer
        </button>
      ) : (
        <button
          onClick={handleClick}
          onMouseEnter={spin}
          title="Personnaliser le tableau de bord"
          className="h-9 w-9 flex items-center justify-center rounded-full shadow-sm text-white bg-blue-600 hover:bg-blue-700 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
        >
          <Settings className={`h-4 w-4${spinning ? ' gear-icon-spin' : ''}`} />
        </button>
      )}
    </>
  );
};

const Dashboard = () => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSavingOverlayVisible, setIsSavingOverlayVisible] = useState(false);
  const [dashboardState, setDashboardState] = useUIPreferences<DashboardState>('dashboard_state', defaultDashboardState);
  const data = useDashboardData();

  const savingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const availableWidgets = useMemo(
    () => buildAvailableWidgets(data, t, dashboardState.widgetOptions),
    [data, t, dashboardState.widgetOptions],
  );

  const applyCalendarWidgetSizing = (
    layouts: DashboardState['layouts'],
    days: 1 | 2,
    activeWidgetIds: string[],
    forcePreferredWidth: boolean,
  ) => {
    const sizing = getCalendarLayoutSizing(days);
    const colCount = 12;

    const normalizeBreakpoint = (breakpointLayouts: WidgetLayout[] = []): WidgetLayout[] => {
      let found = false;
      const nextLayouts = breakpointLayouts.map((layout) => {
        if (layout.i !== 'calendar') return layout;
        found = true;

        const desiredWidth = forcePreferredWidth ? sizing.preferredW : layout.w;
        const nextWidth = Math.max(sizing.minW, desiredWidth);
        const nextHeight = Math.max(sizing.minH, layout.h);

        return {
          ...layout,
          x: Math.max(0, Math.min(layout.x, colCount - nextWidth)),
          w: nextWidth,
          h: nextHeight,
          minW: sizing.minW,
          minH: sizing.minH,
          maxW: undefined,
          maxH: undefined,
        };
      });

      if (!found && activeWidgetIds.includes('calendar')) {
        nextLayouts.push({
          i: 'calendar',
          x: 0,
          y: 0,
          w: sizing.preferredW,
          h: sizing.defaultH,
          minW: sizing.minW,
          minH: sizing.minH,
          maxW: undefined,
          maxH: undefined,
        });
      }

      return nextLayouts;
    };

    const nextLayouts: DashboardState['layouts'] = {};
    Object.entries(layouts).forEach(([breakpoint, breakpointLayouts]) => {
      nextLayouts[breakpoint] = normalizeBreakpoint(breakpointLayouts);
    });

    if (!nextLayouts.lg) {
      nextLayouts.lg = normalizeBreakpoint([]);
    }

    return nextLayouts;
  };

  const showSavingOverlay = (after?: () => void, duration = 500) => {
    if (savingTimeoutRef.current) {
      clearTimeout(savingTimeoutRef.current);
    }
    setIsSavingOverlayVisible(true);
    savingTimeoutRef.current = setTimeout(() => {
      after?.();
      setIsSavingOverlayVisible(false);
      savingTimeoutRef.current = null;
    }, duration);
  };

  const handleLayoutChange = (currentLayout: WidgetLayout[], allLayouts: { [key: string]: WidgetLayout[] }) => {
    if (isEditing) {
      setDashboardState({
        ...dashboardState,
        layouts: allLayouts
      });
    }
  };

  const handleAddWidget = (widgetId: string) => {
    if (!dashboardState.activeWidgets.includes(widgetId)) {
      setDashboardState({
        ...dashboardState,
        activeWidgets: [...dashboardState.activeWidgets, widgetId]
      });
    }
  };

  const handleRemoveWidget = (widgetId: string) => {
    const nextWidgetOptions = { ...(dashboardState.widgetOptions || {}) };
    if (widgetId === 'calendar') {
      nextWidgetOptions.calendar = { ...CALENDAR_WIDGET_DEFAULT_OPTIONS };
    }
    if (widgetId === 'clock-date') {
      nextWidgetOptions.clock = { ...CLOCK_WIDGET_DEFAULT_OPTIONS };
    }
    if (widgetId === 'upcoming-rentals') {
      nextWidgetOptions.upcomingRentals = { ...UPCOMING_RENTALS_WIDGET_DEFAULT_OPTIONS };
    }

    setDashboardState({
      ...dashboardState,
      activeWidgets: dashboardState.activeWidgets.filter(id => id !== widgetId),
      widgetOptions: nextWidgetOptions,
      layouts: {
        ...dashboardState.layouts,
        lg: (dashboardState.layouts.lg || []).filter(layout => layout.i !== widgetId)
      }
    });
  };

  const handleWidgetOptionsChange = (widgetId: string, options: Record<string, unknown>) => {
    if (widgetId === 'calendar') {
      const currentCalendarOptions = resolveCalendarWidgetOptions(dashboardState.widgetOptions);
      const nextCalendarOptions: Required<CalendarWidgetOptions> = {
        ...currentCalendarOptions,
        ...(options as Partial<CalendarWidgetOptions>),
        days: (options.days === 2 ? 2 : options.days === 1 ? 1 : currentCalendarOptions.days),
        density: options.density === 'compact' || options.density === 'comfortable'
          ? options.density
          : currentCalendarOptions.density,
      };

      const hasChanged = JSON.stringify(currentCalendarOptions) !== JSON.stringify(nextCalendarOptions);
      if (!hasChanged) return;
      const daysChanged = currentCalendarOptions.days !== nextCalendarOptions.days;

      setDashboardState({
        ...dashboardState,
        widgetOptions: {
          ...dashboardState.widgetOptions,
          calendar: nextCalendarOptions,
        },
        layouts: applyCalendarWidgetSizing(
          dashboardState.layouts,
          nextCalendarOptions.days,
          dashboardState.activeWidgets,
          daysChanged,
        ),
      });
      return;
    }

    if (widgetId === 'clock-date') {
      const currentClockOptions = resolveClockWidgetOptions(dashboardState.widgetOptions);
      const incomingLinked = typeof options.colorsLinked === 'boolean'
        ? options.colorsLinked
        : currentClockOptions.colorsLinked;
      const incomingTimeColor = typeof options.timeColor === 'string'
        ? options.timeColor
        : currentClockOptions.timeColor;
      const incomingDateColor = typeof options.dateColor === 'string'
        ? options.dateColor
        : currentClockOptions.dateColor;
      const nextClockOptions: Required<ClockWidgetOptions> = {
        ...currentClockOptions,
        ...(options as Partial<ClockWidgetOptions>),
        dateFormat: options.dateFormat === 'numeric' ? 'numeric' : options.dateFormat === 'long'
          ? 'long'
          : currentClockOptions.dateFormat,
        timeFormat: options.timeFormat === '12h' || options.timeFormat === '24h' || options.timeFormat === 'auto'
          ? options.timeFormat
          : currentClockOptions.timeFormat,
        showSeconds: typeof options.showSeconds === 'boolean' ? options.showSeconds : currentClockOptions.showSeconds,
        showYear: typeof options.showYear === 'boolean' ? options.showYear : currentClockOptions.showYear,
        autoSize: typeof options.autoSize === 'boolean' ? options.autoSize : currentClockOptions.autoSize,
        sizePercent: typeof options.sizePercent === 'number'
          ? Math.max(50, Math.min(100, Math.round(options.sizePercent)))
          : currentClockOptions.sizePercent,
        timeSizePercent: typeof options.timeSizePercent === 'number'
          ? Math.max(50, Math.min(150, Math.round(options.timeSizePercent)))
          : currentClockOptions.timeSizePercent,
        dateSizePercent: typeof options.dateSizePercent === 'number'
          ? Math.max(50, Math.min(150, Math.round(options.dateSizePercent)))
          : currentClockOptions.dateSizePercent,
        datePosition: options.datePosition === 'bottom' || options.datePosition === 'top'
          ? options.datePosition
          : currentClockOptions.datePosition,
        timeColor: incomingTimeColor,
        dateColor: incomingLinked ? incomingTimeColor : incomingDateColor,
        colorsLinked: incomingLinked,
      };

      const hasChanged = JSON.stringify(currentClockOptions) !== JSON.stringify(nextClockOptions);
      if (!hasChanged) return;

      setDashboardState({
        ...dashboardState,
        widgetOptions: {
          ...dashboardState.widgetOptions,
          clock: nextClockOptions,
        },
      });
      return;
    }

    if (widgetId === 'upcoming-rentals') {
      const currentUpcomingOptions = resolveUpcomingRentalsWidgetOptions(dashboardState.widgetOptions);
      const nextUpcomingOptions: Required<UpcomingRentalsWidgetOptions> = {
        ...currentUpcomingOptions,
        ...(options as Partial<UpcomingRentalsWidgetOptions>),
        showClient: typeof options.showClient === 'boolean' ? options.showClient : currentUpcomingOptions.showClient,
        showDate: typeof options.showDate === 'boolean' ? options.showDate : currentUpcomingOptions.showDate,
        showLocation: typeof options.showLocation === 'boolean' ? options.showLocation : currentUpcomingOptions.showLocation,
        showEquipmentCount: typeof options.showEquipmentCount === 'boolean'
          ? options.showEquipmentCount
          : currentUpcomingOptions.showEquipmentCount,
        showStatus: typeof options.showStatus === 'boolean' ? options.showStatus : currentUpcomingOptions.showStatus,
        limit: typeof options.limit === 'number'
          ? Math.max(3, Math.min(10, Math.round(options.limit)))
          : currentUpcomingOptions.limit,
      };

      const hasChanged = JSON.stringify(currentUpcomingOptions) !== JSON.stringify(nextUpcomingOptions);
      if (!hasChanged) return;

      setDashboardState({
        ...dashboardState,
        widgetOptions: {
          ...dashboardState.widgetOptions,
          upcomingRentals: nextUpcomingOptions,
        },
      });
    }
  };

  const handleResetLayout = () => {
    setDashboardState(defaultDashboardState);
    showSavingOverlay(undefined, 450);
  };

  const availableToAdd = availableWidgets.filter(widget => 
    !dashboardState.activeWidgets.includes(widget.id)
  );

  const handleToggleEditing = () => {
    if (isEditing) {
      showSavingOverlay(() => {
        setIsEditing(false);
      });
    } else {
      setIsEditing(true);
    }
  };

  useEffect(() => {
    const normalizedLayouts = applyCalendarWidgetSizing(
      dashboardState.layouts,
      resolveCalendarWidgetOptions(dashboardState.widgetOptions).days,
      dashboardState.activeWidgets,
      false,
    );

    if (JSON.stringify(normalizedLayouts) === JSON.stringify(dashboardState.layouts)) {
      return;
    }

    setDashboardState({
      ...dashboardState,
      layouts: normalizedLayouts,
    });
  }, [dashboardState, setDashboardState]);

  useEffect(() => {
    return () => {
      if (savingTimeoutRef.current) {
        clearTimeout(savingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* Mobile menu dashboard (3x3 grid of big buttons) */}
      <div className="md:hidden">
        <div className="min-h-[70vh] flex items-center justify-center">
          <div className="grid grid-cols-3 gap-4">
            <Link to="/rentals" className="w-24 h-24 bg-white border rounded-xl shadow-sm flex flex-col items-center justify-center active:scale-[.98]">
              <ClipboardList className="h-7 w-7 text-purple-600" />
              <div className="mt-1 text-xs text-gray-800 text-center">{t('dashboard.quickLinks.preparations')}</div>
            </Link>
            <Link to="/rentals" className="w-24 h-24 bg-white border rounded-xl shadow-sm flex flex-col items-center justify-center active:scale-[.98]">
              <Package className="h-7 w-7 text-blue-600" />
              <div className="mt-1 text-xs text-gray-800 text-center">{t('dashboard.quickLinks.services')}</div>
            </Link>
            <Link to="/calendar" className="w-24 h-24 bg-white border rounded-xl shadow-sm flex flex-col items-center justify-center active:scale-[.98]">
              <CalIcon className="h-7 w-7 text-teal-600" />
              <div className="mt-1 text-xs text-gray-800 text-center">{t('dashboard.quickLinks.calendar')}</div>
            </Link>
            <Link to="/equipment" className="w-24 h-24 bg-white border rounded-xl shadow-sm flex flex-col items-center justify-center active:scale-[.98]">
              <Wrench className="h-7 w-7 text-orange-600" />
              <div className="mt-1 text-xs text-gray-800 text-center">{t('dashboard.quickLinks.equipment')}</div>
            </Link>
            <Link to="/warehouses" className="w-24 h-24 bg-white border rounded-xl shadow-sm flex flex-col items-center justify-center active:scale-[.98]">
              <Boxes className="h-7 w-7 text-emerald-600" />
              <div className="mt-1 text-xs text-gray-800 text-center">{t('dashboard.quickLinks.warehouses')}</div>
            </Link>
            <Link to="/clients" className="w-24 h-24 bg-white border rounded-xl shadow-sm flex flex-col items-center justify-center active:scale-[.98]">
              <Users className="h-7 w-7 text-gray-900" />
              <div className="mt-1 text-xs text-gray-800 text-center">{t('dashboard.quickLinks.clients')}</div>
            </Link>
            <Link to="/settings" className="w-24 h-24 bg-white border rounded-xl shadow-sm flex flex-col items-center justify-center active:scale-[.98]">
              <Settings className="h-7 w-7 text-gray-900" />
              <div className="mt-1 text-xs text-gray-800 text-center">{t('dashboard.quickLinks.account')}</div>
            </Link>
            <Link to="/company" className="w-24 h-24 bg-white border rounded-xl shadow-sm flex flex-col items-center justify-center active:scale-[.98]">
              <Building2 className="h-7 w-7 text-sky-600" />
              <div className="mt-1 text-xs text-gray-800 text-center">{t('dashboard.quickLinks.company')}</div>
            </Link>
          </div>
        </div>
      </div>

      {/* Desktop dashboard */}
      <div className="hidden md:block">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 pb-2">
          <h1 className="text-2xl font-semibold text-gray-900">{t('dashboard.title')}</h1>
          <div className="flex items-center gap-2">
            {isEditing && (
              <>
                <Button
                  variant="soft"
                  shape="pill"
                  leftIcon={Plus}
                  onClick={() => setShowAddModal(true)}
                >
                  {t('dashboard.buttons.addWidget')}
                </Button>
                <Button
                  variant="outline"
                  shape="pill"
                  leftIcon={RotateCcw}
                  onClick={handleResetLayout}
                >
                  {t('dashboard.buttons.reset')}
                </Button>
              </>
            )}
            <GearButton isEditing={isEditing} onClick={handleToggleEditing} />
          </div>
        </div>
      </div>

      <DashboardGrid
        widgets={availableWidgets}
        activeWidgetIds={dashboardState.activeWidgets}
        layouts={dashboardState.layouts}
        onLayoutChange={handleLayoutChange}
        isEditing={isEditing}
        onRemoveWidget={handleRemoveWidget}
        widgetOptions={dashboardState.widgetOptions}
        onWidgetOptionsChange={handleWidgetOptionsChange}
      />

      <AddWidgetModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        availableWidgets={availableToAdd}
        onAddWidget={handleAddWidget}
      />

      {/* Portal + high z-index: rendered in-page, this overlay would sit under
          the glass topbar/sidebar (backdrop-filter stacking contexts) and the
          other layered surfaces. */}
      {isSavingOverlayVisible && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[12030] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm">
          <div className="flex flex-col items-center space-y-3 rounded-2xl bg-white/95 px-6 py-5 shadow-xl">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
            <p className="text-sm font-medium text-gray-700">{t('dashboard.savingOverlay')}</p>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default Dashboard;
