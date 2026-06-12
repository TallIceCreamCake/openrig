import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, toProxiedStorageUrl } from '../lib/supabase';

export interface PersonnelChatParticipant {
  thread_id: string;
  user_id: string;
  added_at: string;
  last_read_at: string | null;
  user?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface PersonnelChatThread {
  id: string;
  topic: string | null;
  is_group: boolean;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  unread_count: number;
  participants: PersonnelChatParticipant[];
}

export interface PersonnelChatMessageReaction {
  emoji: string;
  count: number;
  user_ids: string[];
}

export interface PersonnelChatMessageReceipt {
  user_id: string;
  delivered_at: string | null;
  read_at: string | null;
}

export interface PersonnelChatMessageAttachment {
  id: string;
  storage_path: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  public_url: string | null;
}

export interface PersonnelChatMessageReference {
  id: string;
  thread_id: string;
  author_id: string | null;
  message: string;
  created_at: string;
}

export interface PersonnelChatMessage {
  id: string;
  thread_id: string;
  author_id: string | null;
  message: string;
  created_at: string;
  reply_to_message_id: string | null;
  reply_to: PersonnelChatMessageReference | null;
  attachments: PersonnelChatMessageAttachment[];
  reactions: PersonnelChatMessageReaction[];
  receipts: PersonnelChatMessageReceipt[];
}

export type UploadableAttachment = {
  id: string;
  file: File;
};

type SendMessageArgs = {
  threadId: string;
  authorId: string;
  message: string;
  replyToId?: string | null;
  attachments?: UploadableAttachment[];
};

type SupabaseInsertPayload<T> = {
  eventType: 'INSERT';
  new: T;
  old: null;
};

type SupabaseDeletePayload<T> = {
  eventType: 'DELETE';
  new: null;
  old: T;
};

type SupabaseUpdatePayload<T> = {
  eventType: 'UPDATE';
  new: T;
  old: T;
};

type SupabaseChangePayload<T> =
  | SupabaseInsertPayload<T>
  | SupabaseUpdatePayload<T>
  | SupabaseDeletePayload<T>;

const isReactionsRelationMissingError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  if (code === '42P01' || code === 'PGRST301') return true;
  const message =
    (error as { message?: string }).message ??
    (error as { details?: string }).details ??
    (error as { hint?: string }).hint;
  if (typeof message === 'string') {
    const lower = message.toLowerCase();
    return lower.includes('personnel_chat_message_reactions') || lower.includes('relation') && lower.includes('does not exist');
  }
  return false;
};

const isRepliesColumnMissingError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  if (code === '42703') return true;
  const message =
    (error as { message?: string }).message ??
    (error as { details?: string }).details ??
    (error as { hint?: string }).hint;
  if (typeof message === 'string') {
    const lower = message.toLowerCase();
    return lower.includes('reply_to_message_id');
  }
  return false;
};

const isAttachmentsRelationMissingError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  if (code === '42P01') {
    const relation = (error as { message?: string }).message ?? '';
    return relation.toLowerCase().includes('personnel_chat_message_attachments');
  }
  const message =
    (error as { message?: string }).message ??
    (error as { details?: string }).details ??
    (error as { hint?: string }).hint;
  if (typeof message === 'string') {
    const lower = message.toLowerCase();
    return lower.includes('personnel_chat_message_attachments');
  }
  return false;
};

const isThreadIdAmbiguousError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  if (code === '42702') return true;
  const message =
    (error as { message?: string }).message ??
    (error as { details?: string }).details ??
    (error as { hint?: string }).hint;
  if (typeof message === 'string') {
    const lower = message.toLowerCase();
    return lower.includes('thread_id') && lower.includes('ambiguous');
  }
  return false;
};

const sortThreads = (threads: PersonnelChatThread[]) =>
  [...threads].sort((a, b) => {
    const aTime = a.last_message_at ?? a.updated_at ?? a.created_at;
    const bTime = b.last_message_at ?? b.updated_at ?? b.created_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

const parseParticipant = (value: any): PersonnelChatParticipant | null => {
  if (!value || typeof value !== 'object') return null;
  if (!value.thread_id || !value.user_id) return null;
  return {
    thread_id: String(value.thread_id),
    user_id: String(value.user_id),
    added_at: String(value.added_at),
    last_read_at: value.last_read_at ? String(value.last_read_at) : null,
    user:
      value.user && typeof value.user === 'object'
        ? {
            id: value.user.id ? String(value.user.id) : String(value.user_id),
            full_name:
              value.user.full_name !== undefined && value.user.full_name !== null
                ? String(value.user.full_name)
                : null,
            avatar_url:
              value.user.avatar_url !== undefined && value.user.avatar_url !== null
                ? String(value.user.avatar_url)
                : null,
          }
        : null,
  };
};

const parseParticipants = (value: any): PersonnelChatParticipant[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => parseParticipant(entry))
    .filter((entry): entry is PersonnelChatParticipant => Boolean(entry));
};

const parseMessageReference = (value: any): PersonnelChatMessageReference | null => {
  if (!value || typeof value !== 'object') return null;
  if (!value.id || !value.thread_id || !value.created_at) return null;
  return {
    id: String(value.id),
    thread_id: String(value.thread_id),
    author_id: value.author_id ? String(value.author_id) : null,
    message: String(value.message ?? ''),
    created_at: String(value.created_at),
  };
};

const parseReactions = (value: any): PersonnelChatMessageReaction[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const emoji = entry.emoji ?? entry.reaction ?? null;
      if (!emoji) return null;
      const count = Number(entry.count ?? entry.ct ?? 0);
      const userIdsRaw = entry.user_ids ?? entry.users ?? [];
      const user_ids = Array.isArray(userIdsRaw)
        ? userIdsRaw.map((id: any) => String(id))
        : [];
      return {
        emoji: String(emoji),
        count: Number.isNaN(count) ? user_ids.length : count,
        user_ids,
      } as PersonnelChatMessageReaction;
    })
    .filter((entry): entry is PersonnelChatMessageReaction => Boolean(entry));
};

const parseAttachments = (value: any): PersonnelChatMessageAttachment[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      if (!entry.id && !entry.storage_path) return null;
      const fallbackId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `temp-${Date.now()}-${Math.random()}`;
      return {
        id: entry.id
          ? String(entry.id)
          : entry.storage_path
          ? String(entry.storage_path)
          : fallbackId,
        storage_path: String(entry.storage_path ?? ''),
        file_name:
          entry.file_name !== undefined && entry.file_name !== null ? String(entry.file_name) : null,
        file_type:
          entry.file_type !== undefined && entry.file_type !== null ? String(entry.file_type) : null,
        file_size:
          entry.file_size !== undefined && entry.file_size !== null
            ? Number(entry.file_size)
            : null,
        public_url:
          entry.public_url !== undefined && entry.public_url !== null
            ? String(entry.public_url)
            : null,
      } as PersonnelChatMessageAttachment;
    })
    .filter((entry): entry is PersonnelChatMessageAttachment => Boolean(entry.storage_path));
};

