import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, CheckSquare } from 'lucide-react';
import MobileLayout from './MobileLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

type TaskItem = {
  id: string;
  title: string;
  is_checked: boolean;
  rental_task_cards: {
    title: string;
    rental_task_lists: {
      rental_id: string;
      title: string;
    } | null;
  } | null;
};

type GroupedProject = {
  rental_id: string;
  project_title: string;
  tasks: TaskItem[];
};

const MobileTasks: React.FC = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('rental_task_card_items')
          .select('id, title, is_checked, rental_task_cards(title, rental_task_lists(rental_id, title)), task_item_assignees(user_id)')
          .order('is_checked', { ascending: true });

        // Filter for this user's tasks
        const userTasks = ((data as TaskItem[]) || []).filter((item) => {
          const assignees = (item as any).task_item_assignees as { user_id: string }[];
          return !assignees || assignees.length === 0 || assignees.some((a) => a.user_id === user.id);
        });

        setTasks(userTasks);
      } catch (err) {
        console.error('MobileTasks fetch error', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  const toggleTask = async (task: TaskItem) => {
    setTogglingId(task.id);
    const newVal = !task.is_checked;
    try {
      await supabase
        .from('rental_task_card_items')
        .update({ is_checked: newVal })
        .eq('id', task.id);
      setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, is_checked: newVal } : t));
    } catch (err) {
      console.error('Toggle task error', err);
    } finally {
      setTogglingId(null);
    }
  };

  const toggleGroup = (rentalId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(rentalId)) next.delete(rentalId);
      else next.add(rentalId);
      return next;
    });
  };

  const displayedTasks = showAll ? tasks : tasks.filter((t) => !t.is_checked);

  // Group by rental
  const grouped: GroupedProject[] = [];
  const seen = new Map<string, GroupedProject>();
  displayedTasks.forEach((task) => {
    const rentalId = task.rental_task_cards?.rental_task_lists?.rental_id ?? 'unknown';
    const projectTitle = task.rental_task_cards?.rental_task_lists?.title || 'Projet sans titre';
    if (!seen.has(rentalId)) {
      const group: GroupedProject = { rental_id: rentalId, project_title: projectTitle, tasks: [] };
      seen.set(rentalId, group);
      grouped.push(group);
    }
    seen.get(rentalId)!.tasks.push(task);
  });

  const checkedCount = tasks.filter((t) => t.is_checked).length;
  const totalCount = tasks.length;

  return (
    <MobileLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Mes tâches</h1>
        <span className="text-sm text-gray-500">{checkedCount}/{totalCount}</span>
      </div>

      {/* Toggle all */}
      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-blue-600 font-medium mb-4"
      >
        <CheckSquare className="h-4 w-4" />
        {showAll ? 'Masquer les terminées' : 'Tout voir'}
      </button>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Chargement...</div>
      ) : grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <CheckCircle2 className="h-10 w-10 text-gray-300" />
          <p className="text-gray-400 text-sm">
            {showAll ? 'Aucune tâche assignée' : 'Toutes les tâches sont terminées'}
          </p>
          {!showAll && tasks.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-sm text-blue-600 underline"
            >
              Voir les tâches terminées
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map((group) => {
            const isCollapsed = collapsedGroups.has(group.rental_id);
            const doneCount = group.tasks.filter((t) => t.is_checked).length;
            return (
              <div key={group.rental_id} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.rental_id)}
                  className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-100"
                >
                  <div className="text-left">
                    <p className="font-semibold text-gray-900 text-sm">{group.project_title}</p>
                    <p className="text-xs text-gray-400">{doneCount}/{group.tasks.length} terminées</p>
                  </div>
                  {isCollapsed ? (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  )}
                </button>
                {!isCollapsed && (
                  <div>
                    {group.tasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => toggleTask(task)}
                        disabled={togglingId === task.id}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-100 last:border-0 active:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        {task.is_checked ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                        ) : (
                          <Circle className="h-5 w-5 text-gray-300 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${task.is_checked ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                            {task.title}
                          </p>
                          {task.rental_task_cards?.title && (
                            <p className="text-xs text-gray-400 truncate">{task.rental_task_cards.title}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </MobileLayout>
  );
};

export default MobileTasks;
