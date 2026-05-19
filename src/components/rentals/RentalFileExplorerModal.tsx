import React from 'react';
import { createPortal } from 'react-dom';
import {
  X, Folder, FolderOpen, File, Upload, FolderPlus,
  ChevronRight, Home, Trash2, Download, Image, FileText,
  Music, Video, Archive, Code, Table, Presentation,
  MoreVertical, Edit2, Loader2, Check,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

export type DossierEntry = {
  id: string;
  rental_id: string;
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

interface Props {
  rentalId: string;
  rentalTitle?: string;
  onClose: () => void;
  /** Picker mode: selecting an entry calls onSelect instead of navigating */
  mode?: 'explorer' | 'picker';
  /** Already-attached entry ids (highlighted in picker mode) */
  attachedIds?: string[];
  onSelect?: (entry: DossierEntry) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export const formatFileSize = (bytes: number | null): string => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
};

export const getFileIcon = (mimeType: string | null) => {
  if (!mimeType) return File;
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.startsWith('video/')) return Video;
  if (mimeType.startsWith('audio/')) return Music;
  if (mimeType.includes('pdf') || mimeType.includes('word') || mimeType.includes('text')) return FileText;
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z') || mimeType.includes('tar')) return Archive;
  if (mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('javascript') || mimeType.includes('typescript')) return Code;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return Table;
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return Presentation;
  return File;
};

const getFileThumbnail = (entry: DossierEntry): string | null => {
  if (entry.entry_type !== 'file') return null;
  if (!entry.file_type?.startsWith('image/')) return null;
  return entry.file_url;
};

const DEFAULT_FOLDER_COLORS: string[] = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
  '#10B981', '#EF4444', '#6366F1', '#14B8A6',
];

// ── Component ─────────────────────────────────────────────────────────────────

