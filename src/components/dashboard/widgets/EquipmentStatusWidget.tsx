import React from 'react';
import { Package, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { useTranslation } from '../../../context/TranslationContext';

interface EquipmentStatus {
  available: number;
  in_use: number;
  maintenance: number;
  total: number;
}

interface EquipmentStatusWidgetProps {
  status: EquipmentStatus;
}

const EquipmentStatusWidget: React.FC<EquipmentStatusWidgetProps> = ({ status }) => {
  const { t } = useTranslation();
  const statusItems = [
    {
      label: t('dashboard.widgets.equipmentStatus.available'),
      count: status.available,
      icon: CheckCircle,
      color: 'text-emerald-700',
      iconBg: 'bg-emerald-100',
      cardBg: 'bg-emerald-50/70',
      border: 'border-emerald-200',
      track: 'bg-emerald-100',
      fill: 'bg-emerald-500',
    },
    {
      label: t('dashboard.widgets.equipmentStatus.inUse'),
      count: status.in_use,
      icon: Clock,
      color: 'text-sky-700',
      iconBg: 'bg-sky-100',
      cardBg: 'bg-sky-50/70',
      border: 'border-sky-200',
      track: 'bg-sky-100',
      fill: 'bg-sky-500',
    },
    {
      label: t('dashboard.widgets.equipmentStatus.maintenance'),
      count: status.maintenance,
      icon: AlertTriangle,
      color: 'text-amber-700',
      iconBg: 'bg-amber-100',
      cardBg: 'bg-amber-50/70',
      border: 'border-amber-200',
      track: 'bg-amber-100',
      fill: 'bg-amber-500',
    }
  ];

  return (
    <div className="h-full flex flex-col p-4">
      <div className="mb-3 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('dashboard.widgets.equipmentStatus.total')}
            </p>
            <p className="mt-1 text-3xl font-bold leading-none text-slate-900">{status.total}</p>
          </div>
          <div className="rounded-lg bg-slate-100 p-2">
            <Package className="h-5 w-5 text-slate-600" />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 grid grid-rows-3 gap-2">
        {statusItems.map((item) => {
          const Icon = item.icon;
          const percentage = status.total > 0 ? Math.round((item.count / status.total) * 100) : 0;

          return (
            <div
              key={item.label}
              className={`flex h-full flex-col justify-between rounded-xl border px-3 py-2 ${item.cardBg} ${item.border}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className={`rounded-lg p-1 ${item.iconBg}`}>
                    <Icon className={`h-3.5 w-3.5 ${item.color}`} />
                  </div>
                  <span className="text-sm font-medium leading-none text-slate-700">{item.label}</span>
                </div>
                <div className="flex items-center justify-end gap-3 text-right">
                  <span className="text-xl font-semibold leading-none text-slate-900">{item.count}</span>
                  <span className="text-xs font-medium leading-none text-slate-500">{percentage}%</span>
                </div>
              </div>

              <div className={`mt-1.5 h-1.5 w-full overflow-hidden rounded-full ${item.track}`}>
                <div
                  className={`h-full rounded-full ${item.fill} transition-all`}
                  style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EquipmentStatusWidget;
