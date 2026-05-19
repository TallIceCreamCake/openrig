import React from 'react';
import { createPortal } from 'react-dom';
import { Calendar, CalendarClock, Check, Copy, File, Folder, MessageSquare, Minus, MoreHorizontal, Paperclip, Pencil, Plus, Send, SlidersHorizontal, Trash2, X, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Rental } from '../../types/rental';
import { Button, ColorPickerButton } from '../ui-kit';
import RentalFileExplorerModal, { type DossierEntry, getFileIcon, formatFileSize } from './RentalFileExplorerModal';

type Props = {
  rental: Rental;
  onLog?: (action: string, details?: string, metadata?: Record<string, unknown> | null) => void;
};

type RentalTaskCardRow = {
  id: string;
  rental_id: string;
  name: string;
  base_color: string | null;
  sort_order: number;
  created_by: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
};

type RentalTaskCardItemRow = {
  id: string;
  card_id: string;
  title: string;
  description: string;
  base_color: string | null;
  check_state: string | null;
  is_completed: boolean;
  sort_order: number;
  starts_at: string | null;
  due_at: string | null;
  created_by: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
};

type TaskComment = {
  id: string;
  item_id: string;
  user_id: string | null;
  user_name: string;
  content: string;
  created_at: string;
  updated_at: string;
};

type AppUserRow = {
  id: string;
  full_name: string | null;
  email: string;
};

type TaskAttachment = {
  id: string;
  task_item_id: string;
  dossier_entry_id: string;
  created_at: string;
  entry: DossierEntry;
};

const userInitials = (name: string | null, email: string) => {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
};

type DropPosition = 'before' | 'after' | 'end';
type TaskCheckState = 'empty' | 'red' | 'orange' | 'green';

const DEFAULT_BASE_COLOR = '#6366f1';
const DEFAULT_CHECK_COLOR = '#2563eb';
const PASTEL_PRESETS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];

const normalizeHexColor = (value: string | null | undefined, fallback = DEFAULT_BASE_COLOR) => {
  if (!value) return fallback;
  const raw = value.trim();
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const [r, g, b] = withHash.slice(1).split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) return withHash.toLowerCase();
  return fallback;
};

const hexToRgb = (hex: string) => {
  const normalized = normalizeHexColor(hex);
  const base = normalized.slice(1);
  return {
    r: parseInt(base.slice(0, 2), 16),
    g: parseInt(base.slice(2, 4), 16),
    b: parseInt(base.slice(4, 6), 16),
  };
};

const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const rgbToHex = (r: number, g: number, b: number) =>
  `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;

const mixHex = (baseHex: string, targetHex: string, weight: number) => {
  const w = Math.max(0, Math.min(1, weight));
  const base = hexToRgb(baseHex);
  const target = hexToRgb(targetHex);
  return rgbToHex(
    base.r + (target.r - base.r) * w,
    base.g + (target.g - base.g) * w,
    base.b + (target.b - base.b) * w,
  );
};

const luminance = (hex: string) => {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const pastelSurface = (baseHex: string, isDarkMode: boolean) => {
  const normalized = normalizeHexColor(baseHex);
  if (isDarkMode) {
    return mixHex(mixHex(normalized, '#0f172a', 0.62), '#1e293b', 0.24);
  }
  return mixHex(mixHex(normalized, '#ffffff', 0.68), '#f8fafc', 0.2);
};

const pastelBorder = (baseHex: string, isDarkMode: boolean) => {
  const surface = pastelSurface(baseHex, isDarkMode);
  return isDarkMode ? mixHex(surface, '#ffffff', 0.2) : mixHex(surface, '#000000', 0.14);
};

const menuItemBaseClass = 'flex w-full !cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100';

const sortCards = (left: RentalTaskCardRow, right: RentalTaskCardRow) => {
  if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
  return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
};

const sortItems = (left: RentalTaskCardItemRow, right: RentalTaskCardItemRow) => {
  if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
  return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
};

const itemAccentColor = (baseColor: string | null | undefined) => {
  if (!baseColor) return '#cbd5e1';
  return normalizeHexColor(baseColor, DEFAULT_BASE_COLOR);
};

const normalizeCheckState = (value: string | null | undefined, isCompleted = false): TaskCheckState => {
  if (value === 'empty' || value === 'red' || value === 'orange' || value === 'green') return value;
  return isCompleted ? 'green' : 'empty';
};

const timeAgo = (value: string) => {
  const diff = Date.now() - new Date(value).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "A l'instant";
  if (m < 60) return `Il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Il y a ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `Il y a ${d}j`;
  return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
};

const isPastDate = (value: string | null | undefined) => {
  if (!value) return false;
  return new Date(value) < new Date();
};

