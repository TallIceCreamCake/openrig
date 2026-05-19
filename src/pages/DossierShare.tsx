import React from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import JSZip from 'jszip';
import { ArrowLeft, ChevronRight, FileText, Folder, Home, Briefcase, Users, Calendar, Camera, Image, Music, Video, ShieldCheck, Wrench, Truck, Star } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Input from '../components/ui/Input';
import { ColorPickerButton } from '../components/ui-kit';
import toast from 'react-hot-toast';

type ShareEntry = {
  id: string;
  parent_id: string | null;
  entry_type: 'folder' | 'file';
  name: string;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  color: string | null;
  icon: string | null;
  created_at: string;
};

type ShareResponse = {
  share: {
    id: string;
    rentalId: string;
    rootEntryId: string | null;
    created_at: string;
    expires_at: string | null;
    requiresPassword?: boolean;
    accessMode?: 'viewer' | 'editor';
    whitelistEnabled?: boolean;
  };
  rental: { id: string; title: string | null; reference_code: string | null; type: string | null } | null;
  rootEntry: ShareEntry | null;
  entries: ShareEntry[];
};

const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);
const previewableExtensions = new Set([...imageExtensions, 'pdf']);

const formatFileSize = (size?: number | null) => {
  if (!size || size <= 0) return '—';
  const units = ['octets', 'Ko', 'Mo', 'Go'];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const digits = index === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[index]}`;
};

const DEFAULT_FOLDER_COLOR = '#f59e0b';
const DEFAULT_FILE_COLOR = '#3b82f6';
const SHARE_COOKIE_PATH = '/share/dossier';
const SHARE_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getCookieValue = (name: string) => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${escapeRegExp(name)}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

const setCookieValue = (name: string, value: string, maxAgeSeconds?: number) => {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${SHARE_COOKIE_PATH}`, 'SameSite=Lax'];
  if (maxAgeSeconds) {
    parts.push(`Max-Age=${Math.floor(maxAgeSeconds)}`);
  }
  if (window.location.protocol === 'https:') {
    parts.push('Secure');
  }
  document.cookie = parts.join('; ');
};

const removeCookieValue = (name: string) => {
  const parts = [`${name}=`, `Path=${SHARE_COOKIE_PATH}`, 'SameSite=Lax', 'Max-Age=0'];
  if (window.location.protocol === 'https:') {
    parts.push('Secure');
  }
  document.cookie = parts.join('; ');
};

const sanitizeFilename = (value: string) => {
  const cleaned = value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'document';
};

const isPreviewableEntry = (entry: ShareEntry) => {
  if (entry.entry_type !== 'file') return false;
  const ext = entry.name.includes('.') ? entry.name.split('.').pop()?.toLowerCase() ?? '' : '';
  if (previewableExtensions.has(ext)) return true;
  if (entry.file_type?.startsWith('image/')) return true;
  return entry.file_type === 'application/pdf';
};

const isImageEntry = (entry: ShareEntry) => {
  if (entry.entry_type !== 'file') return false;
  if (entry.file_type?.startsWith('image/')) return true;
  const ext = entry.name.includes('.') ? entry.name.split('.').pop()?.toLowerCase() ?? '' : '';
  return imageExtensions.has(ext);
};

const normalizeHexColor = (value: string) => {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
};

const withHexAlpha = (value: string, alpha: string) => {
  const normalized = normalizeHexColor(value);
  if (!normalized || !/^[0-9a-fA-F]{2}$/.test(alpha)) return null;
  return `${normalized}${alpha.toLowerCase()}`;
};

const dataUrlToBlob = (dataUrl: string) => {
  if (!dataUrl.startsWith('data:')) return null;
  const parts = dataUrl.split(',');
  if (parts.length < 2) return null;
  const header = parts[0];
  const base64 = parts.slice(1).join(',');
  const mimeMatch = header.match(/data:(.*?);base64/i);
  const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  try {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  } catch {
    return null;
  }
};

const getEntryBlob = async (entry: ShareEntry) => {
  if (!entry.file_url) throw new Error('missing_file_url');
  if (entry.file_url.startsWith('data:')) {
    const blob = dataUrlToBlob(entry.file_url);
    if (!blob) throw new Error('invalid_data_url');
    return blob;
  }
  const response = await fetch(entry.file_url);
  if (!response.ok) throw new Error('fetch_failed');
  return response.blob();
};

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('read_failed'));
  reader.readAsDataURL(file);
});

const DOSSIER_ICON_OPTIONS: Array<{ id: string; label: string; Icon: LucideIcon }> = [
  { id: 'folder', label: 'Dossier', Icon: Folder },
  { id: 'briefcase', label: 'Projet', Icon: Briefcase },
  { id: 'users', label: 'Equipe', Icon: Users },
  { id: 'calendar', label: 'Planning', Icon: Calendar },
  { id: 'camera', label: 'Photo', Icon: Camera },
  { id: 'image', label: 'Images', Icon: Image },
  { id: 'music', label: 'Audio', Icon: Music },
  { id: 'video', label: 'Video', Icon: Video },
  { id: 'shield', label: 'Assurance', Icon: ShieldCheck },
  { id: 'wrench', label: 'Technique', Icon: Wrench },
  { id: 'truck', label: 'Logistique', Icon: Truck },
  { id: 'star', label: 'Important', Icon: Star },
];

