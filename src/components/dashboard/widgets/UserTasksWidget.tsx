import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Minus, RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';

type CheckState = 'empty' | 'red' | 'orange' | 'green';

type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  check_state: CheckState;
  is_completed: boolean;
  base_color: string | null;
  card_name: string;
  rental_id: string;
  rental_title: string;
  rental_reference_code: string | null;
};

const normalizeCheckState = (value: string | null | undefined, isCompleted = false): CheckState => {
  if (value === 'empty' || value === 'red' || value === 'orange' || value === 'green') return value;
  return isCompleted ? 'green' : 'empty';
};

const nextCheckState = (state: CheckState): CheckState => {
  if (state === 'empty') return 'green';
  if (state === 'green') return 'empty';
  if (state === 'red') return 'green';
  return 'empty';
};

const CheckStateIcon: React.FC<{ state: CheckState; color: string }> = ({ state, color }) => {
  if (state === 'green') return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 text-white" style={{ borderColor: color, backgroundColor: color }}>
      <Check className="h-3 w-3" />
    </span>
  );
  if (state === 'red') return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 text-white" style={{ borderColor: '#ef4444', backgroundColor: '#ef4444' }}>
      <X className="h-3 w-3" />
    </span>
  );
  if (state === 'orange') return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 text-white" style={{ borderColor: '#f59e0b', backgroundColor: '#f59e0b' }}>
      <Minus className="h-3 w-3" />
    </span>
  );
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-300 bg-white" />
  );
};

const UserTasksWidget: React.FC = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const { data: assignees, error: aErr } = await supabase
        .from('rental_task_card_item_assignees')
        .select('item_id')
        .eq('user_id', user.id);
      if (aErr) throw aErr;

      const itemIds = (assignees || []).map((a: { item_id: string }) => a.item_id);
      if (itemIds.length === 0) { setItems([]); return; }

      const { data: rawItems, error: iErr } = await supabase
        .from('rental_task_card_items')
        .select('id, title, description, check_state, is_completed, base_color, card_id, created_at')
        .in('id', itemIds)
        .order('is_completed', { ascending: true })
        .order('created_at', { ascending: false });
      if (iErr) throw iErr;

      const cardIds = [...new Set((rawItems || []).map((i: any) => i.card_id))];
      const { data: cards, error: cErr } = await supabase
        .from('rental_task_cards')
        .select('id, name, rental_id')
        .in('id', cardIds);
      if (cErr) throw cErr;

      const rentalIds = [...new Set((cards || []).map((c: any) => c.rental_id))];
      const { data: rentals, error: rErr } = await supabase
        .from('rentals')
        .select('id, title, reference_code')
        .in('id', rentalIds);
      if (rErr) throw rErr;

      const cardMap = Object.fromEntries((cards || []).map((c: any) => [c.id, c]));
      const rentalMap = Object.fromEntries((rentals || []).map((r: any) => [r.id, r]));

      const result: TaskItem[] = (rawItems || []).map((item: any) => {
        const card = cardMap[item.card_id] || {};
        const rental = rentalMap[card.rental_id] || {};
        return {
          id: item.id,
          title: item.title,
          description: item.description,
          check_state: normalizeCheckState(item.check_state, item.is_completed),
          is_completed: normalizeCheckState(item.check_state, item.is_completed) === 'green',
          base_color: item.base_color,
          card_name: card.name || '—',
          rental_id: card.rental_id || '',
          rental_title: rental.title || '—',
          rental_reference: rental.reference_code || null,
        };
      });

      setItems(result);
    } catch (e: any) {
      console.error('UserTasksWidget load', e);
      setError(e?.message || 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (item: TaskItem) => {
    const next = nextCheckState(item.check_state);
    const nextCompleted = next === 'green';
    setItems((prev) => prev.map((i) => i.id === item.id
      ? { ...i, check_state: next, is_completed: nextCompleted }
      : i
    ));
    setToggling((prev) => ({ ...prev, [item.id]: true }));
    try {
      const { error } = await supabase
        .from('rental_task_card_items')
        .update({ check_state: next, is_completed: nextCompleted })
        .eq('id', item.id);
      if (error) throw error;
    } catch (e) {
      toast.error('Impossible de mettre à jour la tâche');
      setItems((prev) => prev.map((i) => i.id === item.id
        ? { ...i, check_state: item.check_state, is_completed: item.is_completed }
        : i
      ));
    } finally {
      setToggling((prev) => { const { [item.id]: _, ...rest } = prev; return rest; });
    }
  };

  const pending = items.filter((i) => !i.is_completed);
  const done = items.filter((i) => i.is_completed);

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Mes tâches</h3>
          {!loading && (
            <p className="text-xs text-slate-400">
              {pending.length} en cours{done.length > 0 ? ` · ${done.length} terminée${done.length > 1 ? 's' : ''}` : ''}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-700"
          title="Actualiser"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-500" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <p className="text-xs text-red-500 break-all">{error}</p>
          <button type="button" onClick={load} className="mt-1 text-xs text-blue-500 underline">Réessayer</button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <Check className="h-8 w-8 text-green-400" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Aucune tâche assignée</p>
          <p className="text-xs text-slate-400">Tu n&apos;as pas de tâches pour l&apos;instant.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
          {pending.map((item) => (
            <TaskRow key={item.id} item={item} toggling={!!toggling[item.id]} onToggle={toggle} />
          ))}
          {done.length > 0 && pending.length > 0 && (
            <div className="flex items-center gap-2 py-1">
              <div className="h-px flex-1 bg-slate-100 dark:bg-slate-700" />
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Terminées</span>
              <div className="h-px flex-1 bg-slate-100 dark:bg-slate-700" />
            </div>
          )}
          {done.map((item) => (
            <TaskRow key={item.id} item={item} toggling={!!toggling[item.id]} onToggle={toggle} />
          ))}
        </div>
      )}
    </div>
  );
};

const TaskRow: React.FC<{
  item: TaskItem;
  toggling: boolean;
  onToggle: (item: TaskItem) => void;
}> = ({ item, toggling, onToggle }) => {
  const accentColor = item.base_color || '#6366f1';
  const checkColor = item.base_color || '#2563eb';

  return (
    <div className={`group flex items-start gap-2 rounded-lg border p-2 transition-colors ${
      item.is_completed
        ? 'border-slate-100 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/40'
        : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-750'
    }`}>
      <button
        type="button"
        onClick={() => onToggle(item)}
        disabled={toggling}
        className="mt-0.5 shrink-0 disabled:opacity-50"
        title={item.is_completed ? 'Marquer comme non terminé' : 'Marquer comme terminé'}
      >
        <CheckStateIcon state={item.check_state} color={checkColor} />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          <span
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <p className={`text-sm font-medium leading-snug ${
            item.is_completed ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'
          }`}>
            {item.title}
          </p>
        </div>
        <div className="mt-0.5 flex items-center gap-1 pl-3">
          <Link
            to={`/rentals/${item.rental_id}`}
            className="truncate text-[11px] text-blue-500 hover:underline"
            title={item.rental_title}
          >
            {item.rental_reference_code ? `${item.rental_reference_code} · ` : ''}{item.rental_title}
          </Link>
          <span className="text-[11px] text-slate-300 dark:text-slate-600">·</span>
          <span className="truncate text-[11px] text-slate-400">{item.card_name}</span>
        </div>
      </div>
    </div>
  );
};

export default UserTasksWidget;
