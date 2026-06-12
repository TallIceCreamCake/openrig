import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  Check,
  CheckCheck,
  Clock,
  CornerUpLeft,
  Download,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  MessageSquarePlus,
  Package,
  Paperclip,
  Plus,
  Send,
  Users,
  X,
  UserCircle2,
} from 'lucide-react';
import {
  usePersonnelChat,
  type PersonnelChatParticipant,
  type PersonnelChatMessageReference,
  type PersonnelChatMessageAttachment,
  type UploadableAttachment,
} from '../../hooks/usePersonnelChat';
import { Personnel } from '../../types/personnel';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';

interface PersonnelChatProps {
  personnel: Personnel[];
}

const REACTION_OPTIONS = ['👍', '❤️', '😂', '🎉', '😮'] as const;

type AttachmentPreviewCategory = 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'other';
type AttachmentPreviewState = {
  id: string;
  name: string;
  url: string | null;
  type: string | null;
  size: number | null;
  category: AttachmentPreviewCategory;
};

type LinkableEntityType = 'rental' | 'equipment' | 'client';

type LinkSearchResult = {
  id: string;
  type: LinkableEntityType;
  title: string;
  subtitle: string | null;
  meta: string | null;
  status: string | null;
  extra: string | null;
  href: string;
};

type LinkedEntityPayload = {
  version: number;
  type: LinkableEntityType;
  id: string;
  title: string;
  subtitle: string | null;
  meta: string | null;
  status: string | null;
  extra: string | null;
  href: string;
};

const LINK_MESSAGE_PREFIX = '::link::';
const LINK_MESSAGE_VERSION = 1;

const rentalStatusMeta: Record<
  string,
  { label: string; className: string }