const DOSSIER_ICON_MAP = new Map(DOSSIER_ICON_OPTIONS.map((item) => [item.id, item.Icon]));
const DOSSIER_ICON_LABELS = new Map(DOSSIER_ICON_OPTIONS.map((item) => [item.id, item.label]));

const getEntryContainerStyle = (entry: ShareEntry) => {
  if (!entry.color) return undefined;
  const backgroundColor = withHexAlpha(entry.color, '33') ?? undefined;
  const borderColor = entry.color;
  return {
    backgroundColor,
    borderColor,
  } as React.CSSProperties;
};

const getEntryToneClass = (entry: ShareEntry) => {
  if (entry.color) return '';
  return entry.entry_type === 'folder'
    ? 'bg-amber-50 text-amber-600 border-amber-100'
    : 'bg-blue-50 text-blue-600 border-blue-100';
};

const getEntryIconStyle = (entry: ShareEntry) => {
  if (!entry.color) return undefined;
  return {
    color: entry.color,
  } as React.CSSProperties;
};

const resolveFolderIcon = (entry: ShareEntry) => {
  if (entry.entry_type !== 'folder') return Folder;
  return DOSSIER_ICON_MAP.get(entry.icon || 'folder') ?? Folder;
};

const resolveFolderIconLabel = (iconId: string | null) => {
  if (!iconId) return 'Dossier';
  return DOSSIER_ICON_LABELS.get(iconId) ?? 'Dossier';
};

const entryTypeLabel = (entry: ShareEntry) => {
  if (entry.entry_type === 'folder') return 'Dossier';
  const name = entry.name;
  const ext = name.includes('.') ? name.split('.').pop() : '';
  if (ext) return ext.toUpperCase();
  if (entry.file_type) {
    const parts = entry.file_type.split('/');
    return (parts[1] || parts[0]).toUpperCase();
  }
  return 'Fichier';
};