const parseReceipts = (value: any): PersonnelChatMessageReceipt[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      if (!entry.user_id) return null;
      return {
        user_id: String(entry.user_id),
        delivered_at:
          entry.delivered_at !== undefined && entry.delivered_at !== null
            ? String(entry.delivered_at)
            : null,
        read_at:
          entry.read_at !== undefined && entry.read_at !== null
            ? String(entry.read_at)
            : null,
      } as PersonnelChatMessageReceipt;
    })
    .filter((entry): entry is PersonnelChatMessageReceipt => Boolean(entry));
};

const parseMessage = (value: any): PersonnelChatMessage | null => {
  if (!value || typeof value !== 'object') return null;
  if (!value.id || !value.thread_id || !value.created_at) return null;
  const replyTo = parseMessageReference(value.reply_to);
  const replyToMessageIdRaw =
    value.reply_to_message_id ??
    (replyTo ? replyTo.id : (value.reply_to && (value.reply_to as any).id) ?? null);
  const replyToMessageId =
    replyToMessageIdRaw !== undefined && replyToMessageIdRaw !== null
      ? String(replyToMessageIdRaw)
      : null;
  return {
    id: String(value.id),
    thread_id: String(value.thread_id),
    author_id: value.author_id ? String(value.author_id) : null,
    message: String(value.message ?? ''),
    created_at: String(value.created_at),
    reply_to_message_id: replyToMessageId,
    reply_to: replyTo,
    attachments: parseAttachments(value.attachments ?? []),
    reactions: parseReactions(value.reactions ?? []),
    receipts: parseReceipts(
      value.receipts ??
        value.receipt_states ??
        value.delivery_status ??
        []
    ),
  };
};

const toMessageReference = (
  message: PersonnelChatMessage | PersonnelChatMessageReference | null | undefined
): PersonnelChatMessageReference | null => {
  if (!message) return null;
  return {
    id: String(message.id),
    thread_id: String(message.thread_id),
    author_id: message.author_id ? String(message.author_id) : null,
    message: String(message.message ?? ''),
    created_at: String(message.created_at),
  };
};

const enrichMessageWithCache = (
  message: PersonnelChatMessage,
  cache: Record<string, PersonnelChatMessage[]>
): PersonnelChatMessage => {
  if (message.reply_to || !message.reply_to_message_id) return message;
  const list = cache[message.thread_id] ?? [];
  const match = list.find((candidate) => candidate.id === message.reply_to_message_id);
  if (!match) return message;
  return {
    ...message,
    reply_to: toMessageReference(match),
  };
};

const aggregateReactions = (
  rows: { message_id: string; emoji: string; user_id: string }[] | null | undefined
): Record<string, PersonnelChatMessageReaction[]> => {
  const byMessage: Record<string, Map<string, PersonnelChatMessageReaction>> = {};
  (rows ?? []).forEach((row) => {
    if (!row.message_id || !row.emoji || !row.user_id) return;
    const messageId = String(row.message_id);
    const emoji = String(row.emoji);
    if (!byMessage[messageId]) {
      byMessage[messageId] = new Map();
    }
    const entryMap = byMessage[messageId];
    if (!entryMap.has(emoji)) {
      entryMap.set(emoji, { emoji, count: 0, user_ids: [] });
    }
    const reaction = entryMap.get(emoji)!;
    reaction.count += 1;
    reaction.user_ids.push(String(row.user_id));
  });

  const result: Record<string, PersonnelChatMessageReaction[]> = {};
  Object.entries(byMessage).forEach(([messageId, map]) => {
    result[messageId] = Array.from(map.values()).sort((a, b) => a.emoji.localeCompare(b.emoji));
  });
  return result;
};

const adjustReactionList = (
  list: PersonnelChatMessageReaction[],
  emoji: string,
  userId: string,
  delta: 1 | -1
): PersonnelChatMessageReaction[] => {
  const existingIndex = list.findIndex((reaction) => reaction.emoji === emoji);
  const hasReaction = existingIndex !== -1;

  if (delta > 0) {
    if (hasReaction) {
      const reaction = list[existingIndex];
      if (reaction.user_ids.includes(userId)) return list;
      const updated: PersonnelChatMessageReaction = {
        emoji,
        count: reaction.count + 1,
        user_ids: [...reaction.user_ids, userId],
      };
      const next = [...list];
      next[existingIndex] = updated;
      return next;
    }
    return [...list, { emoji, count: 1, user_ids: [userId] }].sort((a, b) => a.emoji.localeCompare(b.emoji));
  }

  if (!hasReaction) {
    return list;
  }

  const reaction = list[existingIndex];
  const filteredUsers = reaction.user_ids.filter((id) => id !== userId);
  const nextCount = Math.max(0, reaction.count - 1);
  if (nextCount <= 0 || filteredUsers.length === 0) {
    const next = [...list.slice(0, existingIndex), ...list.slice(existingIndex + 1)];
    return next;
  }

  const next = [...list];
  next[existingIndex] = {
    emoji,
    count: nextCount,
    user_ids: filteredUsers,
  };
  return next;
};

const upsertReceiptForUser = (
  receipts: PersonnelChatMessageReceipt[],
  userId: string,
  patch: { delivered_at?: string | null; read_at?: string | null }
): PersonnelChatMessageReceipt[] => {
  let found = false;
  const next = receipts.map((receipt) => {
    if (receipt.user_id !== userId) return receipt;
    found = true;
    return {
      user_id: userId,
      delivered_at:
        patch.delivered_at !== undefined ? patch.delivered_at : receipt.delivered_at,
      read_at: patch.read_at !== undefined ? patch.read_at : receipt.read_at,
    };
  });
  if (!found) {
    next.push({
      user_id: userId,
      delivered_at: patch.delivered_at !== undefined ? patch.delivered_at : null,
      read_at: patch.read_at !== undefined ? patch.read_at : null,
    });
  }
  return next;
};

const parseThreadRow = (row: any): PersonnelChatThread => {
  const lastMessage = parseMessage(row?.last_message);
  const participants = parseParticipants(row?.participants);
  return {
    id: String(row.id),
    topic: row.topic ?? null,
    is_group: Boolean(row.is_group),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at ?? row.created_at),
    last_message_at: row.last_message_at
      ? String(row.last_message_at)
      : lastMessage
      ? lastMessage.created_at
      : null,
    unread_count: typeof row.unread_count === 'number' ? row.unread_count : 0,
    participants,
  };
};

