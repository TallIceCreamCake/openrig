import React, { useEffect, useRef, useState } from 'react';
import { Bug, ImagePlus, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { submitBugReport } from '../../utils/bugReports';

type DraftAttachment = {
  id: string;
  file: File;
  previewUrl: string;
};

const MAX_ATTACHMENTS = 8;

const generateDraftId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const BugReportLauncher: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const attachmentsRef = useRef<DraftAttachment[]>([]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => () => {
    attachmentsRef.current.forEach((attachment) => {
      URL.revokeObjectURL(attachment.previewUrl);
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const resetForm = () => {
    attachmentsRef.current.forEach((attachment) => {
      URL.revokeObjectURL(attachment.previewUrl);
    });
    attachmentsRef.current = [];
    setTitle('');
    setDescription('');
    setAttachments([]);
    setIsSubmitting(false);
  };

  const closeModal = () => {
    if (isSubmitting) return;
    resetForm();
    setIsOpen(false);
  };

  const handleAttachmentSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    if (nextFiles.length === 0) {
      event.target.value = '';
      return;
    }

    setAttachments((prev) => {
      const remainingSlots = Math.max(0, MAX_ATTACHMENTS - prev.length);
      const acceptedFiles = nextFiles.slice(0, remainingSlots);
      if (acceptedFiles.length < nextFiles.length) {
        toast.error(`Maximum ${MAX_ATTACHMENTS} images par report.`);
      }
      return [
        ...prev,
        ...acceptedFiles.map((file) => ({
          id: generateDraftId(),
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ];
    });
    event.target.value = '';
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((prev) => {
      const target = prev.find((attachment) => attachment.id === attachmentId);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((attachment) => attachment.id !== attachmentId);
    });
  };

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error('Ajoute un titre pour le report.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitBugReport({
        title: trimmedTitle,
        description,
        files: attachments.map((attachment) => attachment.file),
        pagePath: `${location.pathname}${location.search}${location.hash}`,
        pageUrl: typeof window !== 'undefined' ? window.location.href : location.pathname,
        pageTitle: typeof document !== 'undefined' ? document.title : '',
        reporter: user
          ? {
              id: user.id,
              full_name: user.full_name,
              email: user.email,
            }
          : null,
      });

      toast.success('Report enregistré.');
      if (result.failedUploads > 0) {
        toast.error(`${result.failedUploads} capture(s) n'ont pas pu être importées.`);
      }
      resetForm();
      setIsOpen(false);
    } catch (error) {
      console.error('submit bug report', error);
      toast.error("Impossible d'enregistrer le report.");
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center justify-center rounded-full border border-gray-200 bg-white/95 p-2.5 text-gray-600 shadow-lg shadow-gray-200/70 backdrop-blur transition hover:bg-white hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900/90 dark:text-gray-300 dark:shadow-black/30 dark:hover:bg-gray-900 dark:hover:text-white"
        title="Reporter un bug"
      >
        <Bug className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[12040] flex items-center justify-center bg-gray-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Reporter un bug</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Ce report sera partagé avec toute l’équipe pour la phase bêta.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 px-5 py-5">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                <div>
                  <span className="font-semibold text-gray-700 dark:text-gray-100">Page :</span>{' '}
                  {location.pathname}
                  {location.search}
                  {location.hash}
                </div>
                {user?.full_name && (
                  <div className="mt-1">
                    <span className="font-semibold text-gray-700 dark:text-gray-100">Auteur :</span> {user.full_name}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Titre</label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ex: le bouton Enregistrer ne répond pas"
                  className="mt-2 block w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Description</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Décris ce qui se passe, ce que tu faisais, et le résultat attendu."
                  rows={5}
                  className="mt-2 block w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Captures</label>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {attachments.length}/{MAX_ATTACHMENTS}
                  </span>
                </div>
                <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-4 text-sm text-gray-600 transition hover:border-blue-400 hover:bg-blue-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-950">
                  <ImagePlus className="h-4 w-4" />
                  Ajouter une ou plusieurs images
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleAttachmentSelection}
                    className="hidden"
                  />
                </label>

                {attachments.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {attachments.map((attachment) => (
                      <div key={attachment.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
                        <div className="aspect-[4/3] bg-gray-100 dark:bg-gray-900">
                          <img
                            src={attachment.previewUrl}
                            alt={attachment.file.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-200">
                              {attachment.file.name}
                            </p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                              {(attachment.file.size / 1024 / 1024).toFixed(2)} Mo
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(attachment.id)}
                            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-800"
                            aria-label="Retirer l'image"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
              <button
                type="button"
                onClick={closeModal}
                disabled={isSubmitting}
                className="inline-flex items-center rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Envoyer le report
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BugReportLauncher;