const DossierShare: React.FC = () => {
  const { token } = useParams();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = React.useState(false);
  const [requiresWhitelist, setRequiresWhitelist] = React.useState(false);
  const [passwordValue, setPasswordValue] = React.useState('');
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = React.useState(false);
  const [whitelistEmail, setWhitelistEmail] = React.useState('');
  const [whitelistCode, setWhitelistCode] = React.useState('');
  const [whitelistStep, setWhitelistStep] = React.useState<'email' | 'code'>('email');
  const [whitelistError, setWhitelistError] = React.useState<string | null>(null);
  const [whitelistSending, setWhitelistSending] = React.useState(false);
  const [whitelistVerifying, setWhitelistVerifying] = React.useState(false);
  const [shareAccessToken, setShareAccessToken] = React.useState<string | null>(null);
  const [accessMode, setAccessMode] = React.useState<'viewer' | 'editor'>('viewer');
  const [entries, setEntries] = React.useState<ShareEntry[]>([]);
  const [rootEntry, setRootEntry] = React.useState<ShareEntry | null>(null);
  const [rental, setRental] = React.useState<ShareResponse['rental']>(null);
  const [shareRootId, setShareRootId] = React.useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = React.useState<string | null>(null);
  const [previewEntryId, setPreviewEntryId] = React.useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = React.useState<string | null>(null);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; entryId: string | null } | null>(null);
  const [pasteTargetId, setPasteTargetId] = React.useState<string | null>(null);
  const [clipboard, setClipboard] = React.useState<{ entryId: string; mode: 'copy' | 'cut' } | null>(null);
  const [infoEntryId, setInfoEntryId] = React.useState<string | null>(null);
  const [nameModalOpen, setNameModalOpen] = React.useState(false);
  const [nameModalMode, setNameModalMode] = React.useState<'create' | 'edit'>('create');
  const [nameModalValue, setNameModalValue] = React.useState('');
  const [nameModalEntryId, setNameModalEntryId] = React.useState<string | null>(null);
  const [nameModalSaving, setNameModalSaving] = React.useState(false);
  const [nameModalColor, setNameModalColor] = React.useState(DEFAULT_FOLDER_COLOR);
  const [nameModalIcon, setNameModalIcon] = React.useState('folder');
  const [nameModalColorDirty, setNameModalColorDirty] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [zippingId, setZippingId] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const nameInputRef = React.useRef<HTMLInputElement | null>(null);

  const fetchShare = React.useCallback(async (accessTokenOverride?: string) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      const cookieAccess = !accessTokenOverride && !shareAccessToken && token
        ? getCookieValue(`share_access_${token}`)
        : null;
      const accessTokenToSend = accessTokenOverride ?? shareAccessToken ?? cookieAccess;
      const didSendAccess = Boolean(accessTokenToSend);
      if (accessTokenToSend) {
        headers['x-share-access'] = accessTokenToSend;
        if (cookieAccess && shareAccessToken !== cookieAccess) {
          setShareAccessToken(cookieAccess);
        }
      }
      const res = await fetch(`/api/dossier-shares/${token}`, { cache: 'no-store', headers });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        if ((res.status === 401 || res.status === 403) && payload?.requiresWhitelist) {
          setRequiresWhitelist(true);
          setWhitelistError(payload?.error || 'Accès restreint.');
          setRequiresPassword(false);
          setWhitelistStep('email');
          setWhitelistCode('');
          setShareAccessToken(null);
          if (token && didSendAccess) {
            removeCookieValue(`share_access_${token}`);
          }
          return;
        }
        if ((res.status === 401 || res.status === 403) && payload?.requiresPassword) {
          setRequiresPassword(true);
          setPasswordError(payload?.error || (res.status === 403 ? 'Mot de passe incorrect.' : null));
          setShareAccessToken(null);
          if (token && didSendAccess) {
            removeCookieValue(`share_access_${token}`);
          }
          return;
        }
        throw new Error(payload?.error || 'Lien invalide');
      }
      const data = (await res.json()) as ShareResponse;
      setEntries(data.entries || []);
      setRootEntry(data.rootEntry || null);
      setRental(data.rental || null);
      const rootId = data.share?.rootEntryId ?? null;
      setShareRootId(rootId);
      setCurrentFolderId(rootId);
      const mode = data.share?.accessMode === 'editor' ? 'editor' : 'viewer';
      setAccessMode(mode);
      setRequiresWhitelist(false);
      setWhitelistError(null);
      if (mode !== 'editor') {
        setClipboard(null);
      }
      setSelectedEntryId(null);
      setContextMenu(null);
      setRequiresPassword(false);
      setPasswordError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de charger le partage.';
      setRequiresPassword(false);
      setRequiresWhitelist(false);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [shareAccessToken, token]);

  React.useEffect(() => {
    void fetchShare();
  }, [fetchShare]);

  React.useEffect(() => {
    if (!token) {
      setShareAccessToken(null);
      setPasswordValue('');
      return;
    }
    const savedAccess = getCookieValue(`share_access_${token}`);
    setShareAccessToken(savedAccess);
    setPasswordValue('');
  }, [token]);

  React.useEffect(() => {
    const title = rootEntry?.name || rental?.title || 'Dossier partagé';
    document.title = title;
  }, [rootEntry, rental]);

  React.useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu]);

  React.useEffect(() => {
    if (!nameModalOpen) return;
    const timer = window.setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [nameModalOpen]);

  React.useEffect(() => {
    setSelectedEntryId(null);
    setContextMenu(null);
    setPasteTargetId(null);
  }, [currentFolderId]);

  const entryMap = React.useMemo(() => {
    const map = new Map<string, ShareEntry>();
    entries.forEach((entry) => {
      map.set(entry.id, entry);
    });
    return map;
  }, [entries]);

  const contextEntry = React.useMemo(() => {
    if (!contextMenu?.entryId) return null;
    return entryMap.get(contextMenu.entryId) || null;
  }, [contextMenu, entryMap]);

  const infoEntry = React.useMemo(() => {
    if (!infoEntryId) return null;
    return entryMap.get(infoEntryId) || null;
  }, [infoEntryId, entryMap]);

  const nameModalEntry = React.useMemo(() => {
    if (!nameModalEntryId) return null;
    return entryMap.get(nameModalEntryId) || null;
  }, [nameModalEntryId, entryMap]);

  const entriesInView = React.useMemo(() => {
    return entries.filter((entry) => (entry.parent_id ?? null) === currentFolderId);
  }, [entries, currentFolderId]);

  const pathSegments = React.useMemo(() => {
    if (!currentFolderId) return [] as ShareEntry[];
    const segments: ShareEntry[] = [];
    let current = entryMap.get(currentFolderId) || null;
    while (current) {
      segments.unshift(current);
      if (current.id === shareRootId || current.parent_id === null) break;
      current = current.parent_id ? entryMap.get(current.parent_id) || null : null;
    }
    return segments;
  }, [currentFolderId, entryMap, shareRootId]);

  const previewEntry = React.useMemo(() => {
    if (!previewEntryId) return null;
    return entries.find((entry) => entry.id === previewEntryId) || null;
  }, [entries, previewEntryId]);

  const isEditor = accessMode === 'editor';
  const rootLabel = rootEntry?.name || rental?.title || 'Dossier partagé';
  const rootSubtitle = rental?.reference_code ? `Référence ${rental.reference_code}` : null;
  const backDisabled = shareRootId ? currentFolderId === shareRootId : currentFolderId === null;

  const handleBack = () => {
    if (backDisabled) return;
    const current = currentFolderId ? entryMap.get(currentFolderId) : null;
    setCurrentFolderId(current?.parent_id ?? null);
  };

  const buildShareHeaders = React.useCallback((withJson = false) => {
    const headers: Record<string, string> = {};
    if (withJson) {
      headers['Content-Type'] = 'application/json';
    }
    if (shareAccessToken) {
      headers['x-share-access'] = shareAccessToken;
    }
    return headers;
  }, [shareAccessToken]);

  const refreshShare = React.useCallback(async () => {
    await fetchShare();
  }, [fetchShare]);

  const openContextMenu = (event: React.MouseEvent, entryId: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    if (!entryId && !isEditor) return;
    const menuWidth = 220;
    const menuHeight = entryId ? (isEditor ? 360 : 160) : (isEditor ? 200 : 0);
    const padding = 12;
    const maxX = window.innerWidth - menuWidth - padding;
    const maxY = window.innerHeight - menuHeight - padding;
    const clampedX = Math.min(Math.max(event.clientX, padding), maxX > padding ? maxX : padding);
    const clampedY = Math.min(Math.max(event.clientY, padding), maxY > padding ? maxY : padding);
    setContextMenu({ x: clampedX, y: clampedY, entryId });
    const entry = entryId ? entryMap.get(entryId) || null : null;
    const nextPasteTarget = entry?.entry_type === 'folder' ? entry.id : currentFolderId;
    setPasteTargetId(nextPasteTarget ?? null);
    if (entryId) {
      setSelectedEntryId(entryId);
    }
  };

  const closeNameModal = () => {
    setNameModalOpen(false);
    setNameModalValue('');
    setNameModalEntryId(null);
    setNameModalColor(DEFAULT_FOLDER_COLOR);
    setNameModalIcon('folder');
    setNameModalColorDirty(false);
  };

  const openNameModal = (mode: 'create' | 'edit', entry?: ShareEntry) => {
    setContextMenu(null);
    setNameModalMode(mode);
    setNameModalEntryId(entry?.id ?? null);
    setNameModalValue(entry?.name ?? '');
    if (mode === 'create') {
      setNameModalColor(DEFAULT_FOLDER_COLOR);
      setNameModalIcon('folder');
      setNameModalColorDirty(false);
    } else if (entry) {
      setNameModalColor(entry.color || (entry.entry_type === 'folder' ? DEFAULT_FOLDER_COLOR : DEFAULT_FILE_COLOR));
      setNameModalIcon(entry.icon || 'folder');
      setNameModalColorDirty(false);
    }
    setNameModalOpen(true);
  };

  const createShareFolder = async (name: string, color: string | null, icon: string | null) => {
    if (!isEditor || !token) return false;
    const trimmed = name.trim();
    if (!trimmed) return false;
    try {
      const response = await fetch(`/api/dossier-shares/${token}/folders`, {
        method: 'POST',
        headers: buildShareHeaders(true),
        body: JSON.stringify({
          parentId: currentFolderId,
          name: trimmed,
          color,
          icon,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Impossible de créer le dossier.');
      }
      await refreshShare();
      toast.success('Dossier créé');
      return true;
    } catch (err) {
      console.error('share create folder', err);
      toast.error('Impossible de créer le dossier');
      return false;
    }
  };

  const updateShareEntry = async (entry: ShareEntry, name: string, color: string | null, icon: string | null) => {
    if (!isEditor || !token) return false;
    const trimmed = name.trim();
    if (!trimmed) return false;
    try {
      const response = await fetch(`/api/dossier-shares/${token}/entries/${entry.id}`, {
        method: 'PATCH',
        headers: buildShareHeaders(true),
        body: JSON.stringify({
          name: trimmed,
          color,
          icon,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Impossible de modifier.');
      }
      await refreshShare();
      toast.success('Mise à jour effectuée');
      return true;
    } catch (err) {
      console.error('share update entry', err);
      toast.error('Impossible de modifier');
      return false;
    }
  };

  const handleConfirmNameModal = async () => {
    if (nameModalSaving) return;
    const value = nameModalValue.trim();
    if (!value) {
      toast.error('Nom requis');
      return;
    }
    const normalizedColor = normalizeHexColor(nameModalColor);
    if (nameModalColorDirty && !normalizedColor) {
      toast.error('Couleur invalide');
      return;
    }
    setNameModalSaving(true);
    try {
      let success = false;
      const baseDefaultColor = nameModalMode === 'create'
        ? DEFAULT_FOLDER_COLOR
        : (nameModalEntry?.entry_type === 'folder' ? DEFAULT_FOLDER_COLOR : DEFAULT_FILE_COLOR);
      const colorForSave = (() => {
        if (!nameModalColorDirty) {
          return nameModalMode === 'create'
            ? null
            : (nameModalEntry?.color ?? null);
        }
        if (!normalizedColor) return null;
        return normalizedColor === baseDefaultColor ? null : normalizedColor;
      })();
      const iconForSave = nameModalEntry?.entry_type === 'folder' || nameModalMode === 'create'
        ? nameModalIcon
        : null;
      if (nameModalMode === 'create') {
        success = await createShareFolder(value, colorForSave, iconForSave);
      } else if (nameModalEntry) {
        success = await updateShareEntry(nameModalEntry, value, colorForSave, iconForSave);
      }
      if (success) {
        closeNameModal();
      }
    } finally {
      setNameModalSaving(false);
    }
  };

  const handleDeleteEntry = async (entry: ShareEntry) => {
    if (!isEditor || !token) return;
    const label = entry.entry_type === 'folder'
      ? 'Supprimer ce dossier et son contenu ?'
      : 'Supprimer ce fichier ?';
    if (!window.confirm(label)) return;
    try {
      const response = await fetch(`/api/dossier-shares/${token}/entries/${entry.id}`, {
        method: 'DELETE',
        headers: buildShareHeaders(false),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Suppression impossible.');
      }
      await refreshShare();
      toast.success(entry.entry_type === 'folder' ? 'Dossier supprimé' : 'Fichier supprimé');
    } catch (err) {
      console.error('share delete entry', err);
      toast.error('Suppression impossible');
    }
  };

  const handleDuplicateEntry = async (entry: ShareEntry, destinationParentId?: string | null) => {
    if (!isEditor || !token) return;
    try {
      const response = await fetch(`/api/dossier-shares/${token}/entries/${entry.id}/duplicate`, {
        method: 'POST',
        headers: buildShareHeaders(true),
        body: JSON.stringify({
          destinationParentId: destinationParentId ?? entry.parent_id ?? null,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Impossible de dupliquer.');
      }
      await refreshShare();
      toast.success('Dupliqué');
    } catch (err) {
      console.error('share duplicate entry', err);
      toast.error('Impossible de dupliquer');
    }
  };

  const handlePasteEntry = async () => {
    if (!isEditor || !token || !clipboard) return;
    const entry = entryMap.get(clipboard.entryId);
    if (!entry) {
      toast.error('Élément introuvable');
      return;
    }
    const targetParentId = pasteTargetId ?? currentFolderId ?? null;
    if (clipboard.mode === 'copy') {
      await handleDuplicateEntry(entry, targetParentId);
      return;
    }
    try {
      const response = await fetch(`/api/dossier-shares/${token}/entries/${entry.id}`, {
        method: 'PATCH',
        headers: buildShareHeaders(true),
        body: JSON.stringify({ parentId: targetParentId }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Impossible de déplacer.');
      }
      setClipboard(null);
      await refreshShare();
      toast.success('Déplacé');
    } catch (err) {
      console.error('share paste entry', err);
      toast.error('Impossible de déplacer');
    }
  };

  const handleUploadFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!isEditor || !token || uploading) return;
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const payloads = await Promise.all(files.map(async (file) => ({
        name: file.name,
        file_url: await fileToDataUrl(file),
        file_type: file.type || null,
        file_size: Number.isFinite(file.size) ? file.size : null,
        color: null,
      })));
      const response = await fetch(`/api/dossier-shares/${token}/files`, {
        method: 'POST',
        headers: buildShareHeaders(true),
        body: JSON.stringify({
          parentId: currentFolderId,
          files: payloads,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Import impossible.');
      }
      await refreshShare();
      toast.success('Fichier(s) importé(s)');
    } catch (err) {
      console.error('share upload files', err);
      toast.error("Impossible d'importer les fichiers");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDownloadFile = (entry: ShareEntry) => {
    if (!entry.file_url) return;
    const anchor = document.createElement('a');
    anchor.href = entry.file_url;
    anchor.download = entry.name || undefined;
    anchor.rel = 'noopener';
    anchor.click();
  };

  const handleDownloadZip = async (entry: ShareEntry) => {
    if (zippingId || entry.entry_type !== 'folder') return;
    setZippingId(entry.id);
    try {
      const zip = new JSZip();
      const addFolder = async (folderId: string, prefix: string) => {
        const children = entries.filter((item) => item.parent_id === folderId);
        for (const child of children) {
          if (child.entry_type === 'folder') {
            await addFolder(child.id, `${prefix}${sanitizeFilename(child.name)}/`);
          } else if (child.file_url) {
            const blob = await getEntryBlob(child);
            zip.file(`${prefix}${sanitizeFilename(child.name)}`, blob);
          }
        }
      };
      await addFolder(entry.id, `${sanitizeFilename(entry.name)}/`);
      const content = await zip.generateAsync({ type: 'blob' });
      const downloadName = `${sanitizeFilename(entry.name)}.zip`;
      const url = URL.createObjectURL(content);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = downloadName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('share zip error', err);
      toast.error('Impossible de compresser');
    } finally {
      setZippingId(null);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || passwordSubmitting) return;
    const trimmed = passwordValue.trim();
    if (!trimmed) {
      setPasswordError('Mot de passe requis.');
      return;
    }
    setPasswordSubmitting(true);
    setPasswordError(null);
    try {
      const response = await fetch(`/api/dossier-shares/${token}/password/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: trimmed }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Mot de passe incorrect.');
      }
      if (payload?.access_token) {
        setShareAccessToken(payload.access_token);
        setCookieValue(`share_access_${token}`, payload.access_token, SHARE_COOKIE_MAX_AGE);
      }
      setRequiresPassword(false);
      setPasswordValue('');
      await fetchShare(payload?.access_token);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mot de passe incorrect.';
      setPasswordError(message);
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleWhitelistRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || whitelistSending) return;
    const email = whitelistEmail.trim().toLowerCase();
    if (!email) {
      setWhitelistError('Adresse e-mail requise.');
      return;
    }
    setWhitelistSending(true);
    setWhitelistError(null);
    try {
      const response = await fetch(`/api/dossier-shares/${token}/whitelist/access/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Impossible d’envoyer le code.');
      }
      setWhitelistStep('code');
      toast.success('Code envoyé');
    } catch (err) {
      console.error('share whitelist request', err);
      const message = err instanceof Error ? err.message : 'Impossible d’envoyer le code.';
      setWhitelistError(message);
    } finally {
      setWhitelistSending(false);
    }
  };

  const handleWhitelistVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || whitelistVerifying) return;
    const email = whitelistEmail.trim().toLowerCase();
    const code = whitelistCode.trim();
    if (!email) {
      setWhitelistError('Adresse e-mail requise.');
      return;
    }
    if (!code) {
      setWhitelistError('Code requis.');
      return;
    }
    setWhitelistVerifying(true);
    setWhitelistError(null);
    try {
      const response = await fetch(`/api/dossier-shares/${token}/whitelist/access/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Impossible de vérifier le code.');
      }
      if (payload?.access_token) {
        setShareAccessToken(payload.access_token);
        setCookieValue(`share_access_${token}`, payload.access_token, SHARE_COOKIE_MAX_AGE);
      }
      setRequiresWhitelist(false);
      setWhitelistCode('');
      setWhitelistStep('email');
      await fetchShare(payload?.access_token);
    } catch (err) {
      console.error('share whitelist verify', err);
      const message = err instanceof Error ? err.message : 'Impossible de vérifier le code.';
      setWhitelistError(message);
    } finally {
      setWhitelistVerifying(false);
    }
  };

  const handleOpenEntry = (entry: ShareEntry) => {
    setSelectedEntryId(entry.id);
    setContextMenu(null);
    if (entry.entry_type === 'folder') {
      setCurrentFolderId(entry.id);
      return;
    }
    if (isPreviewableEntry(entry)) {
      setPreviewEntryId(entry.id);
      return;
    }
    handleDownloadFile(entry);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-500">
        Chargement du dossier partagé…
      </div>
    );
  }

  if (requiresPassword) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center px-6">
        <div className="max-w-md w-full rounded-lg border border-slate-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-slate-900">Accès protégé</h1>
          <p className="mt-2 text-sm text-slate-600">
            Ce dossier est protégé par un mot de passe.
          </p>
          <form className="mt-4 space-y-3" onSubmit={handlePasswordSubmit}>
            <div>
              <Input
                type="password"
                value={passwordValue}
                onChange={(event) => {
                  setPasswordValue(event.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                placeholder="Mot de passe"
                autoFocus
              />
              {passwordError && (
                <p className="mt-2 text-xs text-rose-600">{passwordError}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={passwordSubmitting}
              className={`w-full inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 ${passwordSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {passwordSubmitting ? 'Verification…' : 'Accéder au dossier'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (requiresWhitelist) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center px-6">
        <div className="max-w-md w-full rounded-lg border border-slate-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-slate-900">Accès restreint</h1>
          <p className="mt-2 text-sm text-slate-600">
            Ce dossier est réservé aux adresses autorisées.
          </p>
          <form className="mt-4 space-y-3" onSubmit={whitelistStep === 'email' ? handleWhitelistRequest : handleWhitelistVerify}>
            <div>
              <Input
                type="email"
                value={whitelistEmail}
                onChange={(event) => {
                  setWhitelistEmail(event.target.value);
                  if (whitelistError) setWhitelistError(null);
                }}
                placeholder="email@exemple.com"
                autoFocus
              />
            </div>
            {whitelistStep === 'code' && (
              <div>
                <Input
                  value={whitelistCode}
                  onChange={(event) => {
                    setWhitelistCode(event.target.value);
                    if (whitelistError) setWhitelistError(null);
                  }}
                  placeholder="Code de vérification"
                />
              </div>
            )}
            {whitelistError && (
              <p className="text-xs text-rose-600">{whitelistError}</p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="submit"
                disabled={whitelistStep === 'email' ? whitelistSending : whitelistVerifying}
                className={`w-full inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white ${whitelistStep === 'email' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'} ${(whitelistStep === 'email' ? whitelistSending : whitelistVerifying) ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {whitelistStep === 'email'
                  ? (whitelistSending ? 'Envoi…' : 'Envoyer un code')
                  : (whitelistVerifying ? 'Validation…' : 'Valider le code')}
              </button>
              {whitelistStep === 'code' && (
                <button
                  type="button"
                  onClick={() => {
                    setWhitelistStep('email');
                    setWhitelistCode('');
                  }}
                  className="w-full inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Changer d’adresse
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center px-6">
        <div className="max-w-md w-full rounded-lg border border-rose-200 bg-white p-6 text-center">
          <h1 className="text-lg font-semibold text-rose-600">Accès impossible</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-md border border-blue-100 bg-blue-50 flex items-center justify-center">
              <Folder className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{rootLabel}</h1>
              {rootSubtitle && <p className="text-sm text-slate-500">{rootSubtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={handleBack}
            disabled={backDisabled}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border shadow-sm bg-white text-slate-700 border-slate-300 hover:bg-slate-50 ${backDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </button>
        </header>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden relative">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <div className="flex items-center gap-2 text-slate-700">
                <Home className="h-4 w-4" />
                <button
                  type="button"
                  onClick={() => setCurrentFolderId(shareRootId ?? null)}
                  className="font-semibold text-slate-800 hover:underline"
                >
                  {rootLabel}
                </button>
              </div>
              {pathSegments.length > 0 && (
                pathSegments
                  .filter((segment) => segment.id !== shareRootId)
                  .map((segment, index, filtered) => {
                    const isLast = index === filtered.length - 1;
                    return (
                      <div key={segment.id} className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                        {isLast ? (
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-800">{segment.name}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCurrentFolderId(segment.id)}
                            className="rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100"
                          >
                            {segment.name}
                          </button>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </div>
          <div
            className="px-4 py-4"
            onContextMenu={(event) => openContextMenu(event, null)}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setSelectedEntryId(null);
                setContextMenu(null);
              }
            }}
          >
            {entriesInView.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Aucun élément dans ce dossier.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {entriesInView.map((entry) => {
                  const isFolder = entry.entry_type === 'folder';
                  const containerStyle = getEntryContainerStyle(entry);
                  const iconStyle = getEntryIconStyle(entry);
                  const toneClass = getEntryToneClass(entry);
                  const FolderIcon = resolveFolderIcon(entry);
                  const isSelected = selectedEntryId === entry.id;
                  const isCut = clipboard?.mode === 'cut' && clipboard.entryId === entry.id;
                  return (
                    <div
                      key={entry.id}
                      role="button"
                      tabIndex={0}
                      title={entry.name}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedEntryId(entry.id);
                        setContextMenu(null);
                      }}
                      onDoubleClick={() => handleOpenEntry(entry)}
                      onContextMenu={(event) => openContextMenu(event, entry.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          handleOpenEntry(entry);
                        }
                      }}
                      className={`group flex flex-col items-center gap-2 rounded-md border px-2 py-3 text-center transition ${isSelected ? 'border-blue-300 bg-blue-50/60' : 'border-transparent hover:bg-slate-50'} ${isCut ? 'opacity-60' : ''}`}
                    >
                      <div
                        className={`h-14 w-14 rounded-md flex items-center justify-center border ${toneClass}`}
                        style={containerStyle}
                      >
                        {isFolder ? (
                          <FolderIcon className="h-7 w-7" style={iconStyle} />
                        ) : (
                          <FileText className="h-7 w-7" style={iconStyle} />
                        )}
                      </div>
                      <div className="text-[11px] text-slate-700 leading-snug max-w-[96px] h-8 overflow-hidden break-words">
                        {entry.name}
                      </div>
                      {entry.entry_type === 'file' && (
                        <div className="text-[10px] text-slate-400">
                          {formatFileSize(entry.file_size)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>{entriesInView.length} élément{entriesInView.length > 1 ? 's' : ''}</span>
            <span>{pathSegments[pathSegments.length - 1]?.name || rootLabel}</span>
          </div>
          {contextMenu && createPortal((
            <div
              className="fixed z-[120] w-56 rounded-md border border-slate-200 bg-white shadow-lg"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <div className="py-1 text-sm">
                {contextEntry ? (
                  <>
                    {contextEntry.entry_type === 'folder' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setContextMenu(null);
                            setCurrentFolderId(contextEntry.id);
                          }}
                          className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                        >
                          Ouvrir
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setContextMenu(null);
                            handleDownloadZip(contextEntry);
                          }}
                          disabled={Boolean(zippingId)}
                          className={`w-full px-3 py-2 text-left ${zippingId ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-100'}`}
                        >
                          Télécharger en .zip
                        </button>
                      </>
                    ) : (
                      <>
                        {isPreviewableEntry(contextEntry) && (
                          <button
                            type="button"
                            onClick={() => {
                              setContextMenu(null);
                              setPreviewEntryId(contextEntry.id);
                            }}
                            className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                          >
                            Aperçu
                          </button>
                        )}
                        {contextEntry.file_url && (
                          <button
                            type="button"
                            onClick={() => {
                              setContextMenu(null);
                              handleDownloadFile(contextEntry);
                            }}
                            className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                          >
                            Télécharger
                          </button>
                        )}
                      </>
                    )}
                    {isEditor && (
                      <>
                        <div className="my-1 border-t border-slate-200" />
                        <button
                          type="button"
                          onClick={() => {
                            setContextMenu(null);
                            openNameModal('edit', contextEntry);
                          }}
                          className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setContextMenu(null);
                            handleDuplicateEntry(contextEntry);
                          }}
                          className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                        >
                          Dupliquer
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setContextMenu(null);
                            setClipboard({ entryId: contextEntry.id, mode: 'copy' });
                            toast.success('Copié');
                          }}
                          className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                        >
                          Copier
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setContextMenu(null);
                            setClipboard({ entryId: contextEntry.id, mode: 'cut' });
                            toast.success('Coupé');
                          }}
                          className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                        >
                          Couper
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setContextMenu(null);
                            handlePasteEntry();
                          }}
                          disabled={!clipboard}
                          className={`w-full px-3 py-2 text-left ${clipboard ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-400 cursor-not-allowed'}`}
                        >
                          Coller
                        </button>
                        <div className="my-1 border-t border-slate-200" />
                        <button
                          type="button"
                          onClick={() => {
                            setContextMenu(null);
                            setInfoEntryId(contextEntry.id);
                          }}
                          className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                        >
                          Voir les infos
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setContextMenu(null);
                            handleDeleteEntry(contextEntry);
                          }}
                          className="w-full px-3 py-2 text-left text-rose-700 hover:bg-rose-50"
                        >
                          Supprimer
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  isEditor && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setContextMenu(null);
                          handlePasteEntry();
                        }}
                        disabled={!clipboard}
                        className={`w-full px-3 py-2 text-left ${clipboard ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-400 cursor-not-allowed'}`}
                      >
                        Coller
                      </button>
                      <div className="my-1 border-t border-slate-200" />
                      <button
                        type="button"
                        onClick={() => {
                          setContextMenu(null);
                          openNameModal('create');
                        }}
                        className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                      >
                        Nouveau dossier
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setContextMenu(null);
                          fileInputRef.current?.click();
                        }}
                        className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                      >
                        Importer
                      </button>
                    </>
                  )
                )}
              </div>
            </div>
          ), document.body)}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleUploadFiles}
        className="hidden"
      />

      {previewEntry && previewEntry.file_url && createPortal((
        <div className="fixed inset-0 z-[90] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setPreviewEntryId(null)}
          />
          <div className="relative w-full max-w-4xl rounded-lg bg-white shadow-lg overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-3">
                <div
                  className={`h-9 w-9 rounded-md flex items-center justify-center border ${getEntryToneClass(previewEntry)}`}
                  style={getEntryContainerStyle(previewEntry)}
                >
                  <FileText className="h-4 w-4" style={getEntryIconStyle(previewEntry)} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{previewEntry.name}</h3>
                  <p className="text-xs text-slate-500">Aperçu</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewEntryId(null)}
                className="px-3 py-1.5 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Fermer
              </button>
            </div>
            <div className="bg-slate-900/5 p-4">
              {isImageEntry(previewEntry) ? (
                <div className="flex items-center justify-center max-h-[70vh] overflow-auto">
                  <img
                    src={previewEntry.file_url}
                    alt={previewEntry.name}
                    className="max-h-[68vh] max-w-full rounded-md shadow"
                  />
                </div>
              ) : (
                <iframe
                  title={`Aperçu ${previewEntry.name}`}
                  src={previewEntry.file_url}
                  className="w-full h-[70vh] rounded-md border border-slate-200 bg-white"
                />
              )}
            </div>
          </div>
        </div>
      ), document.body)}
      {infoEntry && createPortal((
        <div className="fixed inset-0 z-[90] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setInfoEntryId(null)}
          />
          <div className="relative w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
            <div className="flex items-center gap-3">
              <div
                className={`h-10 w-10 rounded-md flex items-center justify-center border ${getEntryToneClass(infoEntry)}`}
                style={getEntryContainerStyle(infoEntry)}
              >
                {infoEntry.entry_type === 'folder' ? (
                  (() => {
                    const FolderIcon = resolveFolderIcon(infoEntry);
                    return <FolderIcon className="h-5 w-5" style={getEntryIconStyle(infoEntry)} />;
                  })()
                ) : (
                  <FileText className="h-5 w-5" style={getEntryIconStyle(infoEntry)} />
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Informations</h3>
                <p className="text-xs text-slate-500">{infoEntry.entry_type === 'folder' ? 'Dossier' : 'Fichier'}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 text-sm text-slate-600">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">Nom</dt>
                <dd className="text-right text-slate-800 break-words">{infoEntry.name}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">Type</dt>
                <dd className="text-right text-slate-800">{entryTypeLabel(infoEntry)}</dd>
              </div>
              {infoEntry.entry_type === 'file' && (
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">Taille</dt>
                  <dd className="text-right text-slate-800">{formatFileSize(infoEntry.file_size)}</dd>
                </div>
              )}
              {infoEntry.entry_type === 'file' && infoEntry.file_type && (
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">Mime</dt>
                  <dd className="text-right text-slate-800">{infoEntry.file_type}</dd>
                </div>
              )}
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">Couleur</dt>
                <dd className="text-right text-slate-800">
                  {infoEntry.color ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full border border-slate-200" style={{ backgroundColor: infoEntry.color }} />
                      {infoEntry.color}
                    </span>
                  ) : (
                    'Par defaut'
                  )}
                </dd>
              </div>
              {infoEntry.entry_type === 'folder' && (
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">Icône</dt>
                  <dd className="text-right text-slate-800">{resolveFolderIconLabel(infoEntry.icon)}</dd>
                </div>
              )}
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">Ajouté le</dt>
                <dd className="text-right text-slate-800">{new Date(infoEntry.created_at).toLocaleDateString()}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">ID</dt>
                <dd className="text-right text-slate-800 break-words">{infoEntry.id}</dd>
              </div>
            </dl>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setInfoEntryId(null)}
                className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
      {nameModalOpen && createPortal((
        <div className="fixed inset-0 z-[90] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !nameModalSaving && closeNameModal()}
          />
          <div className="relative w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h3 className="text-lg font-semibold text-slate-900">
              {nameModalMode === 'create' ? 'Nouveau dossier' : 'Modifier'}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {nameModalMode === 'create'
                ? 'Saisissez le nom du dossier.'
                : "Modifiez le nom, la couleur et l'icone."}
            </p>
            <div className="mt-4">
              <Input
                ref={nameInputRef}
                value={nameModalValue}
                onChange={(event) => setNameModalValue(event.target.value)}
                placeholder={nameModalMode === 'create' ? 'Nom du dossier' : 'Nom'}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleConfirmNameModal();
                  }
                }}
              />
            </div>
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Couleur</p>
              <div className="mt-2 flex items-center gap-3">
                <ColorPickerButton
                  value={nameModalColor}
                  onChange={(value) => {
                    setNameModalColor(value);
                    setNameModalColorDirty(true);
                  }}
                  size="md"
                  ariaLabel="Choisir une couleur"
                />
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="h-3 w-3 rounded-full border border-slate-200" style={{ backgroundColor: nameModalColor }} />
                  <span>Couleur appliquée</span>
                </div>
              </div>
            </div>
            {(nameModalMode === 'create' || nameModalEntry?.entry_type === 'folder') && (
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Icone</p>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {DOSSIER_ICON_OPTIONS.map((option) => {
                    const isSelected = nameModalIcon === option.id;
                    const iconStyle = normalizeHexColor(nameModalColor)
                      ? {
                        color: nameModalColor,
                        backgroundColor: withHexAlpha(nameModalColor, '1a') ?? undefined,
                        borderColor: withHexAlpha(nameModalColor, '33') ?? nameModalColor,
                      }
                      : undefined;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setNameModalIcon(option.id)}
                        className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs ${isSelected ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        title={option.label}
                      >
                        <div className="h-8 w-8 rounded-md border flex items-center justify-center" style={iconStyle}>
                          <option.Icon className="h-4 w-4" />
                        </div>
                        <span className="truncate w-full">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeNameModal}
                disabled={nameModalSaving}
                className={`px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 ${nameModalSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmNameModal}
                disabled={nameModalSaving}
                className={`px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 ${nameModalSaving ? 'opacity-80 cursor-not-allowed hover:bg-blue-600' : ''}`}
              >
                {nameModalMode === 'create' ? 'Créer' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
};

export default DossierShare;