> = {
  pending: { label: 'En attente', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  confirmed: { label: 'Confirmée', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  preparing: { label: 'Préparation', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_progress: { label: 'En cours', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  delivered: { label: 'Livrée', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  return_delivery: { label: 'Livraison retour', className: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  in_return: { label: 'En retour', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  returned: { label: 'Retournée', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  completed: { label: 'Terminée', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  paid: { label: 'Payée', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Annulée', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  archived: { label: 'Archivée', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const equipmentStatusMeta: Record<
  string,
  { label: string; className: string }
> = {
  available: { label: 'Disponible', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  in_use: { label: 'En utilisation', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  maintenance: { label: 'Maintenance', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  broken: { label: 'Hors service', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const currencyFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const shortDateFormatter = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' });

const formatShortDate = (value: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return shortDateFormatter.format(date);
};

const classifyAttachment = (attachment: PersonnelChatMessageAttachment): AttachmentPreviewCategory => {
  const mime = (attachment.file_type ?? '').toLowerCase();
  const name = (attachment.file_name ?? '').toLowerCase();
  const byExtension = (extensions: string[]) => extensions.some((ext) => name.endsWith(ext));

  if (mime.startsWith('image/') || (!mime && byExtension(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']))) {
    return 'image';
  }
  if (mime === 'application/pdf' || (!mime && byExtension(['.pdf']))) {
    return 'pdf';
  }
  if (mime.startsWith('video/') || (!mime && byExtension(['.mp4', '.webm', '.mov', '.avi', '.mkv']))) {
    return 'video';
  }
  if (mime.startsWith('audio/') || (!mime && byExtension(['.mp3', '.wav', '.ogg', '.m4a']))) {
    return 'audio';
  }
  if (mime.startsWith('text/') || (!mime && byExtension(['.txt', '.md', '.csv', '.log']))) {
    return 'text';
  }
  return 'other';
};

const formatFileSize = (size: number | null) => {
  if (!size || size <= 0) return null;
  const units = ['octets', 'Ko', 'Mo', 'Go'];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const renderAttachmentPreviewContent = (preview: AttachmentPreviewState) => {
  if (!preview.url) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3 text-gray-500">
        <FileText className="h-10 w-10" />
        <p className="text-sm text-gray-600 text-center">
          Aucun aperçu disponible. Téléchargez le fichier pour le consulter.
        </p>
      </div>
    );
  }

  if (preview.category === 'image') {
    return (
      <div className="flex items-center justify-center">
        <img
          src={preview.url}
          alt={preview.name}
          className="max-h-[70vh] w-full max-w-[80vw] object-contain"
        />
      </div>
    );
  }

  if (preview.category === 'pdf' || preview.category === 'text') {
    return (
      <iframe
        src={preview.url}
        title={preview.name}
        className="h-[70vh] w-full rounded-md border border-gray-200"
      />
    );
  }

  if (preview.category === 'video') {
    return (
      <video controls className="h-[70vh] w-full rounded-md bg-black" src={preview.url}>
        <track kind="captions" />
        Votre navigateur ne supporte pas cette vidéo.
      </video>
    );
  }

  if (preview.category === 'audio') {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4">
        <audio controls className="w-full max-w-2xl" src={preview.url}>
          <source src={preview.url} type={preview.type ?? undefined} />
          Votre navigateur ne supporte pas cet audio.
        </audio>
        <p className="text-xs text-gray-500">Vous pouvez également télécharger le fichier.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[70vh] flex-col items-center justify-center gap-3 text-gray-500">
      <FileText className="h-10 w-10" />
      <p className="text-sm text-gray-600 text-center">
        Aucun aperçu interactif pour ce type de fichier. Téléchargez-le pour l’ouvrir.
      </p>
    </div>
  );
};

const sanitizeSearchTerm = (value: string) => value.replace(/[%_]/g, ' ').trim();

const parseLinkedEntityMessage = (content: string): LinkedEntityPayload | null => {
  if (typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (!trimmed.startsWith(LINK_MESSAGE_PREFIX)) return null;
  const raw = trimmed.slice(LINK_MESSAGE_PREFIX.length);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const type =
      parsed.type === 'rental' || parsed.type === 'equipment' || parsed.type === 'client'
        ? parsed.type
        : null;
    if (!type || !parsed.id || !parsed.href) return null;
    const version =
      typeof parsed.version === 'number' && parsed.version > 0 ? parsed.version : LINK_MESSAGE_VERSION;
    return {
      version,
      type,
      id: String(parsed.id),
      title: parsed.title ? String(parsed.title) : 'Référence',
      subtitle: parsed.subtitle ? String(parsed.subtitle) : null,
      meta: parsed.meta ? String(parsed.meta) : null,
      status: parsed.status ? String(parsed.status) : null,
      extra: parsed.extra ? String(parsed.extra) : null,
      href: String(parsed.href),
    };
  } catch (err) {
    console.warn('Unable to parse linked entity payload', err);
    return null;
  }
};


const formatDisplayName = (person: Personnel | undefined) => {
  if (!person) return 'Inconnu';
  const name = `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim();
  return name || person.email || 'Inconnu';
};

const PersonnelChat: React.FC<PersonnelChatProps> = ({ personnel }) => {
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const {
    threads,
    threadsLoading,
    threadsError,
    activeThreadId,
    setActiveThreadId,
    messages,
    messagesError,
    loadingMessages,
    sendMessage,
    createOrGetDirectThread,
    creatingThread,
    markThreadAsRead,
    toggleReaction,
    reactionsSupported,
    repliesSupported,
    attachmentsSupported,
  } = usePersonnelChat(currentUserId);

  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [newConversationSearch, setNewConversationSearch] = useState('');
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<PersonnelChatMessageReference | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  type PendingAttachment = UploadableAttachment & { previewUrl: string };
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([]);
  type ReactionDetailsState = {
    messageId: string;
    anchor: { x: number; y: number };
    initialEmoji: string;
  } | null;
  const [reactionDetails, setReactionDetails] = useState<ReactionDetailsState>(null);
  const [activeReactionTab, setActiveReactionTab] = useState<string | null>(null);
  const [reactionPopupPosition, setReactionPopupPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreviewState | null>(null);
  const navigate = useNavigate();
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const attachmentMenuRef = useRef<HTMLDivElement | null>(null);
  const attachmentButtonRef = useRef<HTMLButtonElement | null>(null);
  const [linkModalType, setLinkModalType] = useState<LinkableEntityType | null>(null);
  const [linkModalQuery, setLinkModalQuery] = useState('');
  const [linkModalLoading, setLinkModalLoading] = useState(false);
  const [linkModalResults, setLinkModalResults] = useState<LinkSearchResult[]>([]);
  const [linkModalError, setLinkModalError] = useState<string | null>(null);
  const [linkMessagePending, setLinkMessagePending] = useState(false);
  const previewSizeLabel = attachmentPreview ? formatFileSize(attachmentPreview.size) : null;

  const closeAttachmentMenu = useCallback(() => setAttachmentMenuOpen(false), []);

  const openLinkModal = useCallback(
    (type: LinkableEntityType) => {
      if (!activeThreadId || !currentUserId) return;
      setLinkModalType(type);
      setLinkModalQuery('');
      setLinkModalResults([]);
      setLinkModalError(null);
      setLinkModalLoading(true);
      closeAttachmentMenu();
    },
    [activeThreadId, closeAttachmentMenu, currentUserId]
  );

  const closeLinkModal = useCallback(() => {
    setLinkModalType(null);
    setLinkModalQuery('');
    setLinkModalResults([]);
    setLinkModalError(null);
    setLinkModalLoading(false);
    setLinkMessagePending(false);
  }, []);

  const fetchLinkableEntities = useCallback(
    async (type: LinkableEntityType, query: string): Promise<LinkSearchResult[]> => {
      const searchTerm = sanitizeSearchTerm(query);
      if (type === 'rental') {
        let request = supabase
          .from('rentals')
          .select(
            `
              id,
              reference_code,
              title,
              status,
              start_date,
              end_date,
              clients:clients(name)
            `
          )
          .order('created_at', { ascending: false })
          .limit(30);
        if (searchTerm) {
          request = request.or(
            `reference_code.ilike.%${searchTerm}%,title.ilike.%${searchTerm}%,clients.name.ilike.%${searchTerm}%`
          );
        }
        const { data, error } = await request;
        if (error) throw error;
        return (data ?? []).map((row: any) => {
          const clientName = row.clients?.name ?? 'Client inconnu';
          const startLabel = formatShortDate(row.start_date ?? null);
          const endLabel = formatShortDate(row.end_date ?? null);
          const period = startLabel && endLabel ? `${startLabel} → ${endLabel}` : startLabel ?? endLabel ?? null;
          return {
            id: String(row.id),
            type,
            title: row.title ? String(row.title) : clientName,
            subtitle: row.reference_code ? `Réf. ${row.reference_code}` : clientName,
            meta: period,
            status: row.status ? String(row.status) : null,
            extra: clientName,
            href: `/rentals/${row.id}`,
          };
        });
      }

      if (type === 'client') {
        let request = supabase
          .from('clients')
          .select('id, name, email, phone, company, address')
          .order('created_at', { ascending: false })
          .limit(30);
        if (searchTerm) {
          request = request.or(
            `name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%`
          );
        }
        const { data, error } = await request;
        if (error) throw error;
        return (data ?? []).map((row: any) => {
          const company = row.company ? String(row.company) : null;
          const address = row.address ? String(row.address) : null;
          const subtitle = company ?? address;
          const meta = row.email ? String(row.email) : null;
          const extra = row.phone ? String(row.phone) : null;
          return {
            id: String(row.id),
            type,
            title: row.name ? String(row.name) : 'Client',
            subtitle,
            meta,
            status: null,
            extra,
            href: `/clients/${row.id}`,
          };
        });
      }

      let request = supabase
        .from('equipment')
        .select('id, name, type, subtype, status, serial_number, rental_price_ht')
        .order('name', { ascending: true })
        .limit(30);
      if (searchTerm) {
        request = request.or(
          `name.ilike.%${searchTerm}%,type.ilike.%${searchTerm}%,serial_number.ilike.%${searchTerm}%`
        );
      }
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row: any) => {
        const category = row.type
          ? row.subtype
            ? `${row.type} · ${row.subtype}`
            : row.type
          : null;
        const price =
          typeof row.rental_price_ht === 'number' && row.rental_price_ht > 0
            ? currencyFormatter.format(row.rental_price_ht)
            : null;
        return {
          id: String(row.id),
          type,
          title: row.name ? String(row.name) : 'Matériel',
          subtitle: row.serial_number ? `N° série ${row.serial_number}` : null,
          meta: category,
          status: row.status ? String(row.status) : null,
          extra: price,
          href: `/equipment/${row.id}`,
        };
      });
    },
    []
  );

  const handleLinkSelection = useCallback(
    async (result: LinkSearchResult) => {
      if (!activeThreadId || !currentUserId) return;
      const payload: LinkedEntityPayload = {
        version: LINK_MESSAGE_VERSION,
        type: result.type,
        id: result.id,
        title: result.title,
        subtitle: result.subtitle,
        meta: result.meta,
        status: result.status,
        extra: result.extra,
        href: result.href,
      };
      setLinkMessagePending(true);
      try {
        await sendMessage({
          threadId: activeThreadId,
          authorId: currentUserId,
          message: `${LINK_MESSAGE_PREFIX}${JSON.stringify(payload)}`,
          attachments: [],
        });
        setReplyingTo(null);
        setReactionPickerFor(null);
        closeLinkModal();
      } catch (err) {
        console.error('Unable to send linked entity message', err);
        setLinkModalError("Impossible d'envoyer le lien, veuillez réessayer.");
      } finally {
        setLinkMessagePending(false);
      }
    },
    [
      activeThreadId,
      closeLinkModal,
      currentUserId,
      sendMessage,
      setReactionPickerFor,
      setReplyingTo,
    ]
  );

  useEffect(() => {
    if (!attachmentMenuOpen) return;
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (
        attachmentMenuRef.current &&
        attachmentButtonRef.current &&
        target &&
        !attachmentMenuRef.current.contains(target) &&
        !attachmentButtonRef.current.contains(target)
      ) {
        setAttachmentMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAttachmentMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [attachmentMenuOpen]);

  useEffect(() => {
    if (!linkModalType) return;
    setLinkModalLoading(true);
    setLinkModalError(null);
    let active = true;
    const timer = setTimeout(() => {
      fetchLinkableEntities(linkModalType, linkModalQuery)
        .then((results) => {
          if (!active) return;
          setLinkModalResults(results);
          setLinkModalError(results.length === 0 ? 'Aucun résultat' : null);
        })
        .catch((err) => {
          console.error('Unable to fetch linkable entities', err);
          if (!active) return;
          setLinkModalResults([]);
          setLinkModalError('Erreur lors du chargement des données.');
        })
        .finally(() => {
          if (!active) return;
          setLinkModalLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [fetchLinkableEntities, linkModalQuery, linkModalType]);

  useEffect(() => {
    if (!linkModalType) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeLinkModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeLinkModal, linkModalType]);

  useEffect(() => {
    if (!linkModalType) return;
    if (typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [linkModalType]);

  const linkModalHeading = useMemo(() => {
    if (linkModalType === 'equipment') return 'Lier un matériel';
    if (linkModalType === 'rental') return 'Lier un projet';
    if (linkModalType === 'client') return 'Lier un client';
    return '';
  }, [linkModalType]);

  const linkModalDescription = useMemo(() => {
    if (linkModalType === 'equipment') {
      return 'Sélectionnez un équipement pour l’insérer dans la conversation.';
    }
    if (linkModalType === 'rental') {
      return 'Choisissez un projet à partager dans le fil.';
    }
    if (linkModalType === 'client') {
      return 'Choisissez un client à mentionner dans la conversation.';
    }
    return '';
  }, [linkModalType]);

  const isAttachmentButtonDisabled = !activeThreadId || !currentUserId;

  useEffect(() => {
    if (isAttachmentButtonDisabled && attachmentMenuOpen) {
      setAttachmentMenuOpen(false);
    }
  }, [attachmentMenuOpen, isAttachmentButtonDisabled]);
  const personnelMap = useMemo(() => {
    return new Map(personnel.map((person) => [person.id, person]));
  }, [personnel]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [threads, activeThreadId]
  );

  const availableRecipients = useMemo(() => {
    const me = currentUserId;
    return personnel
      .filter((person) => person.id !== me)
      .sort((a, b) => formatDisplayName(a).localeCompare(formatDisplayName(b)));
  }, [personnel, currentUserId]);

  const filteredRecipients = useMemo(() => {
    const query = newConversationSearch.trim().toLowerCase();
    if (!query) return availableRecipients;
    return availableRecipients.filter((person) =>
      formatDisplayName(person).toLowerCase().includes(query)
    );
  }, [availableRecipients, newConversationSearch]);

  const messagesById = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
const displayNameForParticipant = (participant: PersonnelChatParticipant) => {
  const person = personnelMap.get(participant.user_id);
  if (person) return formatDisplayName(person);
  const fallback = participant.user?.full_name?.trim();
  if (fallback) return fallback;
  return participant.user_id === currentUserId ? 'Moi' : 'Collaborateur';
};

const displayNameForUserId = (userId: string | null) => {
  if (!userId) return 'Collaborateur';
  const participant = activeThread?.participants.find((entry) => entry.user_id === userId);
  if (participant) return displayNameForParticipant(participant);
  const person = personnelMap.get(userId);
  if (person) return formatDisplayName(person);
  return userId === currentUserId ? 'Moi' : 'Collaborateur';
};


  const reactionMessage = reactionDetails ? messagesById.get(reactionDetails.messageId) ?? null : null;
  const reactionTabs = reactionMessage?.reactions ?? [];
  const resolvedActiveReactionEmoji = reactionTabs.find((tab) => tab.emoji === activeReactionTab)
    ? activeReactionTab
    : reactionTabs[0]?.emoji ?? null;
  const activeReaction = reactionTabs.find((tab) => tab.emoji === resolvedActiveReactionEmoji) ?? null;
  const reactionParticipantsList = activeReaction
    ? activeReaction.user_ids.map((userId) => ({
        id: userId,
        name: displayNameForUserId(userId),
      }))
    : [];

  const toReference = (source: any): PersonnelChatMessageReference | null => {
    if (!source || typeof source !== 'object') return null;
    if (!source.id || !source.thread_id || !source.created_at) return null;
    return {
      id: String(source.id),
      thread_id: String(source.thread_id),
      author_id: source.author_id ? String(source.author_id) : null,
      message: String(source.message ?? ''),
      created_at: String(source.created_at),
    };
  };

  const scrollToMessage = (messageId: string) => {
    if (typeof document === 'undefined') return;
    const element = document.getElementById(`personnel-chat-msg-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

const beginReply = (target: PersonnelChatMessageReference) => {
  if (!repliesSupported) return;
  setReplyingTo(target);
  setReactionPickerFor(null);
};

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!attachmentsSupported) return;
    const files = event.target.files;
    if (!files) return;
    const additions: PendingAttachment[] = [];
    Array.from(files).forEach((file) => {
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `local-${Date.now()}-${Math.random()}`;
      const previewUrl = URL.createObjectURL(file);
      additions.push({ id, file, previewUrl });
    });
    if (additions.length === 0) return;
    setPendingAttachments((prev) => [...prev, ...additions]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((attachment) => attachment.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((attachment) => attachment.id !== id);
    });
  };

  const openAttachmentDialog = () => {
    if (!attachmentsSupported) return;
    closeAttachmentMenu();
    fileInputRef.current?.click();
  };

  const resolveThreadLabel = (threadId: string) => {
    const thread = threads.find((t) => t.id === threadId);
    if (!thread) return 'Conversation';
    if (thread.is_group) {
      const names = thread.participants
        .map((participant) => displayNameForParticipant(participant))
        .join(', ');
      return names || 'Groupe';
    }
    const otherParticipants = thread.participants.filter((participant) => participant.user_id !== currentUserId);
    if (otherParticipants.length === 0) return 'Moi';
    return otherParticipants
      .map((participant) => displayNameForParticipant(participant))
      .join(', ');
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeThreadId]);

  useEffect(() => {
    if (activeThreadId) {
      void markThreadAsRead(activeThreadId);
    }
  }, [activeThreadId, markThreadAsRead]);

  useEffect(() => {
    setReactionPickerFor(null);
    setReplyingTo(null);
    setPendingAttachments([]);
  }, [activeThreadId]);

  useEffect(() => {
    if (!reactionsSupported) {
      setReactionPickerFor(null);
    }
  }, [reactionsSupported]);

  useEffect(() => {
    if (replyingTo && !messages.some((message) => message.id === replyingTo.id)) {
      setReplyingTo(null);
    }
  }, [messages, replyingTo]);

  useEffect(() => {
    if (!repliesSupported) {
      setReplyingTo(null);
    }
  }, [repliesSupported]);

  useEffect(() => {
    if (reactionDetails && !messagesById.has(reactionDetails.messageId)) {
      setReactionDetails(null);
    }
  }, [messagesById, reactionDetails]);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(() => {
    return () => {
      pendingAttachmentsRef.current.forEach((attachment) => {
        URL.revokeObjectURL(attachment.previewUrl);
      });
    };
  }, []);

  useEffect(() => {
    if (reactionDetails) {
      setActiveReactionTab(reactionDetails.initialEmoji);
      if (typeof window !== 'undefined') {
        const padding = 16;
        const estimatedWidth = 340;
        const estimatedHeight = 260;
        let left = reactionDetails.anchor.x;
        let top = reactionDetails.anchor.y;
        if (left + estimatedWidth > window.innerWidth - padding) {
          left = window.innerWidth - estimatedWidth - padding;
        }
        if (top + estimatedHeight > window.innerHeight - padding) {
          top = window.innerHeight - estimatedHeight - padding;
        }
        left = Math.max(padding, left);
        top = Math.max(padding, top);
        setReactionPopupPosition({ top, left });
      }
    } else {
      setActiveReactionTab(null);
    }
  }, [reactionDetails]);

  useEffect(() => {
    if (!reactionDetails) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setReactionDetails(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [reactionDetails]);

  useEffect(() => {
    if (!attachmentPreview) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAttachmentPreview(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [attachmentPreview]);

  useEffect(() => {
    if (!attachmentPreview) return;
    if (typeof document === 'undefined') return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [attachmentPreview]);

  const openNewConversationModal = () => {
    setNewConversationSearch('');
    setShowNewConversation(true);
  };

  const closeNewConversationModal = () => {
    setShowNewConversation(false);
    setNewConversationSearch('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUserId || !activeThreadId) return;
    const text = draft.trim();
    if (!text && pendingAttachments.length === 0) return;
    try {
      await sendMessage({
        threadId: activeThreadId,
        authorId: currentUserId,
        message: text,
        replyToId: repliesSupported ? replyingTo?.id ?? null : null,
        attachments: pendingAttachments.map((attachment) => ({
          id: attachment.id,
          file: attachment.file,
        })),
      });
      setDraft('');
      setReplyingTo(null);
      setReactionPickerFor(null);
      pendingAttachments.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
      setPendingAttachments([]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartConversation = async (targetUserId: string) => {
    try {
      const thread = await createOrGetDirectThread(targetUserId);
      setActiveThreadId(thread.id);
      void markThreadAsRead(thread.id);
      if (showNewConversation) {
        closeNewConversationModal();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <div className="flex h-[620px] bg-white rounded-lg shadow overflow-hidden">
      <aside className="w-72 border-r border-gray-200 bg-gray-50 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Conversations</h3>
            <button
              type="button"
              onClick={openNewConversationModal}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              <MessageSquarePlus className="h-4 w-4" />
              Nouvelle
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Sélectionnez un échange ou démarrez un message privé.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {threadsLoading && (
            <div className="flex items-center justify-center py-6 text-gray-500 text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Chargement…
            </div>
          )}
          {threadsError && (
            <div className="px-4 py-3 text-sm text-red-600">{threadsError}</div>
          )}
          {!threadsLoading && threads.length === 0 && (
            <div className="px-4 py-6 text-sm text-gray-500">
              Aucune conversation privée pour le moment.
              <br />
              Sélectionnez un collaborateur ci-dessous pour commencer un échange.
            </div>
          )}
          <ul className="divide-y divide-gray-200">
            {threads.map((thread) => {
              const label = resolveThreadLabel(thread.id);
              const isActive = thread.id === activeThreadId;
              const previewTime = thread.last_message_at || thread.updated_at || thread.created_at;
              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveThreadId(thread.id);
                      void markThreadAsRead(thread.id);
                    }}
                    className={`w-full text-left px-4 py-3 transition ${
                      isActive
                        ? 'bg-blue-100/80 text-blue-700 font-medium'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{label}</span>
                        <span className="text-xs text-gray-500">
                          {previewTime ? new Date(previewTime).toLocaleString() : 'Nouvelle conversation'}
                        </span>
                      </div>
                      {thread.unread_count > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-xs font-semibold px-2 py-0.5">
                          {thread.unread_count > 99 ? '99+' : thread.unread_count}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center gap-2 text-xs uppercase font-semibold text-gray-500 mb-2">
            <Users className="h-3.5 w-3.5" /> Collaborateurs
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {availableRecipients.map((person) => (
              <button
                key={person.id}
                type="button"
                disabled={creatingThread}
                onClick={() => handleStartConversation(person.id)}
                className="w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {formatDisplayName(person)}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="flex-1 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {activeThread ? resolveThreadLabel(activeThread.id) : 'Chat du personnel'}
          </h2>
          <p className="text-xs text-gray-500">
            Échanges directs entre collaborateurs. Les messages sont privés aux participants sélectionnés.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {activeThreadId === null && threads.length === 0 && (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">
              Sélectionnez un collaborateur pour démarrer une conversation.
            </div>
          )}
          {activeThreadId !== null && loadingMessages && (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Chargement des messages…
            </div>
          )}
          {messagesError && (
            <div className="text-sm text-red-600">{messagesError}</div>
          )}
          {activeThreadId && !loadingMessages && messages.length === 0 && (
            <div className="text-sm text-gray-500">
              Aucun message pour l’instant. Écrivez le premier mot !
            </div>
          )}
          {messages.map((msg) => {
            const isAuthor = msg.author_id === currentUserId;
            const authorPerson = personnelMap.get(msg.author_id ?? '');
            const participantInfo = activeThread?.participants.find((participant) => participant.user_id === msg.author_id);
            const authorDisplayName = participantInfo
              ? displayNameForParticipant(participantInfo)
              : formatDisplayName(authorPerson);
          const isPickerOpen = reactionPickerFor === msg.id;
          const replySource = repliesSupported
            ? msg.reply_to ?? (msg.reply_to_message_id ? messagesById.get(msg.reply_to_message_id) ?? null : null)
            : null;
          const replyTarget = repliesSupported ? toReference(replySource) : null;
          const replyAuthorName = replyTarget ? displayNameForUserId(replyTarget.author_id) : null;
          const isReplyAnchor = repliesSupported && replyingTo?.id === msg.id;
          const attachments = msg.attachments ?? [];
          const hasAttachments = attachments.length > 0;
          const receipts = msg.receipts ?? [];
          const otherReceipts = receipts.filter((receipt) => receipt.user_id !== currentUserId);
          const totalRecipients = otherReceipts.length;
          const deliveredCount = otherReceipts.filter((receipt) => Boolean(receipt.delivered_at)).length;
          const readCount = otherReceipts.filter((receipt) => Boolean(receipt.read_at)).length;
          const allDelivered = totalRecipients > 0 ? deliveredCount === totalRecipients : true;
          const allRead = totalRecipients > 0 ? readCount === totalRecipients : false;
          const anyDelivered = deliveredCount > 0;
          let statusState: 'pending' | 'sent' | 'delivered' | 'read' = 'sent';
          if (totalRecipients === 0) {
            statusState = 'delivered';
          } else if (allRead) {
            statusState = 'read';
          } else if (allDelivered) {
            statusState = 'delivered';
          } else if (anyDelivered) {
            statusState = 'sent';
          } else {
            statusState = 'pending';
          }
          const statusIcon =
            statusState === 'read'
              ? <CheckCheck className="h-3.5 w-3.5 text-blue-200" />
              : statusState === 'delivered'
                ? <CheckCheck className="h-3.5 w-3.5 text-blue-100" />
                : statusState === 'pending'
                  ? <Clock className="h-3.5 w-3.5 text-blue-100" />
                  : <Check className="h-3.5 w-3.5 text-blue-100" />;
          const statusLabel =
            statusState === 'read'
              ? 'Vu'
              : statusState === 'delivered'
                ? 'Distribué'
                : statusState === 'pending'
                  ? 'Envoi...'
                  : 'Envoyé';
          const linkedEntity = parseLinkedEntityMessage(msg.message);
          const linkStatusMeta =
            linkedEntity && linkedEntity.status
              ? linkedEntity.type === 'rental'
                ? rentalStatusMeta[linkedEntity.status] ?? null
                : linkedEntity.type === 'equipment'
                  ? equipmentStatusMeta[linkedEntity.status] ?? null
                  : null
              : null;
          const messageContainerClasses = linkedEntity
            ? `max-w-xl rounded-lg text-sm transition shadow-none ${isReplyAnchor ? 'ring-2 ring-blue-200' : ''}`
            : `max-w-xl rounded-lg px-3 py-2 text-sm shadow transition ${
                isAuthor ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
              } ${isReplyAnchor ? 'ring-2 ring-blue-200' : ''}`;
          return (
            <div
              key={msg.id}
              id={`personnel-chat-msg-${msg.id}`}
              className={`flex flex-col gap-1 ${isAuthor ? 'items-end' : 'items-start'}`}
              >
                <div className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{authorDisplayName}</span>
                  <span className="ml-2">{new Date(msg.created_at).toLocaleString()}</span>
                </div>
                <div className={`flex items-start gap-2 ${isAuthor ? 'flex-row-reverse' : ''}`}>
                  <div className="relative flex flex-col gap-1">
                    {repliesSupported && replyTarget && (
                      <button
                        type="button"
                        onClick={() => scrollToMessage(replyTarget.id)}
                        className={`group max-w-xs rounded-md border border-gray-200 bg-white/80 px-2 py-1 text-left shadow-sm transition hover:border-blue-300 ${
                          isAuthor ? 'self-end' : 'self-start'
                        }`}
                        title="Voir le message cité"
                      >
                        <div className="flex flex-col">
                          <span className="text-[10px] font-semibold uppercase text-gray-500">
                            {replyAuthorName ?? 'Collaborateur'}
                          </span>
                          <span className="line-clamp-2 text-xs text-gray-600">
                            {replyTarget.message || 'Message'}
                          </span>
                        </div>
                      </button>
                    )}
                    <div className={messageContainerClasses}>
                      {linkedEntity ? (
                        <button
                          type="button"
                          onClick={() => navigate(linkedEntity.href)}
                          className={`flex w-full flex-col gap-2 rounded-lg border ${
                            isAuthor ? 'border-blue-500/40 bg-blue-500/10' : 'border-gray-200 bg-white'
                          } p-3 text-left text-gray-800 transition hover:-translate-y-0.5 hover:shadow-sm`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-xs uppercase text-gray-400">
                              <Link2 className="h-3.5 w-3.5" />
                              <span>
                                {linkedEntity.type === 'equipment'
                                  ? 'Matériel'
                                  : linkedEntity.type === 'client'
                                    ? 'Client'
                                    : 'Prestation / Location'}
                              </span>
                            </div>
                            {linkStatusMeta && (
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${linkStatusMeta.className}`}
                              >
                                {linkStatusMeta.label}
                              </span>
                            )}
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-semibold leading-snug text-gray-900">
                              {linkedEntity.title}
                            </p>
                            {linkedEntity.subtitle && (
                              <p className="text-xs text-gray-500">{linkedEntity.subtitle}</p>
                            )}
                            {(linkedEntity.meta || linkedEntity.extra) && (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                                {linkedEntity.meta && <span>{linkedEntity.meta}</span>}
                                {linkedEntity.extra && (
                                  <span className="inline-flex items-center gap-1">
                                    {linkedEntity.type === 'equipment' ? (
                                      <Package className="h-3 w-3" />
                                    ) : linkedEntity.type === 'client' ? (
                                      <UserCircle2 className="h-3 w-3" />
                                    ) : (
                                      <Briefcase className="h-3 w-3" />
                                    )}
                                    {linkedEntity.extra}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-blue-600">
                            <span>Ouvrir la fiche</span>
                            <ExternalLink className="h-3 w-3" />
                          </div>
                        </button>
                      ) : (
                        <div>{msg.message}</div>
                      )}
                    </div>
                    {hasAttachments && (
                      <div className={`mt-2 flex flex-col gap-2 ${isAuthor ? 'items-end' : 'items-start'}`}>
                        {attachments.map((attachment) => {
                          const previewPayload: AttachmentPreviewState = {
                            id: attachment.id,
                            name: attachment.file_name ?? 'Pièce jointe',
                            url: attachment.public_url ?? null,
                            type: attachment.file_type,
                            size: attachment.file_size,
                            category: classifyAttachment(attachment),
                          };
                          const sizeLabel = formatFileSize(attachment.file_size);
                          const isImage = previewPayload.category === 'image' && Boolean(previewPayload.url);
                          const isPdf = previewPayload.category === 'pdf';
                          const cardStyles = isAuthor
                            ? 'border-blue-200 bg-blue-50/70'
                            : 'border-gray-200 bg-white';
                          return (
                            <div
                              key={attachment.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setAttachmentPreview(previewPayload)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  setAttachmentPreview(previewPayload);
                                }
                              }}
                              className={`w-60 rounded-md border ${cardStyles} p-3 shadow-sm transition ${
                                previewPayload.url ? 'cursor-pointer hover:border-blue-300' : 'cursor-default'
                              }`}
                            >
                              <div className="overflow-hidden rounded-md bg-white">
                                {isImage && previewPayload.url ? (
                                  <img
                                    src={previewPayload.url}
                                    alt={previewPayload.name}
                                    className="h-44 w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-32 w-full flex-col items-center justify-center gap-3 text-gray-500">
                                    <FileText className="h-7 w-7" />
                                    <span className="px-2 text-center text-xs font-medium text-gray-600">
                                      {isPdf ? 'Document PDF' : attachment.file_type ?? 'Pièce jointe'}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="mt-2 flex items-start justify-between gap-2">
                                <div className="flex flex-col">
                                  <span className="max-w-[150px] truncate text-sm font-medium text-gray-800">
                                    {previewPayload.name}
                                  </span>
                                  <span className="text-[11px] text-gray-500">
                                    {sizeLabel ?? 'Taille inconnue'}
                                  </span>
                                </div>
                                {previewPayload.url && (
                                  <a
                                    href={previewPayload.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(event) => event.stopPropagation()}
                                    className="rounded-full p-1 text-gray-400 transition hover:text-blue-600"
                                    aria-label={`Télécharger ${previewPayload.name}`}
                                  >
                                    <Download className="h-4 w-4" />
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {isAuthor && (
                      <div className="mt-1 flex items-center gap-1 self-end text-[11px] text-blue-100">
                        {statusIcon}
                        <span>{statusLabel}</span>
                      </div>
                    )}
                    {isPickerOpen && reactionsSupported && currentUserId && (
                      <div
                        className={`absolute top-full mt-2 ${isAuthor ? 'right-0' : 'left-0'} z-20`}
                      >
                        <div className="flex gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
                          {REACTION_OPTIONS.map((emoji) => {
                            const summary = msg.reactions.find((reaction) => reaction.emoji === emoji);
                            const reacted =
                              currentUserId && summary ? summary.user_ids.includes(currentUserId) : false;
                            const count = summary?.count ?? 0;
                            return (
                              <button
                                type="button"
                                key={`${msg.id}-picker-${emoji}`}
                                onClick={() => {
                                  setReactionPickerFor(null);
                                  void toggleReaction(msg.id, emoji);
                                }}
                                className={`flex h-10 w-10 flex-col items-center justify-center rounded-md border text-lg transition ${
                                  reacted
                                    ? 'border-blue-500 bg-blue-50 text-blue-600'
                                    : 'border-transparent hover:border-gray-300 hover:bg-gray-50'
                                }`}
                                title={`Réagir avec ${emoji}`}
                              >
                                <span>{emoji}</span>
                                {count > 0 && (
                                  <span className="mt-1 text-[10px] font-medium text-gray-500">
                                    {count}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  {currentUserId && repliesSupported && (
                    <div className="flex flex-col items-center gap-1 text-gray-400">
                      <button
                        type="button"
                        onClick={() => {
                          const reference = toReference(msg);
                          if (reference) {
                            beginReply(reference);
                          }
                        }}
                        className={`flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-gray-300 transition ${
                          isReplyAnchor
                            ? 'border-blue-300 bg-blue-50 text-blue-600'
                            : 'hover:border-blue-300 hover:text-blue-600'
                        }`}
                        aria-label="Répondre"
                      >
                        <CornerUpLeft className="h-4 w-4" />
                      </button>
                      {reactionsSupported && (
                        <button
                          type="button"
                          onClick={() =>
                            setReactionPickerFor((prev) => (prev === msg.id ? null : msg.id))
                          }
                          className={`flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-gray-300 transition ${
                            isPickerOpen
                              ? 'border-blue-300 bg-blue-50 text-blue-600'
                              : 'hover:border-blue-300 hover:text-blue-600'
                          }`}
                          aria-label="Ajouter une réaction"
                          aria-expanded={isPickerOpen}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {msg.reactions.length > 0 && (
                  <div
                    className={`mt-1 flex flex-wrap items-center gap-2 text-xs ${
                      isAuthor ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {msg.reactions.map((reaction) => {
                      const reacted =
                        currentUserId && reactionsSupported
                          ? reaction.user_ids.includes(currentUserId)
                          : false;
                      const sharedClasses =
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5';
                      if (!currentUserId || !reactionsSupported) {
                        return (
                          <div
                            key={`${msg.id}-${reaction.emoji}`}
                            className={`${sharedClasses} border-gray-200 bg-gray-100 text-gray-600`}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setReactionDetails({
                                messageId: msg.id,
                                anchor: { x: event.clientX, y: event.clientY },
                                initialEmoji: reaction.emoji,
                              });
                            }}
                          >
                            <span>{reaction.emoji}</span>
                            <span className="text-[11px] font-medium">{reaction.count}</span>
                          </div>
                        );
                      }
                      return (
                        <button
                          type="button"
                          key={`${msg.id}-${reaction.emoji}`}
                          onClick={() => void toggleReaction(msg.id, reaction.emoji)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setReactionDetails({
                              messageId: msg.id,
                              anchor: { x: event.clientX, y: event.clientY },
                              initialEmoji: reaction.emoji,
                            });
                          }}
                          className={`${sharedClasses} transition ${
                            reacted
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          <span>{reaction.emoji}</span>
                          <span className="text-[11px] font-medium">{reaction.count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="border-t border-gray-200 px-5 py-4 space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelection}
            accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,application/zip"
            className="hidden"
          />
          {repliesSupported && replyingTo && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-blue-800">
                    {displayNameForUserId(replyingTo.author_id)}
                    <span className="ml-2 text-[11px] font-normal text-blue-500">
                      {new Date(replyingTo.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-blue-900">{replyingTo.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="rounded-full p-1 text-blue-500 transition hover:bg-blue-100"
                  aria-label="Annuler la réponse"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              {pendingAttachments.map((attachment) => {
                const isImage = attachment.file.type?.startsWith('image/');
                return (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 shadow-sm"
                  >
                    <div className="h-12 w-12 overflow-hidden rounded-md bg-white">
                      {isImage ? (
                        <img
                          src={attachment.previewUrl}
                          alt={attachment.file.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-400">
                          <FileText className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="max-w-[160px] truncate font-medium">
                        {attachment.file.name || 'Pièce jointe'}
                      </span>
                      <span className="text-[11px] text-gray-500">
                        {(attachment.file.size / 1024).toFixed(1)} Ko
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(attachment.id)}
                      className="rounded-full p-1 text-gray-400 transition hover:text-red-500"
                      aria-label="Retirer la pièce jointe"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {!attachmentsSupported && (
            <p className="text-xs text-amber-600">
              Les pièces jointes ne sont pas disponibles sur cette instance (migration manquante).
            </p>
          )}
          <fieldset disabled={!activeThreadId || !currentUserId} className="flex items-center gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={activeThreadId ? 'Écrire un message privé…' : 'Sélectionnez une conversation pour écrire'}
              className="flex-1 resize-none rounded-md border border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2"
              rows={2}
            />
            <div className="relative">
              <button
                ref={attachmentButtonRef}
                type="button"
                onClick={() => {
                  if (isAttachmentButtonDisabled) return;
                  setAttachmentMenuOpen((prev) => !prev);
                }}
                disabled={isAttachmentButtonDisabled}
                className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                title="Options pièces jointes"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              {attachmentMenuOpen && (
                <div
                  ref={attachmentMenuRef}
                  className="absolute bottom-full right-0 z-30 mb-2 w-60 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
                >
                  <div className="py-1">
                    <button
                      type="button"
                      disabled={!attachmentsSupported}
                      onClick={() => {
                        if (!attachmentsSupported) return;
                        openAttachmentDialog();
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                        attachmentsSupported
                          ? 'text-gray-700 hover:bg-gray-100'
                          : 'cursor-not-allowed text-gray-400'
                      }`}
                    >
                      <Paperclip className="h-4 w-4" />
                      <span>Joindre un fichier</span>
                      {!attachmentsSupported && (
                        <span className="ml-auto text-[11px] text-amber-500">Indisponible</span>
                      )}
                    </button>
                    <div className="my-1 border-t border-gray-100" />
                    <button
                      type="button"
                      onClick={() => openLinkModal('rental')}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100"
                    >
                      <Briefcase className="h-4 w-4 text-blue-500" />
                      <div className="flex flex-col">
                        <span>Lier un projet</span>
                        <span className="text-[11px] text-gray-500">Ajoute une carte cliquable dans le fil</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => openLinkModal('client')}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100"
                    >
                      <UserCircle2 className="h-4 w-4 text-violet-500" />
                      <div className="flex flex-col">
                        <span>Lier un client</span>
                        <span className="text-[11px] text-gray-500">Partage ses coordonnées rapidement</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => openLinkModal('equipment')}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100"
                    >
                      <Package className="h-4 w-4 text-emerald-500" />
                      <div className="flex flex-col">
                        <span>Lier un matériel</span>
                        <span className="text-[11px] text-gray-500">Partage le détail d’un équipement</span>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-blue-600 text-white h-11 w-11 disabled:opacity-50"
              disabled={!activeThreadId || !currentUserId || (!draft.trim() && pendingAttachments.length === 0)}
              title="Envoyer"
            >
              <Send className="h-4 w-4" />
            </button>
          </fieldset>
        </form>
      </section>
      </div>

      {showNewConversation && (
        <div className="fixed inset-0 z-[12040] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Nouvelle conversation</h2>
              <p className="text-xs text-gray-500">Choisissez un collaborateur à contacter.</p>
            </div>
            <button
              type="button"
              onClick={closeNewConversationModal}
              className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
              aria-label="Fermer la fenêtre de nouvelle conversation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-5 py-4 space-y-4">
            <input
              type="text"
              value={newConversationSearch}
              onChange={(event) => setNewConversationSearch(event.target.value)}
              placeholder="Rechercher un collaborateur…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-md">
              {filteredRecipients.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">Aucun collaborateur trouvé.</div>
              ) : (
                filteredRecipients.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    disabled={creatingThread}
                    onClick={() => handleStartConversation(person.id)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="truncate pr-4">{formatDisplayName(person)}</span>
                    {creatingThread && (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    )}
                  </button>
                ))
              )}
            </div>
            <p className="text-xs text-gray-400">
              Les conversations existantes avec ce collaborateur seront automatiquement rouvertes.
            </p>
          </div>
          </div>
        </div>
      )}

      {reactionDetails && reactionMessage && (
        <div
          className="fixed inset-0 z-[12040] bg-black/20"
          onClick={() => setReactionDetails(null)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div
            className="absolute w-80 max-w-[90vw] rounded-lg border border-gray-200 bg-white p-4 shadow-2xl"
            style={{ top: reactionPopupPosition.top, left: reactionPopupPosition.left }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase text-gray-400">Réactions</p>
                <p className="mt-1 text-sm text-gray-700 line-clamp-2">
                  {reactionMessage.message || 'Message'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReactionDetails(null)}
                className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="Fermer les détails des réactions"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto border-b border-gray-200 pb-2">
              {reactionTabs.map((reaction) => {
                const isActive = reaction.emoji === resolvedActiveReactionEmoji;
                return (
                  <button
                    key={`${reactionMessage.id}-${reaction.emoji}`}
                    type="button"
                    onClick={() => setActiveReactionTab(reaction.emoji)}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition ${
                      isActive
                        ? 'border-blue-500 bg-blue-50 text-blue-600'
                        : 'border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
                    }`}
                  >
                    <span className="text-base">{reaction.emoji}</span>
                    <span className="text-xs font-medium">{reaction.count}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 max-h-48 overflow-y-auto">
              {reactionParticipantsList.length === 0 ? (
                <p className="text-sm text-gray-500">Aucun participant pour cette réaction.</p>
              ) : (
                <ul className="space-y-2 text-sm text-gray-700">
                  {reactionParticipantsList.map((participant) => (
                    <li key={participant.id} className="flex items-center gap-2">
                      <span className="font-medium">{participant.name}</span>
                      {participant.id === currentUserId && <span className="text-xs text-blue-500">(Vous)</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {attachmentPreview && (
        <div
          className="fixed inset-0 z-[12040] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setAttachmentPreview(null)}
        >
          <div
            className="w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{attachmentPreview.name}</h3>
                <p className="text-xs text-gray-500">
                  {attachmentPreview.type ?? 'Pièce jointe'}
                  {previewSizeLabel ? ` · ${previewSizeLabel}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAttachmentPreview(null)}
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Fermer l’aperçu de la pièce jointe"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-6">
              {renderAttachmentPreviewContent(attachmentPreview)}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-6 py-3">
              <div className="text-xs text-gray-500">
                {attachmentPreview.category === 'other' && attachmentPreview.type
                  ? `Type détecté : ${attachmentPreview.type}`
                  : null}
              </div>
              <div className="flex items-center gap-2">
                {attachmentPreview.url && (
                  <a
                    href={attachmentPreview.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-blue-400 hover:text-blue-600"
                  >
                    <Download className="h-4 w-4" />
                    Télécharger
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setAttachmentPreview(null)}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {linkModalType && (
        <div
          className="fixed inset-0 z-[12040] flex items-center justify-center bg-black/40 p-4"
          onClick={closeLinkModal}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{linkModalHeading}</h3>
                {linkModalDescription && (
                  <p className="text-xs text-gray-500">{linkModalDescription}</p>
                )}
              </div>
              <button
                type="button"
                onClick={closeLinkModal}
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Fermer la sélection de lien"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  value={linkModalQuery}
                  onChange={(event) => setLinkModalQuery(event.target.value)}
                  placeholder={
                    linkModalType === 'equipment'
                      ? 'Rechercher un matériel par nom, type, n° de série...'
                      : linkModalType === 'client'
                        ? 'Rechercher un client par nom, email, société...'
                        : 'Rechercher par titre, référence, client...'
                  }
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                  disabled={linkMessagePending}
                />
                {linkModalLoading || linkMessagePending ? (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                ) : (
                  <span className="text-xs text-gray-400">
                    {linkModalResults.length} résultat{linkModalResults.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="max-h-[420px] overflow-y-auto rounded-md border border-gray-200">
                {linkModalLoading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Chargement des données…
                  </div>
                ) : linkModalError ? (
                  <div className="px-4 py-6 text-sm text-gray-500">{linkModalError}</div>
                ) : linkModalResults.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500">
                    Aucun élément ne correspond à votre recherche.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 bg-white">
                    {linkModalResults.map((item) => {
                      const statusMeta =
                        item.status && item.type === 'rental'
                          ? rentalStatusMeta[item.status] ?? null
                          : item.status && item.type === 'equipment'
                            ? equipmentStatusMeta[item.status] ?? null
                            : null;
                      const iconWrapperClass =
                        item.type === 'equipment'
                          ? 'bg-emerald-50 text-emerald-600'
                          : item.type === 'client'
                            ? 'bg-violet-50 text-violet-600'
                            : 'bg-blue-50 text-blue-600';
                      const typeIcon =
                        item.type === 'equipment'
                          ? <Package className="h-4 w-4" />
                          : item.type === 'client'
                            ? <UserCircle2 className="h-4 w-4" />
                            : <Briefcase className="h-4 w-4" />;
                      return (
                        <button
                          key={`${item.type}-${item.id}`}
                          type="button"
                          disabled={linkMessagePending}
                          onClick={() => void handleLinkSelection(item)}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <div
                            className={`mt-1 flex h-9 w-9 items-center justify-center rounded-full ${iconWrapperClass}`}
                          >
                            {typeIcon}
                          </div>
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-semibold text-gray-900">{item.title}</p>
                              {statusMeta && (
                                <span
                                  className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusMeta.className}`}
                                >
                                  {statusMeta.label}
                                </span>
                              )}
                            </div>
                            {item.subtitle && (
                              <p className="text-xs text-gray-500">{item.subtitle}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                              {item.meta && <span>{item.meta}</span>}
                              {item.extra && (
                                <span className="inline-flex items-center gap-1">
                                  {item.type === 'equipment' ? (
                                    <Package className="h-3 w-3" />
                                  ) : item.type === 'client' ? (
                                    <UserCircle2 className="h-3 w-3" />
                                  ) : (
                                    <Briefcase className="h-3 w-3" />
                                  )}
                                  {item.extra}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center text-xs text-blue-600">
                            <ArrowRight className="h-4 w-4" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-6 py-3">
              <p className="text-xs text-gray-500">
                Les cartes ajoutées sont visibles uniquement par les participants au fil.
              </p>
              <button
                type="button"
                onClick={closeLinkModal}
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-blue-400 hover:text-blue-600"
              >
                <X className="h-4 w-4" />
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PersonnelChat;
