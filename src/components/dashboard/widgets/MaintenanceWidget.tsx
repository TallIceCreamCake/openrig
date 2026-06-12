import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Wrench,
} from 'lucide-react';
import { format, isBefore, isValid, parseISO, startOfDay } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { useTranslation } from '../../../context/TranslationContext';

interface MaintenanceTask {
  id: string;
  equipment_name: string;
  equipment_id: string;
  type: 'preventive' | 'corrective' | 'inspection';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  scheduled_date: string;
  status: 'pending' | 'in_progress' | 'completed';
  description: string;
}

interface MaintenanceWidgetProps {
  tasks: MaintenanceTask[];
}

const MaintenanceWidget: React.FC<MaintenanceWidgetProps> = ({ tasks }) => {
  const { t, language } = useTranslation();
  const locale = language === 'en' ? enUS : fr;

  const getPriorityTheme = (priority: MaintenanceTask['priority']) => {
    switch (priority) {
      case 'urgent':
        return {
          accent: 'bg-red-500',
          badge: 'bg-red-100 text-red-700 border-red-200',
        };
      case 'high':
        return {
          accent: 'bg-orange-500',
          badge: 'bg-orange-100 text-orange-700 border-orange-200',
        };
      case 'medium':
        return {
          accent: 'bg-amber-500',
          badge: 'bg-amber-100 text-amber-700 border-amber-200',
        };
      case 'low':
        return {
          accent: 'bg-emerald-500',
          badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        };
      default:
        return {
          accent: 'bg-slate-400',
          badge: 'bg-slate-100 text-slate-700 border-slate-200',
        };
    }
  };

  const getStatusMeta = (status: MaintenanceTask['status']) => {
    switch (status) {
      case 'completed':
        return {
          icon: CheckCircle2,
          className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
          label: t('rentals.status.completed'),
        };
      case 'in_progress':
        return {
          icon: Clock3,
          className: 'bg-sky-100 text-sky-700 border-sky-200',
          label: t('rentals.status.in_progress'),
        };
      case 'pending':
        return {
          icon: AlertTriangle,
          className: 'bg-amber-100 text-amber-700 border-amber-200',
          label: t('rentals.status.pending'),
        };
      default:
        return {
          icon: Clock3,
          className: 'bg-slate-100 text-slate-700 border-slate-200',
          label: status,
        };
    }
  };

  const getTypeMeta = (type: MaintenanceTask['type']) => {
    switch (type) {
      case 'preventive':
        return {
          label: t('dashboard.widgets.maintenance.types.preventive'),
          className: 'bg-indigo-100 text-indigo-700 border-indigo-200',
        };
      case 'corrective':
        return {
          label: t('dashboard.widgets.maintenance.types.corrective'),
          className: 'bg-rose-100 text-rose-700 border-rose-200',
        };
      case 'inspection':
        return {
          label: t('dashboard.widgets.maintenance.types.inspection'),
          className: 'bg-violet-100 text-violet-700 border-violet-200',
        };
      default:
        return {
          label: type,
          className: 'bg-slate-100 text-slate-700 border-slate-200',
        };
    }
  };

  const getPriorityLabel = (priority: MaintenanceTask['priority']) =>
    t(`dashboard.widgets.maintenance.priority.${priority}`);

  const openTasks = useMemo(
    () => tasks.filter(task => task.status !== 'completed'),
    [tasks],
  );

  const visibleTasks = useMemo(
    () => openTasks.slice(0, 4),
    [openTasks],
  );

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-0.5">
        {visibleTasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 py-6 text-center">
            <Wrench className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-500">{t('dashboard.widgets.maintenance.empty')}</p>
          </div>
        ) : (
          visibleTasks.map((task) => {
            const priorityTheme = getPriorityTheme(task.priority);
            const statusMeta = getStatusMeta(task.status);
            const typeMeta = getTypeMeta(task.type);
            const StatusIcon = statusMeta.icon;
            const scheduledDate = parseISO(task.scheduled_date);
            const hasValidDate = isValid(scheduledDate);
            const isOverdue = hasValidDate && isBefore(scheduledDate, startOfDay(new Date()));
            const dateLabel = hasValidDate
              ? format(scheduledDate, 'dd MMM yyyy', { locale })
              : task.scheduled_date;

            return (
              <Link
                key={task.id}
                to={`/equipment/${task.equipment_id}`}
                className="relative block overflow-hidden rounded-xl border border-slate-200 bg-white p-3 pl-4 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-50/80 hover:shadow-md"
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 w-1 ${priorityTheme.accent}`}
                />

                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate pr-2 text-sm font-semibold text-slate-900">{task.equipment_name}</p>
                      <div
                        className={`flex flex-shrink-0 items-center gap-1 text-xs font-medium ${
                          isOverdue ? 'text-red-600' : 'text-slate-500'
                        }`}
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        <span>{dateLabel}</span>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusMeta.className}`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusMeta.label}
                      </span>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${typeMeta.className}`}>
                        {typeMeta.label}
                      </span>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${priorityTheme.badge}`}>
                        {getPriorityLabel(task.priority)}
                      </span>
                    </div>

                    {task.description ? (
                      <p className="mt-2 text-xs text-slate-600">{task.description}</p>
                    ) : null}
                  </div>
                </div>
              </Link>
            );
          })
        )}

        {openTasks.length > 4 && (
          <div className="border-t border-slate-200 pt-2">
            <Link
              to="/maintenance"
              className="flex items-center justify-center gap-1 text-sm font-medium text-blue-600 transition-colors hover:text-blue-800"
            >
              <Wrench className="h-4 w-4" />
              <span>{t('dashboard.widgets.maintenance.viewAll')}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default MaintenanceWidget;