const RentalFileExplorerModal: React.FC<Props> = ({
  rentalId,
  rentalTitle,
  onClose,
  mode = 'explorer',
  attachedIds = [],
  onSelect,
}) => {
  const isPicker = mode === 'picker';

  const [entries, setEntries] = React.useState<DossierEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [currentFolderId, setCurrentFolderId] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [creatingFolder, setCreatingFolder] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState('');
  const [newFolderColor, setNewFolderColor] = React.useState(DEFAULT_FOLDER_COLORS[0]);
  const [showNewFolderInput, setShowNewFolderInput] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; entry: DossierEntry } | null>(null);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const newFolderInputRef = React.useRef<HTMLInputElement>(null);
  const renameInputRef = React.useRef<HTMLInputElement>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const fetchEntries = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('rental_dossier_entries')
        .select('id, rental_id, parent_id, entry_type, name, file_url, file_name, file_type, file_size, color, icon, created_at')
        .eq('rental_id', rentalId)
        .order('entry_type', { ascending: false }) // folders first
        .order('name', { ascending: true });
      if (error) throw error;
      setEntries((data || []) as DossierEntry[]);
    } catch {
      toast.error('Impossible de charger les fichiers');
    } finally {
      setLoading(false);
    }
  }, [rentalId]);

  React.useEffect(() => { fetchEntries(); }, [fetchEntries]);

  React.useEffect(() => {
    if (showNewFolderInput) setTimeout(() => newFolderInputRef.current?.focus(), 50);
  }, [showNewFolderInput]);

  React.useEffect(() => {
    if (renamingId) setTimeout(() => renameInputRef.current?.focus(), 50);
  }, [renamingId]);

  React.useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contextMenu]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const visibleEntries = entries.filter((e) => e.parent_id === currentFolderId);

  const breadcrumbs = React.useMemo(() => {
    const crumbs: Array<{ id: string | null; name: string }> = [
      { id: null, name: rentalTitle || 'Dossier' },
    ];
    let fid = currentFolderId;
    while (fid) {
      const folder = entries.find((e) => e.id === fid);
      if (!folder) break;
      crumbs.splice(1, 0, { id: folder.id, name: folder.name });
      fid = folder.parent_id;
    }
    return crumbs;
  }, [currentFolderId, entries, rentalTitle]);

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const payloads = await Promise.all(files.map(async (file) => ({
        rental_id: rentalId,
        parent_id: currentFolderId,
        entry_type: 'file',
        name: file.name,
        file_url: await fileToDataUrl(file),
        file_name: file.name,
        file_type: file.type || null,
        file_size: file.size || null,
        color: null,
        icon: null,
      })));
      const { error } = await supabase.from('rental_dossier_entries').insert(payloads);
      if (error) throw error;
      await fetchEntries();
      toast.success(`${files.length} fichier${files.length > 1 ? 's' : ''} importé${files.length > 1 ? 's' : ''}`);
    } catch {
      toast.error("Impossible d'importer les fichiers");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── New folder ─────────────────────────────────────────────────────────────

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    try {
      const { error } = await supabase.from('rental_dossier_entries').insert({
        rental_id: rentalId,
        parent_id: currentFolderId,
        entry_type: 'folder',
        name,
        color: newFolderColor,
        icon: 'folder',
        file_url: null,
        file_name: null,
        file_type: null,
        file_size: null,
      });
      if (error) throw error;
      await fetchEntries();
      setNewFolderName('');
      setShowNewFolderInput(false);
      toast.success('Dossier créé');
    } catch {
      toast.error('Impossible de créer le dossier');
    } finally {
      setCreatingFolder(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (entry: DossierEntry) => {
    setContextMenu(null);
    const hasChildren = entries.some((e) => e.parent_id === entry.id);
    const label = entry.entry_type === 'folder'
      ? hasChildren ? 'Supprimer ce dossier et son contenu ?' : 'Supprimer ce dossier ?'
      : 'Supprimer ce fichier ?';
    if (!window.confirm(label)) return;
    try {
      const { error } = await supabase.from('rental_dossier_entries').delete().eq('id', entry.id);
      if (error) throw error;
      if (entry.id === currentFolderId) setCurrentFolderId(entry.parent_id ?? null);
      await fetchEntries();
      toast.success(entry.entry_type === 'folder' ? 'Dossier supprimé' : 'Fichier supprimé');
    } catch {
      toast.error('Suppression impossible');
    }
  };

  // ── Rename ─────────────────────────────────────────────────────────────────

  const startRename = (entry: DossierEntry) => {
    setContextMenu(null);
    setRenamingId(entry.id);
    setRenameValue(entry.name);
  };

  const saveRename = async () => {
    const name = renameValue.trim();
    if (!name || !renamingId) return;
    try {
      const { error } = await supabase
        .from('rental_dossier_entries')
        .update({ name })
        .eq('id', renamingId);
      if (error) throw error;
      await fetchEntries();
      setRenamingId(null);
    } catch {
      toast.error('Renommage impossible');
    }
  };

  // ── Download ────────────────────────────────────────────────────────────────

  const handleDownload = (entry: DossierEntry) => {
    setContextMenu(null);
    if (!entry.file_url) return;
    const a = document.createElement('a');
    a.href = entry.file_url;
    a.download = entry.file_name || entry.name;
    a.click();
  };

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (isPicker) return; // no upload in picker mode
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    setUploading(true);
    try {
      const payloads = await Promise.all(files.map(async (file) => ({
        rental_id: rentalId,
        parent_id: currentFolderId,
        entry_type: 'file',
        name: file.name,
        file_url: await fileToDataUrl(file),
        file_name: file.name,
        file_type: file.type || null,
        file_size: file.size || null,
        color: null,
        icon: null,
      })));
      const { error } = await supabase.from('rental_dossier_entries').insert(payloads);
      if (error) throw error;
      await fetchEntries();
      toast.success(`${files.length} fichier${files.length > 1 ? 's' : ''} importé${files.length > 1 ? 's' : ''}`);
    } catch {
      toast.error("Impossible d'importer les fichiers");
    } finally {
      setUploading(false);
    }
  };

  // ── Click on entry ─────────────────────────────────────────────────────────

  const handleEntryClick = (entry: DossierEntry) => {
    if (isPicker) {
      // In picker mode, click on folder navigates; click on file selects
      if (entry.entry_type === 'folder') {
        setCurrentFolderId(entry.id);
      } else {
        onSelect?.(entry);
      }
    } else {
      if (entry.entry_type === 'folder') setCurrentFolderId(entry.id);
    }
  };

  const handleFolderAttach = (entry: DossierEntry) => {
    // In picker mode, attach a folder directly
    onSelect?.(entry);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const zBase = 2147483646;

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: zBase }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 'min(860px, calc(100vw - 32px))', height: 'min(640px, calc(100vh - 64px))' }}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Picker badge */}
            {isPicker && (
              <span className="flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                Sélectionner
              </span>
            )}
            {/* Breadcrumbs */}
            <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
              {breadcrumbs.map((crumb, i) => (
                <React.Fragment key={crumb.id ?? '__root__'}>
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />}
                  <button
                    type="button"
                    onClick={() => setCurrentFolderId(crumb.id)}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-sm font-medium transition-colors whitespace-nowrap ${
                      i === breadcrumbs.length - 1
                        ? 'text-gray-900 dark:text-gray-100 cursor-default'
                        : 'text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30'
                    }`}
                  >
                    {i === 0 && <Home className="h-3.5 w-3.5 flex-shrink-0" />}
                    <span>{crumb.name}</span>
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            {!isPicker && (
              <>
                <button
                  type="button"
                  onClick={() => setShowNewFolderInput((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  <FolderPlus className="h-4 w-4" />
                  <span className="hidden sm:inline">Nouveau dossier</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span className="hidden sm:inline">{uploading ? 'Import…' : 'Importer'}</span>
                </button>
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* New folder inline input (explorer mode only) */}
        {showNewFolderInput && !isPicker && (
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-gray-700 bg-blue-50/50 dark:bg-blue-950/20 flex-shrink-0">
            <div className="flex items-center gap-1">
              {DEFAULT_FOLDER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewFolderColor(c)}
                  className={`w-5 h-5 rounded-full border-2 transition-transform ${
                    newFolderColor === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <input
              ref={newFolderInputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Nom du dossier"
              className="flex-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') { setShowNewFolderInput(false); setNewFolderName(''); }
              }}
            />
            <button
              type="button"
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || creatingFolder}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {creatingFolder ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Créer'}
            </button>
            <button
              type="button"
              onClick={() => { setShowNewFolderInput(false); setNewFolderName(''); }}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Annuler
            </button>
          </div>
        )}

        {/* Picker hint bar */}
        {isPicker && (
          <div className="px-5 py-2 border-b border-gray-100 dark:border-gray-700 bg-blue-50 dark:bg-blue-950/20 flex-shrink-0">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Cliquez sur un fichier pour l'attacher à la tâche. Cliquez sur un dossier pour naviguer ou utilisez le bouton&nbsp;
              <span className="font-semibold">Attacher</span>.
            </p>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : visibleEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center select-none">
              <div className="p-5 bg-gray-100 dark:bg-gray-800 rounded-2xl">
                <FolderOpen className="h-10 w-10 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Ce dossier est vide</p>
              {!isPicker && (
                <p className="text-xs text-gray-400 dark:text-gray-500">Glissez-déposez des fichiers ici ou utilisez le bouton Importer</p>
              )}
            </div>
          ) : (
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {visibleEntries.map((entry) => {
                const isFolder = entry.entry_type === 'folder';
                const thumbnail = getFileThumbnail(entry);
                const FileIcon = getFileIcon(entry.file_type);
                const folderColor = entry.color || '#3B82F6';
                const isAttached = attachedIds.includes(entry.id);

                return (
                  <div
                    key={entry.id}
                    className={`relative group flex flex-col items-center gap-2 p-3 rounded-xl border transition-all select-none cursor-pointer ${
                      isAttached
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-500'
                        : 'border-transparent hover:border-gray-200 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                    onClick={() => renamingId !== entry.id && handleEntryClick(entry)}
                  >
                    {/* Already-attached checkmark */}
                    {isAttached && (
                      <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}

                    {/* Thumbnail / Icon */}
                    <div className="relative w-full aspect-square max-w-[80px] flex items-center justify-center">
                      {thumbnail ? (
                        <img src={thumbnail} alt={entry.name} className="w-full h-full object-cover rounded-lg" />
                      ) : isFolder ? (
                        <div
                          className="w-full h-full rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: folderColor + '22' }}
                        >
                          <Folder className="h-10 w-10" style={{ color: folderColor }} />
                        </div>
                      ) : (
                        <div className="w-full h-full bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                          <FileIcon className="h-9 w-9 text-gray-400 dark:text-gray-500" />
                        </div>
                      )}
                    </div>

                    {/* Name / Rename input */}
                    {renamingId === entry.id ? (
                      <input
                        ref={renameInputRef}
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="w-full text-xs text-center border border-blue-400 rounded px-1 py-0.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename();
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        onBlur={saveRename}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="text-xs text-center text-gray-700 dark:text-gray-300 line-clamp-2 w-full" title={entry.name}>
                        {entry.name}
                      </span>
                    )}

                    {entry.file_size && (
                      <span className="text-[10px] text-gray-400">{formatFileSize(entry.file_size)}</span>
                    )}

                    {/* Picker mode: "Attacher" button on folder hover */}
                    {isPicker && isFolder && !isAttached && renamingId !== entry.id && (
                      <button
                        type="button"
                        className="absolute bottom-1.5 right-1.5 px-2 py-0.5 text-[10px] font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); handleFolderAttach(entry); }}
                      >
                        Attacher
                      </button>
                    )}

                    {/* Explorer mode: context menu */}
                    {!isPicker && renamingId !== entry.id && (
                      <button
                        type="button"
                        className="absolute top-1.5 right-1.5 p-1 rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setContextMenu({ x: e.clientX, y: e.clientY, entry });
                        }}
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
          <span className="text-xs text-gray-400">
            {visibleEntries.length} élément{visibleEntries.length !== 1 ? 's' : ''}
            {uploading && <span className="ml-2 text-blue-500">— importation en cours…</span>}
          </span>
          {!isPicker && <span className="text-xs text-gray-300 dark:text-gray-600">Glisser-déposer supporté</span>}
          {isPicker && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Fermer
            </button>
          )}
        </div>
      </div>

      {/* Context menu (explorer mode) */}
      {contextMenu && (
        <div
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1 overflow-hidden"
          style={{ top: contextMenu.y, left: contextMenu.x, zIndex: zBase + 1, minWidth: 160 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {contextMenu.entry.entry_type === 'folder' && (
            <button
              type="button"
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              onClick={() => { setCurrentFolderId(contextMenu.entry.id); setContextMenu(null); }}
            >
              <FolderOpen className="h-4 w-4 text-gray-400" />
              Ouvrir
            </button>
          )}
          {contextMenu.entry.entry_type === 'file' && contextMenu.entry.file_url && (
            <button
              type="button"
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              onClick={() => handleDownload(contextMenu.entry)}
            >
              <Download className="h-4 w-4 text-gray-400" />
              Télécharger
            </button>
          )}
          <button
            type="button"
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            onClick={() => startRename(contextMenu.entry)}
          >
            <Edit2 className="h-4 w-4 text-gray-400" />
            Renommer
          </button>
          <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
          <button
            type="button"
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
            onClick={() => handleDelete(contextMenu.entry)}
          >
            <Trash2 className="h-4 w-4" />
            Supprimer
          </button>
        </div>
      )}
    </div>
  );

  return createPortal(modal, document.body);
};

export default RentalFileExplorerModal;
