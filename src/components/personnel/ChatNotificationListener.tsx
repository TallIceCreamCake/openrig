import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

type ThreadParticipantSummary = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type ThreadSummary = {
  topic: string | null;
  is_group: boolean;
  participants: ThreadParticipantSummary[];
};

const parseParticipants = (value: any): ThreadParticipantSummary[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || !entry.user_id) return null;
      const user = entry.user ?? {};
      return {
        user_id: String(entry.user_id),
        full_name:
          user.full_name !== undefined && user.full_name !== null
            ? String(user.full_name)
            : null,
        avatar_url:
          user.avatar_url !== undefined && user.avatar_url !== null
            ? String(user.avatar_url)
            : null,
      };
    })
    .filter((entry): entry is ThreadParticipantSummary => Boolean(entry?.user_id));
};

const ChatNotificationListener = () => {
  const { user } = useAuth();
  const membershipRef = useRef<Set<string>>(new Set());
  const threadCacheRef = useRef<Map<string, ThreadSummary>>(new Map());
  const processedSetRef = useRef<Set<string>>(new Set());
  const processedOrderRef = useRef<string[]>([]);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  const markProcessed = useCallback((messageId: string) => {
    const set = processedSetRef.current;
    if (set.has(messageId)) return false;
    set.add(messageId);
    processedOrderRef.current.push(messageId);
    const overflow = processedOrderRef.current.length - 200;
    if (overflow > 0) {
      for (let i = 0; i < overflow; i += 1) {
        const oldest = processedOrderRef.current.shift();
        if (oldest) {
          set.delete(oldest);
        }
      }
    }
    return true;
  }, []);

  const loadThreadsFallback = useCallback(async () => {
    if (!user?.id) {
      membershipRef.current = new Set();
      threadCacheRef.current = new Map();
      return;
    }

    try {
      const { data: membershipRows, error: membershipError } = await supabase
        .from('personnel_chat_participants')
        .select('thread_id')
        .eq('user_id', user.id);
      if (membershipError) throw membershipError;

      const threadIds = (membershipRows ?? [])
        .map((row) => (row?.thread_id ? String(row.thread_id) : null))
        .filter((value): value is string => Boolean(value));
      const memberships = new Set<string>(threadIds);
      const cache = new Map<string, ThreadSummary>();

      if (threadIds.length > 0) {
        const [{ data: threadRows, error: threadsError }, { data: participantsRows, error: participantsError }] =
          await Promise.all([
            supabase
              .from('personnel_chat_threads')
              .select('id, topic, is_group')
              .in('id', threadIds),
            supabase
              .from('personnel_chat_participants')
              .select('thread_id, user_id, user:app_users(id, full_name, avatar_url)')
              .in('thread_id', threadIds),
          ]);
        if (threadsError) throw threadsError;
        if (participantsError) throw participantsError;

        const participantsByThread = new Map<string, any[]>();
        (participantsRows ?? []).forEach((row: any) => {
          if (!row || !row.thread_id) return;
          const key = String(row.thread_id);
          if (!participantsByThread.has(key)) {
            participantsByThread.set(key, []);
          }
          participantsByThread.get(key)!.push({
            thread_id: row.thread_id,
            user_id: row.user_id,
            user: row.user ?? null,
          });
        });

        (threadRows ?? []).forEach((row: any) => {
          if (!row || !row.id) return;
          const threadId = String(row.id);
          cache.set(threadId, {
            topic: row.topic ?? null,
            is_group: !!row.is_group,
            participants: parseParticipants(participantsByThread.get(threadId) ?? []),
          });
        });
      }

      membershipRef.current = memberships;
      threadCacheRef.current = cache;
    } catch (error) {
      console.error('load chat thread summaries fallback', error);
    }
  }, [user?.id]);

  const refreshThreads = useCallback(async () => {
    if (!user?.id) {
      membershipRef.current = new Set();
      threadCacheRef.current = new Map();
      return;
    }

    const request = (async () => {
      try {
        const { data, error } = await supabase.rpc('personnel_chat_get_threads', {
          p_user_id: user.id,
        });
        if (error) throw error;
        const memberships = new Set<string>();
        const cache = new Map<string, ThreadSummary>();
        (data ?? []).forEach((row: any) => {
          if (!row || !row.id) return;
          const threadId = String(row.id);
          memberships.add(threadId);
          cache.set(threadId, {
            topic: row.topic ?? null,
            is_group: !!row.is_group,
            participants: parseParticipants(row.participants ?? []),
          });
        });
        membershipRef.current = memberships;
        threadCacheRef.current = cache;
      } catch (error) {
        console.warn('load chat thread summaries via rpc failed', error);
        await loadThreadsFallback();
      }
    })();
    refreshPromiseRef.current = request;
    try {
      await request;
    } finally {
      if (refreshPromiseRef.current === request) {
        refreshPromiseRef.current = null;
      }
    }
  }, [loadThreadsFallback, user?.id]);

  const ensureMembership = useCallback(
    async (threadId: string) => {
      if (membershipRef.current.has(threadId)) return true;
      if (refreshPromiseRef.current) {
        try {
          await refreshPromiseRef.current;
        } catch {
          // ignore failure; we'll attempt a fresh refresh below
        }
      }
      if (membershipRef.current.has(threadId)) return true;
      await refreshThreads();
      return membershipRef.current.has(threadId);
    },
    [refreshThreads],
  );

  const getThreadSummary = useCallback(
    async (threadId: string): Promise<ThreadSummary | null> => {
      if (threadCacheRef.current.has(threadId)) {
        return threadCacheRef.current.get(threadId) ?? null;
      }

      if (refreshPromiseRef.current) {
        try {
          await refreshPromiseRef.current;
        } catch {
          // ignore; a fresh refresh will follow if needed
        }
      }
      if (!threadCacheRef.current.has(threadId)) {
        await refreshThreads();
      }
      if (threadCacheRef.current.has(threadId)) {
        return threadCacheRef.current.get(threadId) ?? null;
      }

      if (!user?.id) return null;

      try {
        const [{ data: thread, error: threadError }, { data: participants, error: participantsError }] =
          await Promise.all([
            supabase
              .from('personnel_chat_threads')
              .select('id, topic, is_group')
              .eq('id', threadId)
              .maybeSingle(),
            supabase
              .from('personnel_chat_participants')
              .select('user_id, user:app_users(id, full_name, avatar_url)')
              .eq('thread_id', threadId),
          ]);
        if (threadError) throw threadError;
        if (participantsError) throw participantsError;
        if (!thread) return null;
        const list = parseParticipants(participants ?? []);
        const hasSelf = list.some((entry) => entry.user_id === user.id);
        const summary: ThreadSummary = {
          topic: thread.topic ?? null,
          is_group: !!thread.is_group,
          participants: list,
        };
        threadCacheRef.current.set(threadId, summary);
        if (hasSelf) {
          membershipRef.current.add(threadId);
        }
        return summary;
      } catch (error) {
        console.error('load chat thread summary', error);
        return null;
      }
    },
    [refreshThreads, user?.id],
  );

  useEffect(() => {
    if (!user?.id) {
      membershipRef.current = new Set();
      threadCacheRef.current = new Map();
      processedSetRef.current = new Set();
      processedOrderRef.current = [];
      return;
    }
    void refreshThreads();
  }, [refreshThreads, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`personnel-chat-memberships-feed-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'personnel_chat_participants',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void refreshThreads();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshThreads, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`personnel-chat-notifier-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'personnel_chat_messages',
        },
        (payload) => {
          const record = payload.new as {
            id?: string;
            thread_id?: string;
            author_id?: string;
            message?: string | null;
            created_at?: string;
          } | null;
          if (!record || !record.id || !record.thread_id) return;
          const messageId = String(record.id);
          if (!markProcessed(messageId)) return;
          const threadId = String(record.thread_id);
          const authorId = record.author_id ? String(record.author_id) : null;
          if (!authorId || authorId === user.id) return;

          void (async () => {
            const belongs = await ensureMembership(threadId);
            if (!belongs) return;
            await getThreadSummary(threadId);
          })();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ensureMembership, getThreadSummary, markProcessed, user?.id]);

  // This component only listens to realtime events
  return null;
};

export default ChatNotificationListener;