const isApproachingDate = (value: string | null | undefined) => {
  if (!value) return false;
  const diff = new Date(value).getTime() - Date.now();
  return diff > 0 && diff <= 60 * 60 * 1000;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getDefaultItemMap = (cardIds: string[]) => cardIds.reduce<Record<string, RentalTaskCardItemRow[]>>((acc, cardId) => {
  acc[cardId] = [];
  return acc;
}, {});

const RentalTasksPanel: React.FC<Props> = ({ rental, onLog }) => {
  const { user } = useAuth();
  const actorName = user?.full_name || user?.email || 'Systeme';

  const [cards, setCards] = React.useState<RentalTaskCardRow[]>([]);
  const [itemsByCardId, setItemsByCardId] = React.useState<Record<string, RentalTaskCardItemRow[]>>({});
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState('');
  const [openMenu, setOpenMenu] = React.useState<{ cardId: string; left: number; top: number } | null>(null);
  const [openItemMenu, setOpenItemMenu] = React.useState<{ cardId: string; itemId: string; left: number; top: number } | null>(null);
  const [isDarkMode, setIsDarkMode] = React.useState(false);
  const [customizingCard, setCustomizingCard] = React.useState<RentalTaskCardRow | null>(null);
  const [baseColorDraft, setBaseColorDraft] = React.useState(DEFAULT_BASE_COLOR);
  const [addingItemCardId, setAddingItemCardId] = React.useState<string | null>(null);
  const [itemTitleDraft, setItemTitleDraft] = React.useState('');
  const [editingItem, setEditingItem] = React.useState<{ cardId: string; itemId: string } | null>(null);
  const [detailsItem, setDetailsItem] = React.useState<{ cardId: string; itemId: string } | null>(null);
  const [editingItemTitle, setEditingItemTitle] = React.useState('');
  const [editingItemDescription, setEditingItemDescription] = React.useState('');
  const [editingItemBaseColor, setEditingItemBaseColor] = React.useState(DEFAULT_BASE_COLOR);
  const [editingItemStartsAt, setEditingItemStartsAt] = React.useState('');
  const [editingItemDueAt, setEditingItemDueAt] = React.useState('');
  const [showItemInfo, setShowItemInfo] = React.useState(false);
  const [itemComments, setItemComments] = React.useState<TaskComment[]>([]);
  const [loadingComments, setLoadingComments] = React.useState(false);
  const [commentDraft, setCommentDraft] = React.useState('');
  const [postingComment, setPostingComment] = React.useState(false);
  const [savingItemCardId, setSavingItemCardId] = React.useState<string | null>(null);
  const [togglingItemIds, setTogglingItemIds] = React.useState<Record<string, boolean>>({});
  const [hoveredItemId, setHoveredItemId] = React.useState<string | null>(null);
  const [draggedItem, setDraggedItem] = React.useState<{ cardId: string; itemId: string } | null>(null);
  const [dropPreview, setDropPreview] = React.useState<{ cardId: string; itemId: string | null; position: DropPosition } | null>(null);

  // Assignees
  const [users, setUsers] = React.useState<AppUserRow[]>([]);
  const [itemAssignees, setItemAssignees] = React.useState<Record<string, string[]>>({});
  const [editingItemAssignees, setEditingItemAssignees] = React.useState<string[]>([]);
  const [assigneeSearch, setAssigneeSearch] = React.useState('');

  // Pièces jointes
  const [itemAttachments, setItemAttachments] = React.useState<TaskAttachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = React.useState(false);
  const [showAttachmentPicker, setShowAttachmentPicker] = React.useState(false);

  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const update = () => setIsDarkMode(root.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!openMenu && !openItemMenu) return undefined;
    const closeMenus = () => {
      setOpenMenu(null);
      setOpenItemMenu(null);
    };
    window.addEventListener('resize', closeMenus);
    window.addEventListener('scroll', closeMenus, true);
    return () => {
      window.removeEventListener('resize', closeMenus);
      window.removeEventListener('scroll', closeMenus, true);
    };
  }, [openMenu, openItemMenu]);

  const fetchCards = React.useCallback(async () => {
    if (!rental?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('rental_task_cards')
        .select('id, rental_id, name, base_color, sort_order, created_by, created_by_name, created_at, updated_at')
        .eq('rental_id', rental.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;

      const cardRows = ((data as RentalTaskCardRow[] | null) || []).slice().sort(sortCards);
      setCards(cardRows);

      if (cardRows.length === 0) {
        setItemsByCardId({});
        return;
      }

      const cardIds = cardRows.map((card) => card.id);
      const { data: itemsData, error: itemsError } = await supabase
        .from('rental_task_card_items')
        .select('id, card_id, title, description, base_color, check_state, is_completed, sort_order, starts_at, due_at, created_by, created_by_name, created_at, updated_at')
        .in('card_id', cardIds)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (itemsError) throw itemsError;

      const nextMap = getDefaultItemMap(cardIds);
      const allItemIds: string[] = [];
      for (const rawItem of ((itemsData as RentalTaskCardItemRow[] | null) || [])) {
        if (!nextMap[rawItem.card_id]) nextMap[rawItem.card_id] = [];
        nextMap[rawItem.card_id].push({
          ...rawItem,
          check_state: normalizeCheckState(rawItem.check_state, rawItem.is_completed),
          is_completed: normalizeCheckState(rawItem.check_state, rawItem.is_completed) === 'green',
        });
        allItemIds.push(rawItem.id);
      }
      for (const cardId of Object.keys(nextMap)) {
        nextMap[cardId] = nextMap[cardId].slice().sort(sortItems);
      }
      setItemsByCardId(nextMap);

      if (allItemIds.length > 0) {
        const { data: assigneesData } = await supabase
          .from('rental_task_card_item_assignees')
          .select('item_id, user_id')
          .in('item_id', allItemIds);
        const nextAssignees: Record<string, string[]> = {};
        for (const row of ((assigneesData as Array<{ item_id: string; user_id: string }> | null) || [])) {
          if (!nextAssignees[row.item_id]) nextAssignees[row.item_id] = [];
          nextAssignees[row.item_id].push(row.user_id);
        }
        setItemAssignees(nextAssignees);
      } else {
        setItemAssignees({});
      }
    } catch (error) {
      console.error('load cards', error);
      toast.error('Impossible de charger les cards.');
    } finally {
      setLoading(false);
    }
  }, [rental?.id]);

  React.useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  React.useEffect(() => {
    supabase.from('app_users').select('id, full_name, email').order('full_name').then(({ data }) => {
      if (data) setUsers(data as AppUserRow[]);
    });
  }, []);

  React.useEffect(() => {
    if (!detailsItem) { setItemComments([]); setCommentDraft(''); return; }
    setLoadingComments(true);
    supabase
      .from('rental_task_card_item_comments')
      .select('id, item_id, user_id, user_name, content, created_at, updated_at')
      .eq('item_id', detailsItem.itemId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setItemComments((data as TaskComment[]) || []);
        setLoadingComments(false);
      });
  }, [detailsItem?.itemId]);

  React.useEffect(() => {
    if (!detailsItem) { setItemAttachments([]); return; }
    setLoadingAttachments(true);
    supabase
      .from('rental_task_item_attachments')
      .select('id, task_item_id, dossier_entry_id, created_at, entry:rental_dossier_entries(id, rental_id, parent_id, entry_type, name, file_url, file_name, file_type, file_size, color, icon, created_at)')
      .eq('task_item_id', detailsItem.itemId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setItemAttachments((data || []) as unknown as TaskAttachment[]);
        setLoadingAttachments(false);
      });
  }, [detailsItem?.itemId]);

  const attachEntry = async (itemId: string, entry: DossierEntry) => {
    const already = itemAttachments.some((a) => a.dossier_entry_id === entry.id);
    if (already) { toast('Déjà attaché'); setShowAttachmentPicker(false); return; }
    try {
      const { data, error } = await supabase
        .from('rental_task_item_attachments')
        .insert({ task_item_id: itemId, dossier_entry_id: entry.id })
        .select('id, task_item_id, dossier_entry_id, created_at')
        .single();
      if (error) throw error;
      setItemAttachments((prev) => [...prev, { ...(data as any), entry }]);
      setShowAttachmentPicker(false);
      toast.success('Fichier lié à la tâche');
    } catch {
      toast.error('Impossible de lier le fichier');
    }
  };

  const detachEntry = async (attachmentId: string) => {
    try {
      const { error } = await supabase.from('rental_task_item_attachments').delete().eq('id', attachmentId);
      if (error) throw error;
      setItemAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch {
      toast.error('Impossible de retirer le fichier');
    }
  };

  const postComment = async (itemId: string) => {
    const content = commentDraft.trim();
    if (!content) return;
    setPostingComment(true);
    try {
      const { data, error } = await supabase
        .from('rental_task_card_item_comments')
        .insert([{ item_id: itemId, user_id: user?.id || null, user_name: actorName, content }])
        .select('id, item_id, user_id, user_name, content, created_at, updated_at')
        .single();
      if (error) throw error;
      setItemComments((prev) => [...prev, data as TaskComment]);
      setCommentDraft('');
    } catch (e) {
      toast.error('Impossible d\'envoyer le commentaire.');
    } finally {
      setPostingComment(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    setItemComments((prev) => prev.filter((c) => c.id !== commentId));
    await supabase.from('rental_task_card_item_comments').delete().eq('id', commentId);
  };

  const createCard = async () => {
    if (!rental?.id) return;
    setCreating(true);
    try {
      const nextSort = cards.reduce((max, card) => Math.max(max, card.sort_order), 0) + 10;
      const { data, error } = await supabase
        .from('rental_task_cards')
        .insert([{
          rental_id: rental.id,
          name: `Card ${cards.length + 1}`,
          base_color: null,
          sort_order: nextSort,
          created_by: user?.id || null,
          created_by_name: actorName,
        }])
        .select('id, rental_id, name, base_color, sort_order, created_by, created_by_name, created_at, updated_at')
        .single();
      if (error) throw error;

      const created = data as RentalTaskCardRow;
      setCards((prev) => [...prev, created].slice().sort(sortCards));
      setItemsByCardId((prev) => ({ ...prev, [created.id]: [] }));
      setEditingId(created.id);
      setEditingName(created.name);
      onLog?.('task_card_created', created.name, { card_id: created.id });
    } catch (error) {
      console.error('create card', error);
      toast.error('Impossible de creer la card.');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (card: RentalTaskCardRow) => {
    setEditingId(card.id);
    setEditingName(card.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const saveEdit = async (card: RentalTaskCardRow) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      toast.error('Le nom est requis.');
      return;
    }

    if (trimmed === card.name) {
      cancelEdit();
      return;
    }

    try {
      const { error } = await supabase
        .from('rental_task_cards')
        .update({ name: trimmed })
        .eq('id', card.id);
      if (error) throw error;

      setCards((prev) => prev.map((entry) => (
        entry.id === card.id ? { ...entry, name: trimmed } : entry
      )));
      onLog?.('task_card_renamed', `${card.name} -> ${trimmed}`, { card_id: card.id });
      cancelEdit();
    } catch (error) {
      console.error('rename card', error);
      toast.error('Impossible de renommer la card.');
    }
  };

  const deleteCard = async (card: RentalTaskCardRow) => {
    if (!window.confirm(`Supprimer la card "${card.name}" ?`)) return;
    try {
      const { error } = await supabase
        .from('rental_task_cards')
        .delete()
        .eq('id', card.id);
      if (error) throw error;

      setCards((prev) => prev.filter((entry) => entry.id !== card.id));
      setItemsByCardId((prev) => {
        const { [card.id]: _ignored, ...rest } = prev;
        return rest;
      });
      if (editingId === card.id) cancelEdit();
      if (addingItemCardId === card.id) {
        setAddingItemCardId(null);
        setItemTitleDraft('');
      }
      if (editingItem?.cardId === card.id) {
        setEditingItem(null);
        setEditingItemTitle('');
        setEditingItemDescription('');
        setEditingItemBaseColor(DEFAULT_BASE_COLOR);
        setEditingItemStartsAt('');
        setEditingItemDueAt('');
      }
      if (detailsItem?.cardId === card.id) {
        setDetailsItem(null);
      }
      onLog?.('task_card_deleted', card.name, { card_id: card.id });
    } catch (error) {
      console.error('delete card', error);
      toast.error('Impossible de supprimer la card.');
    }
  };

  const duplicateCard = async (card: RentalTaskCardRow) => {
    try {
      const nextSort = cards.reduce((max, entry) => Math.max(max, entry.sort_order), 0) + 10;
      const duplicatedName = `${card.name} (copie)`;
      const { data, error } = await supabase
        .from('rental_task_cards')
        .insert([{
          rental_id: rental.id,
          name: duplicatedName,
          base_color: card.base_color,
          sort_order: nextSort,
          created_by: user?.id || null,
          created_by_name: actorName,
        }])
        .select('id, rental_id, name, base_color, sort_order, created_by, created_by_name, created_at, updated_at')
        .single();
      if (error) throw error;

      const created = data as RentalTaskCardRow;
      const sourceItems = (itemsByCardId[card.id] || []).slice().sort(sortItems);
      let copiedItems: RentalTaskCardItemRow[] = [];

      if (sourceItems.length > 0) {
        const payload = sourceItems.map((item, index) => ({
          card_id: created.id,
          title: item.title,
          description: item.description || '',
          base_color: item.base_color,
          check_state: normalizeCheckState(item.check_state, item.is_completed),
          is_completed: item.is_completed,
          sort_order: item.sort_order || (index + 1) * 10,
          created_by: user?.id || null,
          created_by_name: actorName,
        }));
        const { data: copiedData, error: copyError } = await supabase
          .from('rental_task_card_items')
          .insert(payload)
          .select('id, card_id, title, description, base_color, check_state, is_completed, sort_order, starts_at, due_at, created_by, created_by_name, created_at, updated_at')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });
        if (copyError) {
          console.error('duplicate card items', copyError);
          toast.error('Card dupliquee, mais sans copier les elements.');
        } else {
          copiedItems = (((copiedData as RentalTaskCardItemRow[] | null) || []).map((entry) => {
            const state = normalizeCheckState(entry.check_state, entry.is_completed);
            return {
              ...entry,
              check_state: state,
              is_completed: state === 'green',
            };
          })).slice().sort(sortItems);
        }
      }

      setCards((prev) => [...prev, created].slice().sort(sortCards));
      setItemsByCardId((prev) => ({ ...prev, [created.id]: copiedItems }));
      onLog?.('task_card_duplicated', `${card.name} -> ${duplicatedName}`, { card_id: card.id, duplicated_card_id: created.id });
      setOpenMenu(null);
    } catch (error) {
      console.error('duplicate card', error);
      toast.error('Impossible de dupliquer la card.');
    }
  };

  const openCustomize = (card: RentalTaskCardRow) => {
    setCustomizingCard(card);
    setBaseColorDraft(normalizeHexColor(card.base_color || DEFAULT_BASE_COLOR));
    setOpenMenu(null);
    setOpenItemMenu(null);
  };

  const openCardMenu = (cardId: string, anchorEl: HTMLButtonElement) => {
    const rect = anchorEl.getBoundingClientRect();
    const menuWidth = 208;
    const menuHeight = 164;
    const viewportPadding = 8;
    const left = Math.max(
      viewportPadding,
      Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding),
    );
    const gap = 6;
    let top = rect.bottom + gap;
    if (top + menuHeight > window.innerHeight - viewportPadding) {
      top = Math.max(viewportPadding, rect.top - menuHeight - gap);
    }
    setOpenItemMenu(null);
    setOpenMenu((prev) => (prev?.cardId === cardId ? null : { cardId, left, top }));
  };

  const openItemContextMenu = (cardId: string, itemId: string, anchorEl: HTMLButtonElement) => {
    const rect = anchorEl.getBoundingClientRect();
    const menuWidth = 224;
    const menuHeight = 148;
    const viewportPadding = 8;
    const left = Math.max(
      viewportPadding,
      Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding),
    );
    const gap = 6;
    let top = rect.bottom + gap;
    if (top + menuHeight > window.innerHeight - viewportPadding) {
      top = Math.max(viewportPadding, rect.top - menuHeight - gap);
    }
    setOpenMenu(null);
    setOpenItemMenu((prev) => (prev?.itemId === itemId ? null : {
      cardId,
      itemId,
      left,
      top,
    }));
  };

  const saveCustomization = async () => {
    if (!customizingCard) return;
    const normalized = normalizeHexColor(baseColorDraft);
    try {
      const { error } = await supabase
        .from('rental_task_cards')
        .update({ base_color: normalized })
        .eq('id', customizingCard.id);
      if (error) throw error;

      setCards((prev) => prev.map((entry) => (
        entry.id === customizingCard.id ? { ...entry, base_color: normalized } : entry
      )));
      onLog?.('task_card_updated', `${customizingCard.name} - couleur modifiee`, { card_id: customizingCard.id, base_color: normalized });
      setCustomizingCard(null);
    } catch (error) {
      console.error('save card customization', error);
      toast.error('Impossible de modifier la card.');
    }
  };

  const openNewItemForm = (cardId: string) => {
    setOpenItemMenu(null);
    setAddingItemCardId((prev) => (prev === cardId ? null : cardId));
    setItemTitleDraft('');
  };

  const saveNewItem = async (card: RentalTaskCardRow) => {
    const title = itemTitleDraft.trim();
    if (!title) {
      toast.error('Le titre de l element est requis.');
      return;
    }
    setSavingItemCardId(card.id);
    try {
      const cardItems = itemsByCardId[card.id] || [];
      const nextSort = cardItems.reduce((max, item) => Math.max(max, item.sort_order), 0) + 10;
      const { data, error } = await supabase
        .from('rental_task_card_items')
        .insert([{
          card_id: card.id,
          title,
          description: '',
          base_color: null,
          check_state: 'empty',
          is_completed: false,
          sort_order: nextSort,
          created_by: user?.id || null,
          created_by_name: actorName,
        }])
        .select('id, card_id, title, description, base_color, check_state, is_completed, sort_order, starts_at, due_at, created_by, created_by_name, created_at, updated_at')
        .single();
      if (error) throw error;

      const createdRaw = data as RentalTaskCardItemRow;
      const createdState = normalizeCheckState(createdRaw.check_state, createdRaw.is_completed);
      const created = { ...createdRaw, check_state: createdState, is_completed: createdState === 'green' };
      setItemsByCardId((prev) => ({
        ...prev,
        [card.id]: [...(prev[card.id] || []), created].slice().sort(sortItems),
      }));
      setAddingItemCardId(null);
      setItemTitleDraft('');
      onLog?.('task_card_item_created', created.title, { card_id: card.id, item_id: created.id });
    } catch (error) {
      console.error('create card item', error);
      toast.error('Impossible d ajouter l element.');
    } finally {
      setSavingItemCardId(null);
    }
  };

  const nextCheckState = (state: TaskCheckState): TaskCheckState => {
    if (state === 'empty') return 'red';
    if (state === 'red') return 'orange';
    if (state === 'orange') return 'green';
    return 'empty';
  };

  const setItemCheckState = async (card: RentalTaskCardRow, item: RentalTaskCardItemRow, nextState: TaskCheckState) => {
    const previousState = normalizeCheckState(item.check_state, item.is_completed);
    const nextIsCompleted = nextState === 'green';
    if (previousState === nextState) return;

    setItemsByCardId((prev) => ({
      ...prev,
      [card.id]: (prev[card.id] || []).map((entry) => (
        entry.id === item.id ? { ...entry, check_state: nextState, is_completed: nextIsCompleted } : entry
      )),
    }));
    setTogglingItemIds((prev) => ({ ...prev, [item.id]: true }));
    try {
      const { error } = await supabase
        .from('rental_task_card_items')
        .update({ check_state: nextState, is_completed: nextIsCompleted })
        .eq('id', item.id);
      if (error) throw error;
      onLog?.('task_card_item_check_state_updated', item.title, { card_id: card.id, item_id: item.id, check_state: nextState, is_completed: nextIsCompleted });
    } catch (error) {
      console.error('update card item check_state', error);
      setItemsByCardId((prev) => ({
        ...prev,
        [card.id]: (prev[card.id] || []).map((entry) => (
          entry.id === item.id ? { ...entry, check_state: previousState, is_completed: previousState === 'green' } : entry
        )),
      }));
      toast.error('Impossible de mettre a jour cet element.');
    } finally {
      setTogglingItemIds((prev) => {
        const { [item.id]: _ignored, ...rest } = prev;
        return rest;
      });
    }
  };

  const openItemDetails = (cardId: string, itemId: string) => {
    setOpenMenu(null);
    setOpenItemMenu(null);
    setDetailsItem({ cardId, itemId });
  };

  const checkStateLabel = (state: TaskCheckState) => {
    if (state === 'red') return 'Rouge (croix)';
    if (state === 'orange') return 'Orange (barre)';
    if (state === 'green') return 'Valide (vert)';
    return 'Vide';
  };

  const getCheckStateVisual = (state: TaskCheckState, greenColor: string) => {
    if (state === 'red') {
      return {
        borderColor: '#ef4444',
        backgroundColor: '#ef4444',
        textColor: '#ffffff',
        icon: <X className="h-3.5 w-3.5" />,
      };
    }
    if (state === 'orange') {
      return {
        borderColor: '#f59e0b',
        backgroundColor: '#f59e0b',
        textColor: '#ffffff',
        icon: <Minus className="h-3.5 w-3.5" />,
      };
    }
    if (state === 'green') {
      return {
        borderColor: greenColor,
        backgroundColor: greenColor,
        textColor: '#ffffff',
        icon: <Check className="h-3.5 w-3.5" />,
      };
    }
    return {
      borderColor: '#cbd5e1',
      backgroundColor: '#ffffff',
      textColor: 'transparent',
      icon: <span className="h-3.5 w-3.5" aria-hidden />,
    };
  };

  const deleteItem = async (card: RentalTaskCardRow, item: RentalTaskCardItemRow) => {
    if (!window.confirm(`Supprimer l element "${item.title}" ?`)) return;
    try {
      const { error } = await supabase
        .from('rental_task_card_items')
        .delete()
        .eq('id', item.id);
      if (error) throw error;

      setItemsByCardId((prev) => ({
        ...prev,
        [card.id]: (prev[card.id] || []).filter((entry) => entry.id !== item.id),
      }));
      if (editingItem?.itemId === item.id) {
        setEditingItem(null);
        setEditingItemTitle('');
        setEditingItemDescription('');
        setEditingItemBaseColor(DEFAULT_BASE_COLOR);
        setEditingItemStartsAt('');
        setEditingItemDueAt('');
      }
      if (detailsItem?.itemId === item.id) {
        setDetailsItem(null);
      }
      onLog?.('task_card_item_deleted', item.title, { card_id: card.id, item_id: item.id });
    } catch (error) {
      console.error('delete card item', error);
      toast.error('Impossible de supprimer cet element.');
    }
  };

  const duplicateItem = async (card: RentalTaskCardRow, item: RentalTaskCardItemRow) => {
    try {
      const cardItems = itemsByCardId[card.id] || [];
      const nextSort = cardItems.reduce((max, entry) => Math.max(max, entry.sort_order), 0) + 10;
      const { data, error } = await supabase
        .from('rental_task_card_items')
        .insert([{
          card_id: card.id,
          title: `${item.title} (copie)`,
          description: item.description || '',
          base_color: item.base_color,
          check_state: 'empty',
          is_completed: false,
          sort_order: nextSort,
          created_by: user?.id || null,
          created_by_name: actorName,
        }])
        .select('id, card_id, title, description, base_color, check_state, is_completed, sort_order, starts_at, due_at, created_by, created_by_name, created_at, updated_at')
        .single();
      if (error) throw error;

      const createdRaw = data as RentalTaskCardItemRow;
      const createdState = normalizeCheckState(createdRaw.check_state, createdRaw.is_completed);
      const created = { ...createdRaw, check_state: createdState, is_completed: createdState === 'green' };
      setItemsByCardId((prev) => ({
        ...prev,
        [card.id]: [...(prev[card.id] || []), created].slice().sort(sortItems),
      }));
      onLog?.('task_card_item_duplicated', `${item.title} -> ${created.title}`, { card_id: card.id, item_id: item.id, duplicated_item_id: created.id });
    } catch (error) {
      console.error('duplicate card item', error);
      toast.error('Impossible de dupliquer cet element.');
    }
  };

  const startEditItem = (card: RentalTaskCardRow, item: RentalTaskCardItemRow) => {
    setEditingItem({ cardId: card.id, itemId: item.id });
    setEditingItemTitle(item.title);
    setEditingItemDescription(item.description || '');
    setEditingItemBaseColor(normalizeHexColor(item.base_color || DEFAULT_BASE_COLOR));
    setEditingItemStartsAt(item.starts_at || '');
    setEditingItemDueAt(item.due_at || '');
    setEditingItemAssignees(itemAssignees[item.id] || []);
    setAssigneeSearch('');
    setOpenItemMenu(null);
  };

  const saveEditedItem = async () => {
    if (!editingItem) return;
    const title = editingItemTitle.trim();
    if (!title) {
      toast.error('Le titre est requis.');
      return;
    }
    const description = editingItemDescription.trim();
    const baseColor = normalizeHexColor(editingItemBaseColor || DEFAULT_BASE_COLOR);
    const startsAt = editingItemStartsAt || null;
    const dueAt = editingItemDueAt || null;

    try {
      const { error } = await supabase
        .from('rental_task_card_items')
        .update({ title, description, base_color: baseColor, starts_at: startsAt, due_at: dueAt })
        .eq('id', editingItem.itemId);
      if (error) throw error;

      // Sync assignees: delete all then re-insert
      await supabase.from('rental_task_card_item_assignees').delete().eq('item_id', editingItem.itemId);
      if (editingItemAssignees.length > 0) {
        await supabase.from('rental_task_card_item_assignees').insert(
          editingItemAssignees.map((uid) => ({
            item_id: editingItem.itemId,
            user_id: uid,
            assigned_by: user?.id || null,
            assigned_by_name: actorName,
          }))
        );
      }

      setItemsByCardId((prev) => ({
        ...prev,
        [editingItem.cardId]: (prev[editingItem.cardId] || []).map((entry) => (
          entry.id === editingItem.itemId ? { ...entry, title, description, base_color: baseColor, starts_at: startsAt, due_at: dueAt } : entry
        )),
      }));
      setItemAssignees((prev) => ({ ...prev, [editingItem.itemId]: [...editingItemAssignees] }));
      onLog?.('task_card_item_updated', title, { card_id: editingItem.cardId, item_id: editingItem.itemId, base_color: baseColor, assignee_count: editingItemAssignees.length });
      const saved = editingItem;
      setEditingItem(null);
      setEditingItemTitle('');
      setEditingItemDescription('');
      setEditingItemBaseColor(DEFAULT_BASE_COLOR);
      setEditingItemStartsAt('');
      setEditingItemDueAt('');
      setEditingItemAssignees([]);
      setDetailsItem({ cardId: saved.cardId, itemId: saved.itemId });
    } catch (error) {
      console.error('update card item', error);
      toast.error('Impossible de modifier cet element.');
    }
  };

  const handleItemDragStart = (event: React.DragEvent<HTMLElement>, cardId: string, itemId: string) => {
    setOpenMenu(null);
    setOpenItemMenu(null);
    setDraggedItem({ cardId, itemId });
    setDropPreview(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', itemId);
  };

  const handleItemDragEnd = () => {
    setDraggedItem(null);
    setDropPreview(null);
  };

  const normalizeCardItems = (items: RentalTaskCardItemRow[], cardId: string) => (
    items.map((item, index) => ({
      ...item,
      card_id: cardId,
      sort_order: (index + 1) * 10,
    }))
  );

  const persistItemOrdering = async (
    nextMap: Record<string, RentalTaskCardItemRow[]>,
    affectedCardIds: string[],
  ) => {
    const payload = affectedCardIds.flatMap((cardId) => (
      (nextMap[cardId] || []).map((item, index) => ({
        id: item.id,
        card_id: cardId,
        sort_order: (index + 1) * 10,
      }))
    ));
    const updates = await Promise.all(
      payload.map((entry) => supabase
        .from('rental_task_card_items')
        .update({ card_id: entry.card_id, sort_order: entry.sort_order })
        .eq('id', entry.id)),
    );
    const failed = updates.find((result) => result.error);
    if (failed?.error) throw failed.error;
  };

  const moveDraggedItem = async (
    targetCardId: string,
    targetItemId: string | null,
    position: DropPosition,
  ) => {
    if (!draggedItem) return;
    const sourceCardId = draggedItem.cardId;
    const draggedItemId = draggedItem.itemId;
    const previousMap = itemsByCardId;
    const sourceItemsOriginal = previousMap[sourceCardId] || [];
    const dragged = sourceItemsOriginal.find((item) => item.id === draggedItemId);
    if (!dragged) {
      setDraggedItem(null);
      setDropPreview(null);
      return;
    }

    const sourceWithoutDragged = sourceItemsOriginal.filter((item) => item.id !== draggedItemId);
    const targetBase = sourceCardId === targetCardId ? sourceWithoutDragged : [...(previousMap[targetCardId] || [])];

    let insertIndex = targetBase.length;
    if (targetItemId) {
      const targetIndex = targetBase.findIndex((item) => item.id === targetItemId);
      if (targetIndex !== -1) {
        insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
      }
    } else if (position === 'end') {
      insertIndex = targetBase.length;
    }

    const targetNext = [...targetBase];
    targetNext.splice(insertIndex, 0, { ...dragged, card_id: targetCardId });

    if (sourceCardId === targetCardId) {
      const before = sourceItemsOriginal.map((item) => item.id).join('|');
      const after = targetNext.map((item) => item.id).join('|');
      if (before === after) {
        setDraggedItem(null);
        setDropPreview(null);
        return;
      }
    }

    const nextMap = { ...previousMap };
    nextMap[targetCardId] = normalizeCardItems(targetNext, targetCardId);
    if (sourceCardId !== targetCardId) {
      nextMap[sourceCardId] = normalizeCardItems(sourceWithoutDragged, sourceCardId);
    }

    setItemsByCardId(nextMap);
    setDraggedItem(null);
    setDropPreview(null);

    try {
      await persistItemOrdering(nextMap, sourceCardId === targetCardId ? [sourceCardId] : [sourceCardId, targetCardId]);
      onLog?.('task_card_item_moved', dragged.title, {
        item_id: dragged.id,
        from_card_id: sourceCardId,
        to_card_id: targetCardId,
      });
    } catch (error) {
      console.error('move card item', error);
      setItemsByCardId(previousMap);
      toast.error('Impossible de deplacer cet element.');
    }
  };

  const handleItemDragOver = (
    event: React.DragEvent<HTMLElement>,
    cardId: string,
    itemId: string,
  ) => {
    if (!draggedItem) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const position: DropPosition = event.clientY >= rect.top + rect.height / 2 ? 'after' : 'before';
    setDropPreview((prev) => (
      prev?.cardId === cardId && prev?.itemId === itemId && prev?.position === position
        ? prev
        : { cardId, itemId, position }
    ));
  };

  const handleItemDrop = async (
    event: React.DragEvent<HTMLElement>,
    cardId: string,
    itemId: string,
  ) => {
    if (!draggedItem) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const position: DropPosition = event.clientY >= rect.top + rect.height / 2 ? 'after' : 'before';
    await moveDraggedItem(cardId, itemId, position);
  };

  const handleCardBodyDragOver = (event: React.DragEvent<HTMLElement>, cardId: string) => {
    if (!draggedItem) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const target = event.target as HTMLElement;
    if (target.closest('[data-task-item-id]')) return;
    setDropPreview((prev) => (
      prev?.cardId === cardId && prev?.itemId === null && prev?.position === 'end'
        ? prev
        : { cardId, itemId: null, position: 'end' }
    ));
  };

  const handleCardBodyDrop = async (event: React.DragEvent<HTMLElement>, cardId: string) => {
    if (!draggedItem) return;
    event.preventDefault();
    const target = event.target as HTMLElement;
    if (target.closest('[data-task-item-id]')) return;
    await moveDraggedItem(cardId, null, 'end');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-20rem)] overflow-x-auto pb-2">
      <div className="flex min-w-max items-start gap-4">
        {cards.slice().sort(sortCards).map((card) => {
          const cardSurface = card.base_color ? pastelSurface(card.base_color, isDarkMode) : '#f8fafc';
          const cardBorder = card.base_color ? pastelBorder(card.base_color, isDarkMode) : '#e2e8f0';
          const titleColor = card.base_color && luminance(cardSurface) < 0.45 ? '#f1f5f9' : '#0f172a';
          const checkboxColor = normalizeHexColor(card.base_color || DEFAULT_CHECK_COLOR, DEFAULT_CHECK_COLOR);
          const cardItems = (itemsByCardId[card.id] || []).slice().sort(sortItems);
          const addingItem = addingItemCardId === card.id;
          const hasItems = cardItems.length > 0;
          const isDropEndHere = dropPreview?.cardId === card.id && dropPreview?.itemId === null && dropPreview?.position === 'end';

          return (
            <section
              key={card.id}
              className="relative z-0 flex min-h-[300px] w-[320px] shrink-0 flex-col rounded-xl border p-3"
              style={{
                backgroundColor: cardSurface,
                borderColor: cardBorder,
                zIndex: 0,
              }}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                {editingId === card.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onBlur={() => saveEdit(card)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        saveEdit(card);
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelEdit();
                      }
                    }}
                    className="h-8 w-full rounded-md border border-slate-300 bg-white/85 px-2 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500"
                  />
                ) : (
                  <h3 className="truncate pr-2 text-sm font-semibold" style={{ color: titleColor }}>
                    {card.name}
                  </h3>
                )}

                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={(event) => openCardMenu(card.id, event.currentTarget)}
                    className="inline-flex h-7 w-7 !cursor-pointer items-center justify-center rounded text-slate-500 hover:bg-slate-200/80 hover:text-slate-700"
                    title="Options"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div
                className={`flex-1 space-y-2 overflow-y-auto rounded-lg ${hasItems ? 'p-0' : 'border border-dashed p-2'} ${isDropEndHere ? 'ring-1 ring-blue-300' : ''}`}
                style={{
                  backgroundColor: 'transparent',
                  borderColor: hasItems ? undefined : cardBorder,
                }}
                onDragOver={(event) => handleCardBodyDragOver(event, card.id)}
                onDrop={(event) => {
                  void handleCardBodyDrop(event, card.id);
                }}
              >
                {cardItems.length === 0 && !addingItem && (
                  <p className="py-1 text-xs text-slate-500">Aucun element pour le moment.</p>
                )}

                {cardItems.map((item) => {
                  const itemCheckState = normalizeCheckState(item.check_state, item.is_completed);
                  const isItemCompleted = itemCheckState === 'green';
                  const isCheckboxVisible = itemCheckState !== 'empty' || hoveredItemId === item.id;
                  const contentOffset = isCheckboxVisible ? 28 : 0;
                  const isDraggingThis = draggedItem?.itemId === item.id;
                  const isDropBefore = dropPreview?.cardId === card.id && dropPreview?.itemId === item.id && dropPreview?.position === 'before';
                  const isDropAfter = dropPreview?.cardId === card.id && dropPreview?.itemId === item.id && dropPreview?.position === 'after';
                  const checkboxVisual = getCheckStateVisual(itemCheckState, checkboxColor);
                  return (
                    <article
                      key={item.id}
                      data-task-item-id={item.id}
                      draggable
                      onDragStart={(event) => handleItemDragStart(event, card.id, item.id)}
                      onDragEnd={handleItemDragEnd}
                      onDragOver={(event) => handleItemDragOver(event, card.id, item.id)}
                      onDrop={(event) => {
                        void handleItemDrop(event, card.id, item.id);
                      }}
                      className={`group relative rounded-md border border-slate-200 bg-white p-2 shadow-sm transition-colors duration-200 ease-out hover:bg-slate-50/70 ${isDraggingThis ? 'opacity-45' : ''}`}
                      style={{
                        cursor: isDraggingThis ? 'grabbing' : 'pointer',
                        boxShadow: isDropBefore
                          ? 'inset 0 2px 0 0 #2563eb'
                          : isDropAfter
                            ? 'inset 0 -2px 0 0 #2563eb'
                            : undefined,
                      }}
                      onMouseEnter={() => setHoveredItemId(item.id)}
                      onMouseLeave={() => setHoveredItemId((current) => (current === item.id ? null : current))}
                      onClick={(event) => {
                        const target = event.target as HTMLElement;
                        if (target.closest('button, a, input, textarea')) return;
                        openItemDetails(card.id, item.id);
                      }}
                    >
                      <button
                        type="button"
                        onClick={(event) => openItemContextMenu(card.id, item.id, event.currentTarget)}
                        className="absolute right-1 top-1 inline-flex h-6 w-6 !cursor-pointer items-center justify-center rounded text-slate-400 opacity-0 transition-all duration-200 ease-out hover:bg-slate-200/80 hover:text-slate-700 group-hover:opacity-100 group-focus-within:opacity-100"
                        title="Options de l element"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                      <div className="relative flex items-start">
                        <button
                          type="button"
                          onClick={() => {
                            void setItemCheckState(card, item, nextCheckState(itemCheckState));
                          }}
                          disabled={Boolean(togglingItemIds[item.id])}
                          className={`absolute left-0 top-0.5 z-20 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-opacity duration-200 ease-out disabled:opacity-60 ${
                            isCheckboxVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
                          }`}
                          style={{
                            borderColor: checkboxVisual.borderColor,
                            backgroundColor: checkboxVisual.backgroundColor,
                            color: checkboxVisual.textColor,
                          }}
                          title="Changer l etat"
                        >
                          {checkboxVisual.icon}
                        </button>
                        <div
                          className="relative z-0 flex min-w-0 items-start transition-all duration-200 ease-out"
                          style={{ paddingLeft: `${contentOffset}px` }}
                        >
                          <span
                            className="my-0.5 mr-2 w-1.5 shrink-0 self-stretch rounded-full"
                            style={{ backgroundColor: itemAccentColor(item.base_color) }}
                            aria-hidden
                          />
                          <div className="min-w-0 pr-7">
                            <p className={`break-words text-sm font-medium ${isItemCompleted ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                              {item.title}
                            </p>
                            {item.description && (
                              <p className={`mt-0.5 break-words text-xs ${isItemCompleted ? 'text-slate-400' : 'text-slate-600'}`}>
                                {item.description}
                              </p>
                            )}
                            {(item.starts_at || item.due_at) && (
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                {item.starts_at && (
                                  <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                    <Calendar className="h-3 w-3 shrink-0" />
                                    {formatDate(item.starts_at)}
                                  </span>
                                )}
                                {item.due_at && (
                                  <span className={`flex items-center gap-1 rounded px-1 text-[10px] font-medium ${isPastDate(item.due_at) && !isItemCompleted ? 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400' : isApproachingDate(item.due_at) && !isItemCompleted ? 'bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400' : 'text-slate-400'}`}>
                                    <CalendarClock className="h-3 w-3 shrink-0" />
                                    {formatDate(item.due_at)}
                                  </span>
                                )}
                              </div>
                            )}
                            {(itemAssignees[item.id] || []).length > 0 && (
                              <div className="mt-1.5 flex items-center gap-1">
                                {(itemAssignees[item.id] || []).slice(0, 4).map((uid) => {
                                  const u = users.find((x) => x.id === uid);
                                  if (!u) return null;
                                  return (
                                    <span
                                      key={uid}
                                      title={u.full_name || u.email}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[9px] font-bold text-blue-700 ring-1 ring-white"
                                    >
                                      {userInitials(u.full_name, u.email)}
                                    </span>
                                  );
                                })}
                                {(itemAssignees[item.id] || []).length > 4 && (
                                  <span className="text-[10px] text-slate-400">+{(itemAssignees[item.id] || []).length - 4}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}

                {addingItem && (
                  <div className="rounded-md border border-slate-200 bg-white p-2 shadow-sm">
                    <div className="relative">
                      <input
                        autoFocus
                        value={itemTitleDraft}
                        onChange={(event) => setItemTitleDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            saveNewItem(card);
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setAddingItemCardId(null);
                            setItemTitleDraft('');
                          }
                        }}
                        placeholder="Titre de l element (obligatoire)"
                        className="h-10 w-full rounded-md border border-slate-300 px-2 pr-12 text-sm text-slate-800 outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => saveNewItem(card)}
                        disabled={savingItemCardId === card.id}
                        className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md bg-blue-600 text-lg font-semibold leading-none text-white transition hover:bg-blue-700 disabled:opacity-60"
                        title="Ajouter (Entree)"
                      >
                        ↵
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => openNewItemForm(card.id)}
                className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 bg-white/70 text-sm font-medium text-slate-700 transition hover:bg-white"
              >
                <Plus className="h-4 w-4" />
                Ajouter un element
              </button>
            </section>
          );
        })}

        <Button
          type="button"
          variant="secondary"
          onClick={createCard}
          loading={creating}
          className="relative z-0 h-[300px] w-[320px] shrink-0 items-start justify-start rounded-xl border border-dashed border-slate-300 bg-white p-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
          style={{ zIndex: 0 }}
        >
          <Plus className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Ajouter card</span>
        </Button>
      </div>

      {openMenu && typeof document !== 'undefined' && createPortal(
        <>
          <button
            type="button"
            aria-hidden
            className="fixed inset-0 cursor-default bg-transparent"
            style={{ zIndex: 2147483646 }}
            onMouseDown={() => setOpenMenu(null)}
          />
          <div
            className="fixed w-52 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"
            style={{ left: `${openMenu.left}px`, top: `${openMenu.top}px`, zIndex: 2147483647 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {(() => {
              const card = cards.find((entry) => entry.id === openMenu.cardId);
              if (!card) return null;
              return (
                <>
                  <button
                    type="button"
                    onClick={() => openCustomize(card)}
                    className={menuItemBaseClass}
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Modifier la card
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateCard(card)}
                    className={menuItemBaseClass}
                  >
                    <Copy className="h-4 w-4" />
                    Dupliquer la card
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      deleteCard(card);
                    }}
                    className="flex w-full !cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-rose-700 transition hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Supprimer la card
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      startEdit(card);
                    }}
                    className={menuItemBaseClass}
                  >
                    <Pencil className="h-4 w-4" />
                    Renommer la card
                  </button>
                </>
              );
            })()}
          </div>
        </>,
        document.body
      )}

      {openItemMenu && typeof document !== 'undefined' && createPortal(
        <>
          <button
            type="button"
            aria-hidden
            className="fixed inset-0 cursor-default bg-transparent"
            style={{ zIndex: 2147483646 }}
            onMouseDown={() => setOpenItemMenu(null)}
          />
          <div
            className="fixed w-56 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"
            style={{ left: `${openItemMenu.left}px`, top: `${openItemMenu.top}px`, zIndex: 2147483647 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {(() => {
              const card = cards.find((entry) => entry.id === openItemMenu.cardId);
              const item = card ? (itemsByCardId[card.id] || []).find((entry) => entry.id === openItemMenu.itemId) : null;
              if (!card || !item) return null;
              return (
                <>
                  <button
                    type="button"
                    onClick={() => startEditItem(card, item)}
                    className={menuItemBaseClass}
                  >
                    <Pencil className="h-4 w-4" />
                    Modifier l element
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setOpenItemMenu(null);
                      await duplicateItem(card, item);
                    }}
                    className={menuItemBaseClass}
                  >
                    <Copy className="h-4 w-4" />
                    Dupliquer l element
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setOpenItemMenu(null);
                      await deleteItem(card, item);
                    }}
                    className="flex w-full !cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-rose-700 transition hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Supprimer l element
                  </button>
                </>
              );
            })()}
          </div>
        </>,
        document.body
      )}

      {detailsItem && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 flex items-center justify-center px-4 py-6" style={{ zIndex: 2147483646 }}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setDetailsItem(null)} />
          <div className="relative flex w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900" style={{ zIndex: 2147483647, maxHeight: 'calc(100vh - 3rem)' }}>
            {(() => {
              const card = cards.find((entry) => entry.id === detailsItem.cardId);
              const item = card ? (itemsByCardId[card.id] || []).find((entry) => entry.id === detailsItem.itemId) : null;

              if (!card || !item) {
                return (
                  <>
                    <div className="border-b border-slate-200 px-6 py-5 dark:border-slate-700">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Details de l element</h3>
                    </div>
                    <div className="px-6 py-8 text-sm text-slate-500">Element introuvable.</div>
                    <div className="flex items-center justify-end border-t border-slate-200 px-6 py-4 dark:border-slate-700">
                      <Button type="button" variant="secondary" onClick={() => setDetailsItem(null)}>Fermer</Button>
                    </div>
                  </>
                );
              }

              const state = normalizeCheckState(item.check_state, item.is_completed);
              const visual = getCheckStateVisual(
                state,
                normalizeHexColor(card.base_color || DEFAULT_CHECK_COLOR, DEFAULT_CHECK_COLOR),
              );
              const accentColor = itemAccentColor(item.base_color);
              const cardAccent = normalizeHexColor(card.base_color || DEFAULT_BASE_COLOR);
              const assigneeList = itemAssignees[item.id] || [];
              const isOverdue = item.due_at && isPastDate(item.due_at) && !item.is_completed;
              const headerTextColor = luminance(accentColor) > 0.35 ? '#1e293b' : '#ffffff';
              const headerTextMuted = luminance(accentColor) > 0.35 ? 'rgba(30,41,59,0.6)' : 'rgba(255,255,255,0.7)';

              return (
                <>
                  {/* Header */}
                  <div className="shrink-0 rounded-t-2xl px-6 py-5" style={{ backgroundColor: accentColor, borderBottom: `1px solid ${accentColor}` }}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <h2 className="break-words text-xl font-bold leading-snug" style={{ color: headerTextColor }}>{item.title}</h2>
                      </div>
                      {/* Bouton fermer */}
                      <button
                        type="button"
                        onClick={() => setDetailsItem(null)}
                        className="ml-auto shrink-0 rounded-full p-1.5 transition hover:bg-black/10"
                        style={{ color: headerTextMuted }}
                        title="Fermer"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Corps : deux colonnes */}
                  <div className="flex flex-1 overflow-hidden">

                    {/* Colonne gauche — détails */}
                    <div className="flex flex-1 flex-col overflow-y-auto border-r border-slate-200 dark:border-slate-700">
                      <div className="space-y-6 px-6 py-5">

                        {/* Description */}
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Description</p>
                          <div className="min-h-16 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {item.description?.trim() || <span className="italic text-slate-400">Aucune description</span>}
                          </div>
                        </div>

                        {/* Dates */}
                        {(item.starts_at || item.due_at) && (
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Planification</p>
                            <div className="grid grid-cols-2 gap-3">
                              {item.starts_at && (
                                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                                  <Calendar className="h-5 w-5 shrink-0 text-slate-400" />
                                  <div>
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Debut</p>
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{formatDate(item.starts_at)}</p>
                                  </div>
                                </div>
                              )}
                              {item.due_at && (() => {
                                const approaching = isApproachingDate(item.due_at) && !item.is_completed;
                                const cls = isOverdue
                                  ? { block: 'border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-950/30', icon: 'text-red-500', label: 'text-red-400', value: 'text-red-600 dark:text-red-400', badge: <p className="mt-0.5 text-[10px] font-semibold text-red-500">En retard</p> }
                                  : approaching
                                  ? { block: 'border-orange-200 bg-orange-50 dark:border-orange-800/50 dark:bg-orange-950/30', icon: 'text-orange-500', label: 'text-orange-400', value: 'text-orange-600 dark:text-orange-400', badge: <p className="mt-0.5 text-[10px] font-semibold text-orange-500">Bientot</p> }
                                  : { block: 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800', icon: 'text-slate-400', label: 'text-slate-400', value: 'text-slate-800 dark:text-slate-200', badge: null };
                                return (
                                  <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${cls.block}`}>
                                    <CalendarClock className={`h-5 w-5 shrink-0 ${cls.icon}`} />
                                    <div>
                                      <p className={`text-[10px] font-medium uppercase tracking-wide ${cls.label}`}>Echeance</p>
                                      <p className={`text-sm font-semibold ${cls.value}`}>{formatDate(item.due_at)}</p>
                                      {cls.badge}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        )}

                        {/* Assignés */}
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                            Assignes {assigneeList.length > 0 && <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">{assigneeList.length}</span>}
                          </p>
                          {assigneeList.length === 0 ? (
                            <p className="text-sm italic text-slate-400">Aucun assigne</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {assigneeList.map((uid) => {
                                const u = users.find((x) => x.id === uid);
                                if (!u) return null;
                                return (
                                  <div key={uid} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[11px] font-bold text-white">
                                      {userInitials(u.full_name, u.email)}
                                    </span>
                                    <div>
                                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{u.full_name || u.email}</p>
                                      {u.full_name && <p className="text-[10px] text-slate-400">{u.email}</p>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Pièces jointes */}
                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                              Pièces jointes
                              {itemAttachments.length > 0 && (
                                <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                                  {itemAttachments.length}
                                </span>
                              )}
                            </p>
                            <button
                              type="button"
                              onClick={() => setShowAttachmentPicker(true)}
                              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                              Lier
                            </button>
                          </div>
                          {loadingAttachments ? (
                            <p className="text-xs italic text-slate-400">Chargement…</p>
                          ) : itemAttachments.length === 0 ? (
                            <p className="text-sm italic text-slate-400">Aucune pièce jointe</p>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {itemAttachments.map((att) => {
                                const e = att.entry;
                                const isFolder = e.entry_type === 'folder';
                                const FileIcon = isFolder ? Folder : getFileIcon(e.file_type);
                                const folderColor = e.color || '#3B82F6';
                                return (
                                  <div key={att.id} className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                                    <div
                                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                                      style={isFolder ? { backgroundColor: folderColor + '22' } : {}}
                                    >
                                      <FileIcon
                                        className="h-5 w-5"
                                        style={isFolder ? { color: folderColor } : {}}
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200" title={e.name}>{e.name}</p>
                                      <p className="text-[10px] text-slate-400">
                                        {isFolder ? 'Dossier' : (e.file_type?.split('/')[1]?.toUpperCase() || 'Fichier')}
                                        {e.file_size ? ` · ${formatFileSize(e.file_size)}` : ''}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => detachEntry(att.id)}
                                      className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100 dark:text-slate-600"
                                      title="Retirer"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                      </div>

                      {/* Footer gauche */}
                      <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="secondary" onClick={() => setDetailsItem(null)}>
                            Fermer
                          </Button>
                          {/* Bouton info */}
                          <button
                            type="button"
                            onClick={() => setShowItemInfo(true)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                            title="Informations"
                          >
                            i
                          </button>
                        </div>
                        <Button
                          type="button"
                          onClick={() => { setDetailsItem(null); startEditItem(card, item); }}
                          className="bg-blue-600 text-white hover:bg-blue-700"
                        >
                          <Pencil className="h-4 w-4" />
                          Modifier
                        </Button>
                      </div>
                    </div>

                    {/* Colonne droite — commentaires */}
                    <div className="flex w-80 shrink-0 flex-col">
                      {/* Titre commentaires */}
                      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                        <MessageSquare className="h-4 w-4 text-slate-400" />
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          Commentaires
                          {itemComments.length > 0 && (
                            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-400">{itemComments.length}</span>
                          )}
                        </p>
                      </div>

                      {/* Liste des commentaires */}
                      <div className="flex-1 overflow-y-auto px-5 py-4">
                        {loadingComments ? (
                          <div className="flex justify-center py-6">
                            <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-blue-500" />
                          </div>
                        ) : itemComments.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                            <MessageSquare className="h-8 w-8 text-slate-200 dark:text-slate-700" />
                            <p className="text-xs text-slate-400">Aucun commentaire pour l instant.</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {itemComments.map((comment) => (
                              <div key={comment.id} className="group flex items-start gap-2.5">
                                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                  {comment.user_name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?'}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-baseline gap-2">
                                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{comment.user_name || 'Anonyme'}</span>
                                    <span className="text-[10px] text-slate-400">{timeAgo(comment.created_at)}</span>
                                  </div>
                                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600 dark:text-slate-300">{comment.content}</p>
                                  {(comment.user_id === user?.id || !comment.user_id) && (
                                    <button
                                      type="button"
                                      onClick={() => deleteComment(comment.id)}
                                      className="mt-1 hidden text-[10px] text-slate-400 underline hover:text-red-500 group-hover:block"
                                    >
                                      Supprimer
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Zone de saisie */}
                      <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-700">
                        <div className="flex items-start gap-2.5">
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
                            {userInitials(user?.full_name || null, user?.email || '')}
                          </span>
                          <div className="flex-1">
                            <textarea
                              value={commentDraft}
                              onChange={(e) => setCommentDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  void postComment(item.id);
                                }
                              }}
                              placeholder="Ecrire un commentaire… (Entrée pour envoyer)"
                              rows={2}
                              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            />
                            <div className="mt-1.5 flex justify-end">
                              <button
                                type="button"
                                onClick={() => void postComment(item.id)}
                                disabled={!commentDraft.trim() || postingComment}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-40"
                              >
                                <Send className="h-3 w-3" />
                                Envoyer
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {showItemInfo && detailsItem && typeof document !== 'undefined' && createPortal(
        (() => {
          const card = cards.find((c) => c.id === detailsItem.cardId);
          const item = card ? (itemsByCardId[card.id] || []).find((i) => i.id === detailsItem.itemId) : null;
          if (!card || !item) return null;
          return (
            <div className="fixed inset-0 flex items-center justify-center px-4 py-6" style={{ zIndex: 2147483648 }}>
              <div className="absolute inset-0 bg-black/30" onClick={() => setShowItemInfo(false)} />
              <div className="relative w-full max-w-xs rounded-2xl bg-white shadow-2xl dark:bg-slate-900" style={{ zIndex: 2147483649 }}>
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Informations</h3>
                  <button type="button" onClick={() => setShowItemInfo(false)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-3 px-5 py-4">
                  <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Cree par</p><p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">{item.created_by_name || '—'}</p></div>
                  <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Date de creation</p><p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">{formatDateTime(item.created_at)}</p></div>
                  <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Derniere mise a jour</p><p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">{formatDateTime(item.updated_at)}</p></div>
                  <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Card parente</p><p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">{card.name}</p></div>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {editingItem && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 flex items-center justify-center px-4 py-6" style={{ zIndex: 2147483646 }}>
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              const prev = editingItem;
              setEditingItem(null);
              setEditingItemTitle('');
              setEditingItemDescription('');
              setEditingItemBaseColor(DEFAULT_BASE_COLOR);
              setEditingItemStartsAt('');
              setEditingItemDueAt('');
              setEditingItemAssignees([]);
              if (prev) setDetailsItem({ cardId: prev.cardId, itemId: prev.itemId });
            }}
          />
          <div className="relative flex w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900" style={{ zIndex: 2147483647, maxHeight: 'calc(100vh - 3rem)' }}>
            {(() => {
              const editAccent = normalizeHexColor(editingItemBaseColor || DEFAULT_BASE_COLOR);
              const editTextColor = luminance(editAccent) > 0.35 ? '#1e293b' : '#ffffff';
              const editTextMuted = luminance(editAccent) > 0.35 ? 'rgba(30,41,59,0.6)' : 'rgba(255,255,255,0.7)';
              return (
                <>
                  {/* Header coloré live */}
                  <div className="shrink-0 rounded-t-2xl px-6 py-5" style={{ backgroundColor: editAccent }}>
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: editTextMuted }}>Modifier l element</p>
                        <input
                          id="task-item-title"
                          autoFocus
                          value={editingItemTitle}
                          onChange={(event) => setEditingItemTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              saveEditedItem();
                            }
                          }}
                          placeholder="Titre de l element"
                          className="mt-1 w-1/3 bg-transparent text-xl font-bold outline-none placeholder:opacity-40"
                          style={{
                            color: editTextColor,
                            borderBottom: `1.5px solid ${editTextColor}`,
                            paddingBottom: '2px',
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const prev = editingItem;
                          setEditingItem(null);
                          setEditingItemTitle('');
                          setEditingItemDescription('');
                          setEditingItemBaseColor(DEFAULT_BASE_COLOR);
                          setEditingItemStartsAt('');
                          setEditingItemDueAt('');
                          setEditingItemAssignees([]);
                          if (prev) setDetailsItem({ cardId: prev.cardId, itemId: prev.itemId });
                        }}
                        className="ml-auto shrink-0 rounded-full p-1.5 transition hover:bg-black/10"
                        style={{ color: editTextMuted }}
                        title="Fermer"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Corps scrollable */}
                  <div className="flex-1 overflow-y-auto">
                    <div className="space-y-6 px-6 py-5">

                      {/* Description */}
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500" htmlFor="task-item-description">Description</label>
                        <textarea
                          id="task-item-description"
                          value={editingItemDescription}
                          onChange={(event) => setEditingItemDescription(event.target.value)}
                          rows={4}
                          className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-800 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>

                      {/* Dates */}
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Planification</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                            <Calendar className="h-5 w-5 shrink-0 text-slate-400" />
                            <div className="min-w-0 flex-1">
                              <label className="block text-[10px] font-medium uppercase tracking-wide text-slate-400" htmlFor="task-item-starts-at">Debut</label>
                              <input
                                id="task-item-starts-at"
                                type="datetime-local"
                                value={editingItemStartsAt}
                                onChange={(event) => setEditingItemStartsAt(event.target.value)}
                                className="mt-0.5 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none dark:text-slate-200"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                            <CalendarClock className="h-5 w-5 shrink-0 text-slate-400" />
                            <div className="min-w-0 flex-1">
                              <label className="block text-[10px] font-medium uppercase tracking-wide text-slate-400" htmlFor="task-item-due-at">Echeance</label>
                              <input
                                id="task-item-due-at"
                                type="datetime-local"
                                value={editingItemDueAt}
                                onChange={(event) => setEditingItemDueAt(event.target.value)}
                                className="mt-0.5 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none dark:text-slate-200"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Assignés */}
                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Assignes</p>
                          {editingItemAssignees.length > 0 && (
                            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">{editingItemAssignees.length}</span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={assigneeSearch}
                          onChange={(e) => setAssigneeSearch(e.target.value)}
                          placeholder="Rechercher un utilisateur…"
                          className="mb-2 h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        />
                        <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
                          {users.filter((u) => {
                            const q = assigneeSearch.toLowerCase();
                            return !q || (u.full_name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
                          }).map((u) => {
                            const isAssigned = editingItemAssignees.includes(u.id);
                            return (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => setEditingItemAssignees((prev) =>
                                  isAssigned ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                                )}
                                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${isAssigned ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                              >
                                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[11px] font-bold text-white">
                                  {userInitials(u.full_name, u.email)}
                                </span>
                                <span className="truncate">{u.full_name || u.email}</span>
                                {isAssigned && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-blue-500" />}
                              </button>
                            );
                          })}
                          {users.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">Aucun utilisateur.</p>}
                        </div>
                      </div>

                      {/* Couleur */}
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Couleur</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {PASTEL_PRESETS.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setEditingItemBaseColor(preset)}
                              className="h-8 w-8 rounded-full border-2 transition hover:scale-110"
                              style={{
                                backgroundColor: preset,
                                borderColor: normalizeHexColor(editingItemBaseColor) === normalizeHexColor(preset) ? '#1e293b' : 'transparent',
                                boxShadow: normalizeHexColor(editingItemBaseColor) === normalizeHexColor(preset) ? `0 0 0 2px ${preset}` : 'none',
                              }}
                              title={preset}
                            />
                          ))}
                          <ColorPickerButton
                            value={normalizeHexColor(editingItemBaseColor)}
                            onChange={setEditingItemBaseColor}
                            ariaLabel="Choisir une couleur personnalisee"
                            size="md"
                          />
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex shrink-0 items-center justify-between gap-3 rounded-b-2xl border-t border-slate-200 px-6 py-4 dark:border-slate-700">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        const prev = editingItem;
                        setEditingItem(null);
                        setEditingItemTitle('');
                        setEditingItemDescription('');
                        setEditingItemBaseColor(DEFAULT_BASE_COLOR);
                        setEditingItemStartsAt('');
                        setEditingItemDueAt('');
                        setEditingItemAssignees([]);
                        if (prev) setDetailsItem({ cardId: prev.cardId, itemId: prev.itemId });
                      }}
                    >
                      Annuler
                    </Button>
                    <Button type="button" onClick={saveEditedItem} className="bg-blue-600 text-white hover:bg-blue-700">
                      Enregistrer
                    </Button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {customizingCard && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 flex items-center justify-center px-4 py-6" style={{ zIndex: 2147483646 }}>
          <div className="absolute inset-0 bg-black/45" onClick={() => setCustomizingCard(null)} />
          <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl" style={{ zIndex: 2147483647 }}>
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Modifier la card</h3>
              <p className="mt-1 text-sm text-slate-500">Personnalisation de la couleur de fond en teinte pastel adaptee au theme.</p>
            </div>

            <div className="space-y-5 px-5 py-4">
              <div>
                <p className="text-sm font-medium text-slate-700">Couleurs predefinies</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PASTEL_PRESETS.map((preset) => {
                    const pastel = pastelSurface(preset, isDarkMode);
                    const isSelected = normalizeHexColor(baseColorDraft) === normalizeHexColor(preset);
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setBaseColorDraft(preset)}
                        className="h-8 w-8 rounded-md border-2 transition"
                        style={{
                          backgroundColor: pastel,
                          borderColor: isSelected ? '#334155' : pastelBorder(preset, isDarkMode),
                        }}
                        title={preset}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <ColorPickerButton
                  value={normalizeHexColor(baseColorDraft)}
                  onChange={setBaseColorDraft}
                  ariaLabel="Choisir une couleur de fond"
                  size="md"
                />
                <div>
                  <p className="text-sm font-medium text-slate-700">Couleur personnalisee</p>
                  <p className="text-xs text-slate-500">Les couleurs vives sont automatiquement adoucies en pastel.</p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Apercu</p>
                <div
                  className="rounded-xl border p-3"
                  style={{
                    backgroundColor: pastelSurface(baseColorDraft, isDarkMode),
                    borderColor: pastelBorder(baseColorDraft, isDarkMode),
                  }}
                >
                  <div
                    className="text-sm font-semibold"
                    style={{ color: luminance(pastelSurface(baseColorDraft, isDarkMode)) < 0.45 ? '#f1f5f9' : '#0f172a' }}
                  >
                    {customizingCard.name}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
              <Button type="button" variant="secondary" onClick={() => setCustomizingCard(null)}>
                Annuler
              </Button>
              <Button type="button" onClick={saveCustomization} className="bg-blue-600 text-white hover:bg-blue-700">
                Enregistrer
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {showAttachmentPicker && detailsItem && (
        <RentalFileExplorerModal
          rentalId={rental.id}
          mode="picker"
          attachedIds={itemAttachments.map((a) => a.dossier_entry_id)}
          onSelect={(entry) => attachEntry(detailsItem.itemId, entry)}
          onClose={() => setShowAttachmentPicker(false)}
        />
      )}
    </div>
  );
};

export default RentalTasksPanel;
