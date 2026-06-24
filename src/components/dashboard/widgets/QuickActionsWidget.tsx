import React from 'react';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { QUICK_ACTIONS_BY_ID, DEFAULT_QUICK_ACTION_IDS, type QuickActionDef } from '../../../constants/quickActions';

export interface QuickActionsWidgetOptionsResolved {
  actionIds: string[];
  columns: 'auto' | 2 | 3 | 4 | 5;
}

interface QuickActionsWidgetProps {
  options?: Partial<QuickActionsWidgetOptionsResolved>;
}

const QuickActionsWidget: React.FC<QuickActionsWidgetProps> = ({ options }) => {
  const actionIds = options?.actionIds ?? DEFAULT_QUICK_ACTION_IDS;
  const columns = options?.columns ?? 'auto';

  const actions: QuickActionDef[] = actionIds
    .map((id) => QUICK_ACTIONS_BY_ID[id])
    .filter((action): action is QuickActionDef => Boolean(action));

  if (actions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-gray-400">
        <Zap className="h-7 w-7" />
        <p className="text-sm">Aucun raccourci sélectionné.</p>
        <p className="text-xs">Passez le tableau de bord en mode édition, puis configurez ce widget pour ajouter des raccourcis.</p>
      </div>
    );
  }

  const gridStyle: React.CSSProperties =
    columns === 'auto'
      ? { gridTemplateColumns: 'repeat(auto-fill, minmax(5.5rem, 1fr))' }
      : { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="grid gap-2.5" style={gridStyle}>
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.id}
              to={action.to}
              className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-100 bg-white px-2 py-3 text-center transition-all hover:border-gray-200 hover:shadow-sm active:scale-[.97]"
            >
              <span className={`grid h-11 w-11 place-items-center rounded-xl ${action.tone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-medium leading-tight text-gray-700 line-clamp-2">
                {action.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default QuickActionsWidget;
