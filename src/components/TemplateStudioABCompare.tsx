import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, RefreshCw } from 'lucide-react';
import {
  TEMPLATE_STUDIO_DOM_CAPTURE_REQUEST,
  TEMPLATE_STUDIO_DOM_CAPTURE_READY,
  TEMPLATE_STUDIO_PDF_PREVIEW_REQUEST,
  TEMPLATE_STUDIO_PDF_PREVIEW_READY,
} from '../constants/templateStudio';
import type { TemplateStudioDocumentType } from '../constants/templateStudio';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ABCompareOverlayProps {
  docType: TemplateStudioDocumentType;
  documentDesign: unknown;
  company: Record<string, unknown> | null;
  onClose: () => void;
}

// ─── Panel ────────────────────────────────────────────────────────────────────

const Panel: React.FC<{
  label: string;
  tag: string;
  tagColor: string;
  loading: boolean;
  error: string | null;
  children: React.ReactNode;
  onRefresh: () => void;
}> = ({ label, tag, tagColor, loading, error, children, onRefresh }) => (
  <div className="flex flex-col flex-1 min-w-0 border-r border-gray-800 last:border-r-0">
    {/* Header */}
    <div className="flex items-center gap-3 h-11 px-4 bg-gray-900 border-b border-gray-800 shrink-0">
      <span className={`px-2 py-0.5 rounded text-xs font-bold ${tagColor}`}>{tag}</span>
      <span className="text-sm text-gray-300 truncate">{label}</span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        title="Actualiser"
        className="ml-auto inline-flex items-center justify-center rounded p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-700 disabled:opacity-40 transition-colors"
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <RefreshCw className="h-3.5 w-3.5" />
        }
      </button>
    </div>

    {/* Content */}
    <div className="flex flex-1 overflow-hidden bg-gray-950 relative">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-950 z-10">
          <Loader2 className="h-7 w-7 animate-spin text-gray-500" />
          <span className="text-xs text-gray-500">Chargement…</span>
        </div>
      )}
      {error && !loading && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <span className="text-sm text-red-400 text-center">{error}</span>
        </div>
      )}
      {!loading && !error && children}
    </div>
  </div>
);

// ─── Main component ────────────────────────────────────────────────────────────

const ABCompareOverlay: React.FC<ABCompareOverlayProps> = ({
  docType,
  documentDesign,
  company,
  onClose,
}) => {
  // ── Live preview (A) state ─────────────────────────────────────────────────
  const [liveHtml, setLiveHtml] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const liveBlobRef = useRef<string | null>(null);
  const pendingLiveRef = useRef(false);

  // ── PDF (B) state ──────────────────────────────────────────────────────────
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const pendingPdfRef = useRef(false);

  // ── Capture live preview ───────────────────────────────────────────────────
  const requestLiveCapture = useCallback(() => {
    setLiveLoading(true);
    setLiveError(null);
    setLiveHtml(null);
    pendingLiveRef.current = true;
    window.dispatchEvent(new Event(TEMPLATE_STUDIO_DOM_CAPTURE_REQUEST));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      if (!pendingLiveRef.current) return;
      pendingLiveRef.current = false;
      const html = (e as CustomEvent).detail?.html as string | undefined;
      if (!html) {
        setLiveError('Impossible de capturer la prévisualisation');
        setLiveLoading(false);
        return;
      }
      // Revoke previous blob
      if (liveBlobRef.current) URL.revokeObjectURL(liveBlobRef.current);
      const blob = new Blob([html], { type: 'text/html' });
      liveBlobRef.current = URL.createObjectURL(blob);
      setLiveHtml(liveBlobRef.current);
      setLiveLoading(false);
    };
    window.addEventListener(TEMPLATE_STUDIO_DOM_CAPTURE_READY, handler);
    return () => window.removeEventListener(TEMPLATE_STUDIO_DOM_CAPTURE_READY, handler);
  }, []);

  // Cleanup blob on unmount
  useEffect(() => {
    return () => {
      if (liveBlobRef.current) URL.revokeObjectURL(liveBlobRef.current);
    };
  }, []);

  // ── Generate PDF ───────────────────────────────────────────────────────────
  const requestPdf = useCallback(() => {
    setPdfLoading(true);
    setPdfError(null);
    setPdfDataUrl(null);
    pendingPdfRef.current = true;
    window.dispatchEvent(new Event(TEMPLATE_STUDIO_PDF_PREVIEW_REQUEST));
  }, []);

  useEffect(() => {
    const handler = async (e: Event) => {
      if (!pendingPdfRef.current) return;
      pendingPdfRef.current = false;
      const snapshot = (e as CustomEvent).detail?.snapshot ?? null;
      try {
        const res = await fetch('/api/template-studio/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snapshot, docType, documentDesign, company }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error || 'Erreur serveur');
        }
        const data = await res.json() as { pdfBase64: string };
        setPdfDataUrl(`data:application/pdf;base64,${data.pdfBase64}`);
      } catch (err) {
        setPdfError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setPdfLoading(false);
      }
    };
    window.addEventListener(TEMPLATE_STUDIO_PDF_PREVIEW_READY, handler);
    return () => window.removeEventListener(TEMPLATE_STUDIO_PDF_PREVIEW_READY, handler);
  }, [docType, documentDesign, company]);

  // ── Load both on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    requestLiveCapture();
    requestPdf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-gray-950">

      {/* Top bar */}
      <div className="flex items-center h-12 px-5 bg-gray-900 border-b border-gray-800 shrink-0 gap-4">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded bg-gray-700 text-xs font-bold text-white tracking-wide">A</span>
          <span className="text-xs text-gray-500">Prévisualisation live</span>
          <span className="text-gray-700 mx-1">vs</span>
          <span className="px-2.5 py-1 rounded bg-blue-600 text-xs font-bold text-white tracking-wide">B</span>
          <span className="text-xs text-gray-500">Rendu PDF réel</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto inline-flex items-center gap-2 rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
        >
          <X className="h-4 w-4" />
          Fermer
        </button>
      </div>

      {/* Two panels */}
      <div className="flex flex-1 min-h-0">

        <Panel
          tag="A"
          tagColor="bg-gray-700 text-white"
          label="Prévisualisation live"
          loading={liveLoading}
          error={liveError}
          onRefresh={requestLiveCapture}
        >
          {liveHtml && (
            <iframe
              src={liveHtml}
              className="w-full h-full border-0"
              title="Prévisualisation live"
              sandbox="allow-same-origin"
            />
          )}
        </Panel>

        <Panel
          tag="B"
          tagColor="bg-blue-600 text-white"
          label="Rendu PDF réel"
          loading={pdfLoading}
          error={pdfError}
          onRefresh={requestPdf}
        >
          {pdfDataUrl && (
            <iframe
              src={pdfDataUrl}
              className="w-full h-full border-0"
              title="Rendu PDF"
            />
          )}
        </Panel>

      </div>
    </div>,
    document.body,
  );
};

export default ABCompareOverlay;