export const usePersonnelChat = (currentUserId: string | null | undefined) => {
  const [threads, setThreads] = useState<PersonnelChatThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const [messagesByThread, setMessagesByThread] = useState<Record<string, PersonnelChatMessage[]>>({});
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [loadingMessagesFor, setLoadingMessagesFor] = useState<string | null>(null);

  const [creatingThread, setCreatingThread] = useState(false);
  const [reactionsSupported, setReactionsSupported] = useState(true);
  const [repliesSupported, setRepliesSupported] = useState(true);
  const [attachmentsSupported, setAttachmentsSupported] = useState(true);

  const threadIdsRef = useRef<Set<string>>(new Set());
  const threadsRef = useRef<PersonnelChatThread[]>([]);
  const threadsRpcEnabledRef = useRef(true);
  const messagesRpcEnabledRef = useRef(true);
  const sendRpcEnabledRef = useRef(true);
  const fallbackReceiptsSupportedRef = useRef(true);

  const handleReactionsMissing = useCallback(
    (error: unknown) => {
      if (!isReactionsRelationMissingError(error)) return false;
      setReactionsSupported((prev) => (prev ? false : prev));
      return true;
    },
    []
  );

  const handleRepliesMissing = useCallback(
    (error: unknown) => {
      if (!isRepliesColumnMissingError(error)) return false;
      setRepliesSupported((prev) => (prev ? false : prev));
      return true;
    },
    []
  );

  const handleAttachmentsMissing = useCallback(
    (error: unknown) => {
      if (!isAttachmentsRelationMissingError(error)) return false;
      setAttachmentsSupported((prev) => (prev ? false : prev));
      return true;
    },
    []
  );

  const applyReceiptUpdate = useCallback(
    (threadId: string, messageIds: string[], patch: { userId: string; delivered_at?: string | null; read_at?: string | null }) => {
      if (!patch.userId || messageIds.length === 0) return;
      const ids = new Set(messageIds);
      setMessagesByThread((prev) => {
        const list = prev[threadId];
        if (!list || list.length === 0) return prev;
        let mutated = false;
        const nextList = list.map((message) => {
          if (!ids.has(message.id)) return message;
          mutated = true;
          const receipts = upsertReceiptForUser(message.receipts ?? [], patch.userId, patch);
          return { ...message, receipts };
        });
        if (!mutated) return prev;
        return { ...prev, [threadId]: nextList };
      });
    },
    []
  );

  const markMessagesDelivered = useCallback(
    async (threadId: string, messageIds: string[]) => {
      if (!currentUserId) return;
      const uniqueIds = Array.from(new Set(messageIds)).filter(Boolean);
      if (uniqueIds.length === 0) return;
      const payload = {
        p_user_id: currentUserId,
        p_message_ids: uniqueIds,
      };
      try {
        const { error } = await supabase.rpc('personnel_chat_mark_delivered', payload);
        if (error) throw error;
      } catch (err) {
        console.warn('mark chat messages delivered via rpc failed', err);
      } finally {
        const timestamp = new Date().toISOString();
        applyReceiptUpdate(threadId, uniqueIds, {
          userId: currentUserId,
          delivered_at: timestamp,
        });
      }
    },
    [applyReceiptUpdate, currentUserId]
  );

  const markThreadAsRead = useCallback(
    async (threadId: string, readAt?: string) => {
      if (!currentUserId) return;
      const payload = {
        p_thread_id: threadId,
        p_user_id: currentUserId,
        p_read_at: readAt ?? null,
      };

      const updateLocal = () =>
        setThreads((prev) =>
          prev.map((thread) =>
            thread.id === threadId ? { ...thread, unread_count: 0 } : thread
          )
        );

      const effective = readAt ?? new Date().toISOString();

      try {
        const { error } = await supabase.rpc('personnel_chat_mark_read', payload);
        if (error) throw error;
        updateLocal();
      } catch (rpcError) {
        console.warn('mark chat thread read via rpc failed', rpcError);
        try {
          const { error } = await supabase
            .from('personnel_chat_participants')
            .update({ last_read_at: effective })
            .eq('thread_id', threadId)
            .eq('user_id', currentUserId);
          if (error) throw error;
          updateLocal();
        } catch (fallbackError) {
          console.error('mark chat thread read', fallbackError);
        }
      }

      const eligibleMessages = (messagesByThread[threadId] ?? [])
        .filter(
          (msg) =>
            msg.author_id !== currentUserId &&
            new Date(msg.created_at).getTime() <= new Date(effective).getTime()
        )
        .map((msg) => msg.id);
      if (eligibleMessages.length > 0) {
        applyReceiptUpdate(threadId, eligibleMessages, {
          userId: currentUserId,
          delivered_at: effective,
          read_at: effective,
        });
      }
    },
    [applyReceiptUpdate, currentUserId, messagesByThread]
  );

  const fetchThreadsFallback = useCallback(async () => {
    if (!currentUserId) {
      setThreads([]);
      return;
    }

    const { data: memberships, error: membershipsError } = await supabase
      .from('personnel_chat_participants')
      .select('thread_id')
      .eq('user_id', currentUserId);
    if (membershipsError) throw membershipsError;

    const threadIds = (memberships ?? []).map((row) => row.thread_id);
    if (threadIds.length === 0) {
      setThreads([]);
      return;
    }

    const [{ data: threadRows, error: threadsError }, { data: participantsRows, error: participantsError }] = await Promise.all([
      supabase
        .from('personnel_chat_threads')
        .select('id, topic, is_group, created_at, updated_at, last_message_at')
        .in('id', threadIds),
      supabase
        .from('personnel_chat_participants')
        .select('thread_id, user_id, added_at, last_read_at, user:app_users(id, full_name, avatar_url)')
        .in('thread_id', threadIds),
    ]);

    if (threadsError) throw threadsError;
    if (participantsError) throw participantsError;

    const byThread: Record<string, PersonnelChatParticipant[]> = {};
    (participantsRows ?? []).forEach((participant) => {
      if (!byThread[participant.thread_id]) {
        byThread[participant.thread_id] = [];
      }
      byThread[participant.thread_id].push({
        thread_id: participant.thread_id,
        user_id: participant.user_id,
        added_at: participant.added_at,
        last_read_at: participant.last_read_at,
        user: participant.user ?? null,
      });
    });

    const combined = (threadRows ?? []).map<PersonnelChatThread>((thread) => ({
      id: thread.id,
      topic: thread.topic ?? null,
      is_group: thread.is_group,
      created_at: thread.created_at,
      updated_at: thread.updated_at,
      last_message_at: thread.last_message_at ?? null,
      unread_count: 0,
      participants: byThread[thread.id] ?? [],
    }));

    setThreads(sortThreads(combined));
  }, [currentUserId]);

  const loadThreads = useCallback(async () => {
    if (!currentUserId) {
      setThreads([]);
      setThreadsError(null);
      return;
    }
    setThreadsLoading(true);
    setThreadsError(null);

    let loaded = false;

    if (threadsRpcEnabledRef.current) {
      try {
        const { data, error } = await supabase.rpc('personnel_chat_get_threads', {
          p_user_id: currentUserId,
        });
        if (error) throw error;
        const mapped = (data ?? []).map((row: any) => parseThreadRow(row));
        setThreads(sortThreads(mapped));
        loaded = true;
      } catch (err) {
        if (isThreadIdAmbiguousError(err)) {
          threadsRpcEnabledRef.current = false;
        } else {
          handleRepliesMissing(err);
          handleAttachmentsMissing(err);
          console.warn('load personnel chat threads via rpc failed', err);
        }
      }
    }

    if (!loaded) {
      try {
        await fetchThreadsFallback();
      } catch (fallbackError) {
        console.error('load personnel chat threads', fallbackError);
        setThreadsError('Impossible de charger vos conversations');
      }
    }

    setThreadsLoading(false);
  }, [currentUserId, fetchThreadsFallback, handleAttachmentsMissing, handleRepliesMissing]);

  const loadMessages = useCallback(
    async (threadId: string) => {
      if (!currentUserId) return;
      setLoadingMessagesFor(threadId);
      setMessagesError(null);
      let loaded = false;
      let repliesUnavailable = false;
      let attachmentsUnavailable = false;
      let reactionsUnavailable = false;

      if (messagesRpcEnabledRef.current) {
        try {
          const { data, error } = await supabase.rpc('personnel_chat_get_messages', {
            p_thread_id: threadId,
            p_user_id: currentUserId,
            p_limit: 500,
          });
          if (error) throw error;
          const messages = (data ?? [])
            .map((row: any) => parseMessage(row))
            .filter((msg): msg is PersonnelChatMessage => Boolean(msg));
          setMessagesByThread((prev) => {
            const enriched = messages.map((msg) => enrichMessageWithCache(msg, prev));
            return { ...prev, [threadId]: enriched };
          });
          if (messages.length > 0) {
            await markThreadAsRead(threadId, messages[messages.length - 1]!.created_at);
          } else {
            await markThreadAsRead(threadId);
          }
          loaded = true;
        } catch (err) {
          const ambiguous = isThreadIdAmbiguousError(err);
          if (ambiguous) {
            messagesRpcEnabledRef.current = false;
          } else {
            repliesUnavailable = handleRepliesMissing(err);
            attachmentsUnavailable = handleAttachmentsMissing(err);
            reactionsUnavailable = handleReactionsMissing(err);
            console.warn('load chat messages via rpc failed', err);
          }
        }
      }

      if (!loaded) {
        try {
          const columns =
            !repliesUnavailable && repliesSupported
              ? 'id, thread_id, author_id, message, created_at, reply_to_message_id'
              : 'id, thread_id, author_id, message, created_at';
          const { data, error } = await supabase
            .from('personnel_chat_messages')
            .select(columns)
            .eq('thread_id', threadId)
            .order('created_at', { ascending: true })
            .limit(500);
          if (error) throw error;
          const messageRows = (data ?? []).map((row: any) => ({
            id: String(row.id),
            thread_id: String(row.thread_id),
            author_id: row.author_id ? String(row.author_id) : null,
            message: String(row.message ?? ''),
            created_at: String(row.created_at),
            reply_to_message_id:
              !repliesUnavailable && repliesSupported && row.reply_to_message_id
                ? String(row.reply_to_message_id)
                : null,
          }));

          const messageIds = messageRows.map((row) => row.id);
          const replyIds =
            !repliesUnavailable && repliesSupported
              ? Array.from(
                  new Set(
                    messageRows
                      .map((row) => row.reply_to_message_id)
                      .filter((value): value is string => Boolean(value))
                  )
                )
              : [];
          let replyMap: Record<string, PersonnelChatMessageReference> = {};
          if (replyIds.length > 0) {
            const { data: replyRows, error: replyError } = await supabase
              .from('personnel_chat_messages')
              .select('id, thread_id, author_id, message, created_at')
              .in('id', replyIds);
            if (replyError) throw replyError;
            replyMap = Object.fromEntries(
              (replyRows ?? []).map((row: any) => [
                String(row.id),
                {
                  id: String(row.id),
                  thread_id: String(row.thread_id),
                  author_id: row.author_id ? String(row.author_id) : null,
                  message: String(row.message ?? ''),
                  created_at: String(row.created_at),
                } as PersonnelChatMessageReference,
              ])
            );
          }

          let reactionsByMessage: Record<string, PersonnelChatMessageReaction[]> = {};
          if (!reactionsUnavailable && reactionsSupported && messageIds.length > 0) {
            const { data: reactionRows, error: reactionsError } = await supabase
              .from('personnel_chat_message_reactions')
              .select('message_id, emoji, user_id')
              .in('message_id', messageIds);
            if (reactionsError) {
              if (!handleReactionsMissing(reactionsError)) {
                throw reactionsError;
              }
            } else {
              reactionsByMessage = aggregateReactions(
                (reactionRows ?? []).map((row: any) => ({
                  message_id: String(row.message_id),
                  emoji: String(row.emoji),
                  user_id: String(row.user_id),
                }))
              );
            }
          }

          let attachmentsByMessage: Record<string, PersonnelChatMessageAttachment[]> = {};
          if (!attachmentsUnavailable && attachmentsSupported && messageIds.length > 0) {
            const { data: attachmentRows, error: attachmentsError } = await supabase
              .from('personnel_chat_message_attachments')
              .select('id, message_id, storage_path, file_name, file_type, file_size, public_url')
              .in('message_id', messageIds);
            if (attachmentsError) {
              if (!handleAttachmentsMissing(attachmentsError)) {
                throw attachmentsError;
              }
            } else {
              attachmentsByMessage = {};
              (attachmentRows ?? []).forEach((row: any) => {
                const messageId = String(row.message_id);
                if (!attachmentsByMessage[messageId]) {
                  attachmentsByMessage[messageId] = [];
                }
                attachmentsByMessage[messageId]!.push(
                  parseAttachments([
                    {
                      id: row.id,
                      storage_path: row.storage_path,
                      file_name: row.file_name,
                      file_type: row.file_type,
                      file_size: row.file_size,
                      public_url: row.public_url,
                    },
                  ])[0]!
                );
              });
            }
          }

          let receiptsByMessage: Record<string, PersonnelChatMessageReceipt[]> = {};
          if (messageIds.length > 0) {
            const { data: receiptRows, error: receiptsError } = await supabase
              .from('personnel_chat_message_receipts')
              .select('message_id, user_id, delivered_at, read_at')
              .in('message_id', messageIds);
            if (receiptsError) {
              console.error('load receipts fallback', receiptsError);
            } else {
              receiptsByMessage = {};
              (receiptRows ?? []).forEach((row: any) => {
                const messageId = String(row.message_id);
                if (!receiptsByMessage[messageId]) {
                  receiptsByMessage[messageId] = [];
                }
                receiptsByMessage[messageId]!.push({
                  user_id: String(row.user_id),
                  delivered_at: row.delivered_at ? String(row.delivered_at) : null,
                  read_at: row.read_at ? String(row.read_at) : null,
                });
              });
            }
          }

          const messages: PersonnelChatMessage[] = messageRows.map((row) => ({
            id: row.id,
            thread_id: row.thread_id,
            author_id: row.author_id,
            message: row.message,
            created_at: row.created_at,
            reply_to_message_id: row.reply_to_message_id ?? null,
            reply_to:
              row.reply_to_message_id && replyMap[row.reply_to_message_id]
                ? replyMap[row.reply_to_message_id]
                : null,
            attachments: attachmentsByMessage[row.id] ?? [],
            reactions: reactionsByMessage[row.id] ?? [],
            receipts: receiptsByMessage[row.id] ?? [],
          }));

          setMessagesByThread((prev) => {
            const enriched = messages.map((msg) => enrichMessageWithCache(msg, prev));
            return { ...prev, [threadId]: enriched };
          });
          if (messages.length > 0) {
            await markThreadAsRead(threadId, messages[messages.length - 1]!.created_at);
          } else {
            await markThreadAsRead(threadId);
          }
        } catch (fallbackError) {
          console.error('load chat messages', fallbackError);
          setMessagesError('Impossible de charger les messages');
        }
      }

      setLoadingMessagesFor((prev) => (prev === threadId ? null : prev));
    },
    [attachmentsSupported, currentUserId, handleAttachmentsMissing, handleReactionsMissing, handleRepliesMissing, markThreadAsRead, reactionsSupported, repliesSupported]
  );

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    threadIdsRef.current = new Set(threads.map((thread) => thread.id));
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    if (!activeThreadId) return;
    if (!messagesByThread[activeThreadId]) {
      loadMessages(activeThreadId);
    }
  }, [activeThreadId, loadMessages, messagesByThread]);

  useEffect(() => {
    if (!currentUserId || !activeThreadId) return;
    const pendingIds = (messagesByThread[activeThreadId] ?? [])
      .filter(
        (msg) =>
          msg.author_id !== currentUserId &&
          !msg.receipts.some((receipt) => receipt.user_id === currentUserId && receipt.delivered_at)
      )
      .map((msg) => msg.id);
    if (pendingIds.length === 0) return;
    void markMessagesDelivered(activeThreadId, pendingIds);
  }, [activeThreadId, currentUserId, markMessagesDelivered, messagesByThread]);

  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel(`personnel-chat-memberships-${currentUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'personnel_chat_participants',
        filter: `user_id=eq.${currentUserId}`,
      }, () => {
        void loadThreads();
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'personnel_chat_participants',
        filter: `user_id=eq.${currentUserId}`,
      }, () => {
        void loadThreads();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, loadThreads]);

  useEffect(() => {
    const channelId = currentUserId ? `personnel-chat-receipts-${currentUserId}` : 'personnel-chat-receipts';
    const channel = supabase
      .channel(channelId)
      .on<SupabaseChangePayload<{ message_id: string; user_id: string; delivered_at: string | null; read_at: string | null }>>(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'personnel_chat_message_receipts',
        },
        (payload) => {
          const record = (payload.new ?? payload.old) as { message_id?: string; user_id?: string; delivered_at?: string | null; read_at?: string | null } | undefined;
          if (!record || !record.message_id || !record.user_id) return;
          const deliveredAt =
            payload.eventType === 'DELETE' ? null : (payload.new as any)?.delivered_at ?? null;
          const readAt =
            payload.eventType === 'DELETE' ? null : (payload.new as any)?.read_at ?? null;
          setMessagesByThread((prev) => {
            let updatedThread: string | null = null;
            const next = { ...prev };
            for (const [threadKey, list] of Object.entries(prev)) {
              const index = list.findIndex((msg) => msg.id === record.message_id);
              if (index === -1) continue;
              const target = list[index];
              const receipts = upsertReceiptForUser(target.receipts ?? [], String(record.user_id), {
                delivered_at: deliveredAt,
                read_at: readAt,
              });
              next[threadKey] = [
                ...list.slice(0, index),
                { ...target, receipts },
                ...list.slice(index + 1),
              ];
              updatedThread = threadKey;
              break;
            }
            return updatedThread ? next : prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel(`personnel-chat-inbox-${currentUserId}`)
      .on<SupabaseInsertPayload<PersonnelChatMessage>>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'personnel_chat_messages',
        },
        (payload) => {
          const msg = parseMessage(payload.new);
          if (!msg) return;
          if (!threadIdsRef.current.has(msg.thread_id)) return;
          if (msg.author_id !== currentUserId) {
            void markMessagesDelivered(msg.thread_id, [msg.id]);
          }
          if (msg.thread_id === activeThreadId) {
            return;
          }
          setThreads((prev) =>
            sortThreads(
              prev.map((thread) =>
                thread.id === msg.thread_id
                  ? {
                      ...thread,
                      last_message_at: msg.created_at,
                      unread_count: msg.author_id === currentUserId ? 0 : thread.unread_count + 1,
                    }
                  : thread
              )
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeThreadId, currentUserId, markMessagesDelivered]);

  useEffect(() => {
    if (!activeThreadId) return;
    const channel = supabase
      .channel(`personnel-chat-${activeThreadId}`)
      .on<SupabaseChangePayload<PersonnelChatMessage>>(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'personnel_chat_messages',
          filter: `thread_id=eq.${activeThreadId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            void (async () => {
              const parsed = parseMessage(payload.new);
              if (!parsed) return;
              let messageWithAttachments = parsed;
              if (attachmentsSupported) {
                let attachments = parseAttachments((payload.new as any)?.attachments ?? []);
                if (attachments.length === 0) {
                  const { data: attachmentRows, error: attachmentsError } = await supabase
                    .from('personnel_chat_message_attachments')
                    .select('id, message_id, storage_path, file_name, file_type, file_size, public_url')
                    .eq('message_id', parsed.id);
                  if (attachmentsError) {
                    if (!handleAttachmentsMissing(attachmentsError)) {
                      console.error('load attachments realtime', attachmentsError);
                    }
                  } else {
                    attachments = parseAttachments(attachmentRows ?? []);
                  }
                }
                messageWithAttachments = { ...parsed, attachments };
              } else {
                messageWithAttachments = { ...parsed, attachments: [] };
              }
              let receipts = parseReceipts((payload.new as any)?.receipts ?? []);
              if (receipts.length === 0) {
                const { data: receiptRows, error: receiptsError } = await supabase
                  .from('personnel_chat_message_receipts')
                  .select('user_id, delivered_at, read_at')
                  .eq('message_id', parsed.id);
                if (receiptsError) {
                  console.error('load receipts realtime', receiptsError);
                } else {
                  receipts = parseReceipts(receiptRows ?? []);
                }
              }
              messageWithAttachments = { ...messageWithAttachments, receipts };

              let enrichedMessage: PersonnelChatMessage | null = null;
              setMessagesByThread((prev) => {
                const enriched = enrichMessageWithCache(messageWithAttachments, prev);
                enrichedMessage = enriched;
                const threadKey = enriched.thread_id;
                const list = prev[threadKey] ?? [];
                const exists = list.some((msg) => msg.id === enriched.id);
                const nextList = exists
                  ? list.map((msg) => (msg.id === enriched.id ? enriched : msg))
                  : [...list, enriched];
                return { ...prev, [threadKey]: nextList };
              });
              if (enrichedMessage) {
                setThreads((prev) =>
                  sortThreads(
                    prev.map((thread) =>
                      thread.id === enrichedMessage!.thread_id
                        ? { ...thread, last_message_at: enrichedMessage!.created_at, unread_count: 0 }
                        : thread
                    )
                  )
                );
                if (enrichedMessage.author_id !== currentUserId) {
                  void markThreadAsRead(enrichedMessage.thread_id, enrichedMessage.created_at);
                }
              }
            })();
          }
          if (payload.eventType === 'UPDATE' && payload.new) {
            void (async () => {
              const parsed = parseMessage(payload.new);
              if (!parsed) return;
              let messageWithAttachments = parsed;
              if (attachmentsSupported) {
                let attachments = parseAttachments((payload.new as any)?.attachments ?? []);
                if (attachments.length === 0) {
                  const { data: attachmentRows, error: attachmentsError } = await supabase
                    .from('personnel_chat_message_attachments')
                    .select('id, message_id, storage_path, file_name, file_type, file_size, public_url')
                    .eq('message_id', parsed.id);
                  if (attachmentsError) {
                    if (!handleAttachmentsMissing(attachmentsError)) {
                      console.error('load attachments realtime update', attachmentsError);
                    }
                  } else {
                    attachments = parseAttachments(attachmentRows ?? []);
                  }
                }
                messageWithAttachments = { ...parsed, attachments };
              } else {
                messageWithAttachments = { ...parsed, attachments: [] };
              }
              let receipts = parseReceipts((payload.new as any)?.receipts ?? []);
              if (receipts.length === 0) {
                const { data: receiptRows, error: receiptsError } = await supabase
                  .from('personnel_chat_message_receipts')
                  .select('user_id, delivered_at, read_at')
                  .eq('message_id', parsed.id);
                if (receiptsError) {
                  console.error('load receipts realtime update', receiptsError);
                } else {
                  receipts = parseReceipts(receiptRows ?? []);
                }
              }
              messageWithAttachments = { ...messageWithAttachments, receipts };

              setMessagesByThread((prev) => {
                const enriched = enrichMessageWithCache(messageWithAttachments, prev);
                const threadKey = enriched.thread_id;
                const list = prev[threadKey] ?? [];
                return {
                  ...prev,
                  [threadKey]: list.map((msg) =>
                    msg.id === enriched.id ? enriched : msg
                  ),
                };
              });
            })();
          }
          if (payload.eventType === 'DELETE' && payload.old) {
            const removed = parseMessage(payload.old);
            if (!removed) return;
            setMessagesByThread((prev) => {
              const threadKey = removed.thread_id;
              const list = prev[threadKey] ?? [];
              return {
                ...prev,
                [threadKey]: list.filter((msg) => msg.id !== removed.id),
              };
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeThreadId, attachmentsSupported, currentUserId, handleAttachmentsMissing, markThreadAsRead]);

  useEffect(() => {
  if (!reactionsSupported) return;
  const channel = supabase
      .channel(`personnel-chat-reactions-${currentUserId ?? 'anon'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'personnel_chat_message_reactions',
        },
        (payload) => {
          const messageId = String(
            (payload.new as any)?.message_id ?? (payload.old as any)?.message_id ?? ''
          );
          if (!messageId) return;
          const emoji = String(
            (payload.new as any)?.emoji ?? (payload.old as any)?.emoji ?? ''
          );
          const userId = String(
            (payload.new as any)?.user_id ?? (payload.old as any)?.user_id ?? ''
          );
          if (!emoji || !userId) return;
          const delta: 1 | -1 = payload.eventType === 'DELETE' ? -1 : 1;

          setMessagesByThread((prev) => {
            let updated = false;
            const next: typeof prev = {};
            for (const [threadId, messages] of Object.entries(prev)) {
              const index = messages.findIndex((msg) => msg.id === messageId);
              if (index === -1) {
                next[threadId] = messages;
                continue;
              }
              updated = true;
              const message = messages[index];
              const reactions = adjustReactionList(message.reactions, emoji, userId, delta);
              next[threadId] = [
                ...messages.slice(0, index),
                { ...message, reactions },
                ...messages.slice(index + 1),
              ];
            }
  return updated ? next : prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, reactionsSupported]);

  const uploadAttachmentsToStorage = useCallback(
    async (threadId: string, attachments: UploadableAttachment[] | undefined) => {
      if (!attachments || attachments.length === 0) return [] as Array<{
        storage_path: string;
        file_name: string | null;
        file_type: string | null;
        file_size: number | null;
        public_url: string | null;
      }>;
      const bucket = supabase.storage.from('personnel-chat');
    const uploaded: Array<{
      storage_path: string;
      file_name: string | null;
      file_type: string | null;
      file_size: number | null;
      public_url: string | null;
      }> = [];
      for (const attachment of attachments) {
        const file = attachment.file;
        const extension = file.name ? file.name.split('.').pop() ?? '' : '';
        const uniqueId =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `file-${Date.now()}-${Math.random()}`;
        const storagePath = `${threadId}/${uniqueId}${extension ? `.${extension}` : ''}`;
        const { error: uploadError } = await bucket.upload(storagePath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
        if (uploadError) {
          console.error('upload attachment failed', uploadError);
          throw uploadError;
        }
        const { data: publicData } = bucket.getPublicUrl(storagePath);
        uploaded.push({
          storage_path: storagePath,
          file_name: file.name ?? null,
          file_type: file.type ?? null,
          file_size: typeof file.size === 'number' ? Number(file.size) : null,
          public_url: toProxiedStorageUrl(publicData?.publicUrl) || null,
        });
      }
      return uploaded;
    },
    []
  );

  const sendMessage = useCallback(
    async ({ threadId, authorId, message, replyToId = null, attachments = [] }: SendMessageArgs) => {
      const trimmed = message.trim();
      const hasText = trimmed.length > 0;
      const hasFiles = attachments.length > 0;
      if (!hasText && !hasFiles) return;
      const uploadedAttachments = attachmentsSupported
        ? await uploadAttachmentsToStorage(threadId, attachments)
        : [];
      let inserted: PersonnelChatMessage | null = null;
      let insertedAttachments: PersonnelChatMessageAttachment[] = parseAttachments([]);
      let insertedReceipts: PersonnelChatMessageReceipt[] = parseReceipts([]);
      let repliesUnavailable = false;
      let attachmentsUnavailable = false;
      let rpcSucceeded = false;

      if (sendRpcEnabledRef.current) {
        try {
          const payload: Record<string, any> = {
            p_thread_id: threadId,
            p_author: authorId,
            p_message: hasText ? trimmed : '',
          };
          if (repliesSupported && replyToId) {
            payload.p_reply_to = replyToId;
          }
          if (attachmentsSupported && uploadedAttachments.length > 0) {
            payload.p_attachments = uploadedAttachments;
          }
          const { data, error } = await supabase.rpc('personnel_chat_send_message', payload);
          if (error) throw error;
          inserted = data && data.length > 0 ? parseMessage(data[0]) : null;
          if (data && data.length > 0) {
            insertedAttachments = parseAttachments(data[0]?.attachments ?? []);
            insertedReceipts = parseReceipts(data[0]?.receipts ?? []);
          }
          rpcSucceeded = true;
        } catch (rpcError) {
          const ambiguous = isThreadIdAmbiguousError(rpcError);
          if (ambiguous) {
            sendRpcEnabledRef.current = false;
          } else {
            repliesUnavailable = handleRepliesMissing(rpcError);
            attachmentsUnavailable = handleAttachmentsMissing(rpcError);
            console.warn('send chat message via rpc failed', rpcError);
          }
        }
      }

      if (!rpcSucceeded) {
        const { data, error } = await supabase
          .from('personnel_chat_messages')
          .insert({
            thread_id: threadId,
            author_id: authorId,
            message: hasText ? trimmed : '',
            ...(repliesUnavailable || !repliesSupported
              ? {}
              : { reply_to_message_id: replyToId ?? null }),
          })
          .select(
            repliesUnavailable || !repliesSupported
              ? 'id, thread_id, author_id, message, created_at'
              : 'id, thread_id, author_id, message, created_at, reply_to_message_id'
          )
          .single();
        if (error) {
          console.error('send chat message', error);
          throw error;
        }
        inserted = parseMessage(data);
        const insertedCreatedAt = inserted?.created_at ?? new Date().toISOString();
        if (!attachmentsUnavailable && attachmentsSupported && uploadedAttachments.length > 0 && data?.id) {
          const { data: attachmentsData, error: attachmentsError } = await supabase
            .from('personnel_chat_message_attachments')
            .insert(
              uploadedAttachments.map((attachment) => ({
                message_id: data.id,
                storage_path: attachment.storage_path,
                file_name: attachment.file_name,
                file_type: attachment.file_type,
                file_size: attachment.file_size,
                public_url: attachment.public_url,
              }))
            )
            .select('id, storage_path, file_name, file_type, file_size, public_url, message_id');
          if (attachmentsError) {
            if (!handleAttachmentsMissing(attachmentsError)) {
              console.error('attach files fallback', attachmentsError);
            }
          } else {
            insertedAttachments = parseAttachments(attachmentsData ?? []);
          }
        }
        if (data?.id && fallbackReceiptsSupportedRef.current) {
          try {
            const { data: participantRows } = await supabase
              .from('personnel_chat_participants')
              .select('user_id')
              .eq('thread_id', threadId);
            const receiptsPayload =
              participantRows?.map((row) => ({
                message_id: data.id,
                user_id: row.user_id,
                delivered_at: row.user_id === authorId ? insertedCreatedAt : null,
                read_at: row.user_id === authorId ? insertedCreatedAt : null,
              })) ?? [];
            if (receiptsPayload.length > 0) {
              const { data: receiptRows, error: receiptError } = await supabase
                .from('personnel_chat_message_receipts')
                .insert(receiptsPayload, { upsert: true, onConflict: 'message_id,user_id' })
                .select('user_id, delivered_at, read_at');
              if (receiptError) {
                const status = (receiptError as any)?.status;
                const code = (receiptError as any)?.code;
                if (status === 401 || code === '42501') {
                  fallbackReceiptsSupportedRef.current = false;
                } else {
                  console.error('seed chat receipts fallback', receiptError);
                }
              } else {
                insertedReceipts = parseReceipts(receiptRows ?? []);
              }
            }
          } catch (receiptSeedError) {
            const status = (receiptSeedError as any)?.status;
            const code = (receiptSeedError as any)?.code;
            if (status === 401 || code === '42501') {
              fallbackReceiptsSupportedRef.current = false;
            } else {
              console.error('seed chat receipts fallback', receiptSeedError);
            }
          }
        }
      }
      const createdAt = inserted?.created_at ?? new Date().toISOString();
      const authorReceipt: PersonnelChatMessageReceipt = {
        user_id: authorId,
        delivered_at: createdAt,
        read_at: createdAt,
      };
      const cachedReply =
        repliesSupported && (replyToId ?? inserted?.reply_to_message_id)
          ? toMessageReference(
              (messagesByThread[threadId] ?? []).find(
                (msg) => msg.id === (replyToId ?? inserted?.reply_to_message_id)
              )
            )
          : null;
      const resolvedReceipts =
        insertedReceipts.length > 0 ? insertedReceipts : [authorReceipt];
      const messageRecord: PersonnelChatMessage =
        inserted
          ? {
              ...inserted,
              reply_to:
                inserted.reply_to ??
                (inserted.reply_to_message_id && repliesSupported
                  ? cachedReply ?? inserted.reply_to
                  : inserted.reply_to),
              attachments:
                inserted.attachments && inserted.attachments.length > 0
                  ? inserted.attachments
                  : insertedAttachments,
              receipts:
                inserted.receipts && inserted.receipts.length > 0
                  ? inserted.receipts
                  : resolvedReceipts,
            }
          : {
              id: `${threadId}-${Date.now()}`,
              thread_id: threadId,
              author_id: authorId,
              message: trimmed,
              created_at: createdAt,
              reply_to_message_id: repliesSupported ? replyToId ?? null : null,
              reply_to: repliesSupported ? cachedReply : null,
              attachments: insertedAttachments,
              reactions: [],
              receipts: resolvedReceipts,
            };

      setMessagesByThread((prev) => {
        const list = prev[threadId] ?? [];
        const exists = list.some((msg) => msg.id === messageRecord.id);
        const enrichedRecord = enrichMessageWithCache(messageRecord, prev);
        const nextList = exists
          ? list.map((msg) => (msg.id === enrichedRecord.id ? enrichedRecord : msg))
          : [...list, enrichedRecord];
        return { ...prev, [threadId]: nextList };
      });

      setThreads((prev) =>
        sortThreads(
          prev.map((thread) =>
            thread.id === threadId
              ? { ...thread, last_message_at: messageRecord.created_at, unread_count: 0 }
              : thread
          )
        )
      );
    },
    [attachmentsSupported, handleAttachmentsMissing, handleRepliesMissing, messagesByThread, repliesSupported, uploadAttachmentsToStorage]
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentUserId) return;
      const normalizedEmoji = emoji.trim();
      if (!normalizedEmoji) return;
      if (!reactionsSupported) return;

      let targetThreadId: string | null = null;
      let targetMessage: PersonnelChatMessage | null = null;

      for (const [threadKey, messages] of Object.entries(messagesByThread)) {
        const found = messages.find((msg) => msg.id === messageId);
        if (found) {
          targetThreadId = threadKey;
          targetMessage = found;
          break;
        }
      }

      if (!targetThreadId || !targetMessage) return;

      const userAlreadyReacted = targetMessage.reactions.some(
        (reaction) => reaction.emoji === normalizedEmoji && reaction.user_ids.includes(currentUserId)
      );

      const applyReactions = (nextReactions: PersonnelChatMessageReaction[]) => {
        setMessagesByThread((prev) => {
          const threadMessages = prev[targetThreadId!];
          if (!threadMessages) return prev;
          const index = threadMessages.findIndex((msg) => msg.id === messageId);
          if (index === -1) return prev;
          const updatedMessage: PersonnelChatMessage = {
            ...threadMessages[index],
            reactions: nextReactions,
          };
          return {
            ...prev,
            [targetThreadId!]: [
              ...threadMessages.slice(0, index),
              updatedMessage,
              ...threadMessages.slice(index + 1),
            ],
          };
        });
      };

      try {
        const { data, error } = await supabase.rpc('personnel_chat_toggle_reaction', {
          p_message_id: messageId,
          p_user_id: currentUserId,
          p_emoji: normalizedEmoji,
        });
        if (error) {
          if (handleReactionsMissing(error)) return;
          throw error;
        }
        const parsed = parseReactions(data ?? []);
        applyReactions(parsed);
        return;
      } catch (rpcError) {
        console.warn('toggle chat reaction via rpc failed', rpcError);
      }

      try {
        if (!reactionsSupported) return;
        if (userAlreadyReacted) {
          const { error } = await supabase
            .from('personnel_chat_message_reactions')
            .delete()
            .eq('message_id', messageId)
            .eq('user_id', currentUserId)
            .eq('emoji', normalizedEmoji);
          if (error) {
            if (handleReactionsMissing(error)) return;
            throw error;
          }
        } else {
          const { error } = await supabase
            .from('personnel_chat_message_reactions')
            .insert({
              message_id: messageId,
              user_id: currentUserId,
              emoji: normalizedEmoji,
            });
          if (error) {
            if (handleReactionsMissing(error)) return;
            throw error;
          }
        }

        const { data, error: aggError } = await supabase
          .from('personnel_chat_message_reactions')
          .select('message_id, emoji, user_id')
          .eq('message_id', messageId);
        if (aggError) {
          if (handleReactionsMissing(aggError)) return;
          throw aggError;
        }

        const aggregated = aggregateReactions(
          (data ?? []).map((row: any) => ({
            message_id: String(row.message_id),
            emoji: String(row.emoji),
            user_id: String(row.user_id),
          }))
        );
        applyReactions(aggregated[messageId] ?? []);
      } catch (fallbackError) {
        console.error('toggle chat reaction', fallbackError);
      }
    },
    [currentUserId, handleReactionsMissing, messagesByThread, reactionsSupported]
  );

  const createOrGetDirectThread = useCallback(
    async (otherUserId: string) => {
      if (!currentUserId) throw new Error('Utilisateur non authentifié');
      const existing = threads.find((thread) => {
        if (thread.is_group) return false;
        const ids = new Set(thread.participants.map((p) => p.user_id));
        return ids.has(currentUserId) && ids.has(otherUserId) && ids.size === 2;
      });
      if (existing) {
        setActiveThreadId(existing.id);
        return existing;
      }

      setCreatingThread(true);
      try {
        let thread: PersonnelChatThread | null = null;
        try {
          const { data, error } = await supabase.rpc('personnel_chat_start_direct_thread', {
            p_requester: currentUserId,
            p_partner: otherUserId,
          });
          if (error) throw error;
          const row = data && data.length > 0 ? data[0] : null;
          if (row) {
            thread = parseThreadRow(row);
          }
        } catch (rpcError) {
          console.warn('create direct chat thread via rpc failed', rpcError);
        }

        if (!thread) {
          const { data: createdThread, error: threadError } = await supabase
            .from('personnel_chat_threads')
            .insert({ is_group: false })
            .select('id, topic, is_group, created_at, updated_at, last_message_at')
            .single();
          if (threadError || !createdThread) throw threadError;

          const nowIso = new Date().toISOString();

          const insertParticipant = async (userId: string, lastRead: string | null) => {
            const { error } = await supabase
              .from('personnel_chat_participants')
              .insert({
                thread_id: createdThread.id,
                user_id: userId,
                added_at: nowIso,
                last_read_at: lastRead,
              });
            if (error) throw error;
          };

          await insertParticipant(currentUserId, nowIso);
          await insertParticipant(otherUserId, null);

          thread = {
            id: createdThread.id,
            topic: createdThread.topic ?? null,
            is_group: false,
            created_at: createdThread.created_at,
            updated_at: createdThread.updated_at,
            last_message_at: createdThread.last_message_at ?? null,
            unread_count: 0,
            participants: [
              {
                thread_id: createdThread.id,
                user_id: currentUserId,
                added_at: nowIso,
                last_read_at: nowIso,
              },
              {
                thread_id: createdThread.id,
                user_id: otherUserId,
                added_at: nowIso,
                last_read_at: null,
              },
            ],
          };
        }

        if (!thread) {
          throw new Error('Impossible de créer la conversation privée');
        }

        setThreads((prev) => sortThreads([...prev.filter((t) => t.id !== thread.id), thread]));
        setActiveThreadId(thread.id);
        return thread;
      } catch (err) {
        console.error('create direct chat thread', err);
        throw err;
      } finally {
        setCreatingThread(false);
      }
    },
    [currentUserId, threads]
  );

  const messages = useMemo(() => {
    if (!activeThreadId) return [] as PersonnelChatMessage[];
    return messagesByThread[activeThreadId] ?? [];
  }, [activeThreadId, messagesByThread]);

  return {
    threads,
    threadsLoading,
    threadsError,
    refreshThreads: loadThreads,
    activeThreadId,
    setActiveThreadId,
    messages,
    messagesError,
    loadingMessages: loadingMessagesFor === activeThreadId,
    sendMessage,
    loadMessages,
    createOrGetDirectThread,
    creatingThread,
    markThreadAsRead,
    toggleReaction,
    reactionsSupported,
    repliesSupported,
    attachmentsSupported,
  };
};
