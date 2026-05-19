import { ReactNode } from 'react';

export interface WidgetLayout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export interface DashboardWidget {
  id: string;
  title: string;
  component: React.ComponentType<any>;
  props?: any;
  defaultLayout: {
    w: number;
    h: number;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
  };
}

export interface CalendarWidgetOptions {
  days?: 1 | 2;
  showRentals?: boolean;
  showLogistics?: boolean;
  showMaintenance?: boolean;
  showManual?: boolean;
  showCurrentTimeLine?: boolean;
  showSecondaryText?: boolean;
  density?: 'comfortable' | 'compact';
}

export interface ClockWidgetOptions {
  showSeconds?: boolean;
  showYear?: boolean;
  dateFormat?: 'long' | 'numeric';
  timeFormat?: 'auto' | '24h' | '12h';
  autoSize?: boolean;
  sizePercent?: number;
  timeSizePercent?: number;
  dateSizePercent?: number;
  datePosition?: 'top' | 'bottom';
  timeColor?: string;
  dateColor?: string;
  colorsLinked?: boolean;
}

export interface UpcomingRentalsWidgetOptions {
  showClient?: boolean;
  showDate?: boolean;
  showLocation?: boolean;
  showEquipmentCount?: boolean;
  showStatus?: boolean;
  limit?: number;
}

export interface DashboardWidgetOptions {
  calendar?: CalendarWidgetOptions;
  clock?: ClockWidgetOptions;
  upcomingRentals?: UpcomingRentalsWidgetOptions;
}

export interface DashboardState {
  activeWidgets: string[];
  layouts: { [key: string]: WidgetLayout[] };
  widgetOptions?: DashboardWidgetOptions;
}
