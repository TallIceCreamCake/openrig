import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, X, Loader2, Columns2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  TEMPLATE_STUDIO_DOC_PARAM,
  TEMPLATE_STUDIO_DOCUMENT_TYPES,
  TEMPLATE_STUDIO_SAVE_EVENT,
  TEMPLATE_STUDIO_PDF_PREVIEW_REQUEST,
  TEMPLATE_STUDIO_PDF_PREVIEW_READY,
  normalizeTemplateStudioDocumentType,
} from '../constants/templateStudio';
import { useCompanySettings } from '../hooks/useCompanySettings';
import ABCompareOverlay from './TemplateStudioABCompare';

const TemplateStudioTopBar: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTemplateType = normalizeTemplateStudioDocumentType(searchParams.get(TEMPLATE_STUDIO_DOC_PARAM));

  const { settings } = useCompanySettings();

  const [previewMode, setPreviewMode] = useState<'A' | 'B'>('A');
  const [compareOpen, setCompareOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const pendingPdfRef = useRef(false);

  const docLabel = activeTemplateType === 'devis'
    ? 'Devis'
    : activeTemplateType === 'facture'
      ? 'Facture'
      : 'Bon de préparation';

  const companyPayload = settings
    ? {
        name: settings.name,
        legal_name: settings.legal_name,
        siren: settings.siren,
        siret: settings.siret,
        vat: settings.vat,
        address: settings.address,
        email: settings.email,
        phone: settings.phone,
        logo_url: settings.logo_url,
        accent_color: settings.accent_color,
      }
    : null;

  const handleSaveClick = () => {
    window.dispatchEvent(new Event(TEMPLATE_STUDIO_SAVE_EVENT));
  };

  const handleTemplateTypeChange = (value: string) => {
    const nextType = normalizeTemplateStudioDocumentType(value);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(TEMPLATE_STUDIO_DOC_PARAM, nextType);
    setSearchParams(nextParams, { replace: true });
  };

  // ── B preview ──────────────────────────────────────────────────────────────

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
          body: JSON.stringify({
            snapshot,
            docType: activeTemplateType,
            documentDesign: settings?.document_design ?? null,
            company: companyPayload,
          }),
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
  }, [activeTemplateType, settings, companyPayload]);

  const openB = () => {
    setPreviewMode('B');
    requestPdf();
  };

  const closeB = () => {
    setPreviewMode('A');
    setPdfDataUrl(null);
    setPdfError(null);
    setPdfLoading(false);
    pendingPdfRef.current = false;
  };

  // ── B overlay (full-screen PDF) ────────────────────────────────────────────
  const bOverlay = previewMode === 'B'
    ? createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col bg-gray-950">

          {/* Top bar */}
          <div className="flex items-center h-12 px-4 bg-gray-900 border-b border-gray-800 shrink-0 gap-3">
            <span className="text-sm font-semibold text-white">{docLabel}</span>
            <span className="text-xs text-gray-500">— Aperçu PDF</span>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => { closeB(); setCompareOpen(true); }}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-700 transition-colors"
                title="Vue comparée A/B côte à côte"
              >
                <Columns2 className="h-3.5 w-3.5" />
                Comparer A / B
              </button>
              <button
                type="button"
                onClick={requestPdf}
                disabled={pdfLoading}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Regénérer
              </button>
              <button
                type="button"
                onClick={closeB}
                className="inline-flex items-center justify-center rounded-md border border-gray-700 bg-gray-800 p-1.5 text-gray-400 hover:bg-gray-700 transition-colors"
                title="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* PDF */}
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            {pdfLoading && (
              <div className="flex flex-col items-center gap-3 text-gray-500">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="text-sm">Génération du PDF…</span>
              </div>
            )}
            {pdfError && !pdfLoading && (
              <span className="text-sm text-red-400 px-6 text-center">{pdfError}</span>
            )}
            {pdfDataUrl && !pdfLoading && (
              <iframe src={pdfDataUrl} className="w-full h-full border-0" title="Aperçu PDF" />
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <header className="app-topbar shadow relative z-[45]">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 ml-0 md:ml-0">
            <div className="flex flex-1 items-center ml-12 md:ml-0 gap-3">
              <h1 className="text-sm md:text-base font-semibold text-gray-900">
                Edition du template de :
              </h1>
              <select
                value={activeTemplateType}
                onChange={(e) => handleTemplateTypeChange(e.target.value)}
                className="h-9 min-w-[210px] rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 outline-none transition focus:border-blue-500"
                aria-label="Type de template"
              >
                {TEMPLATE_STUDIO_DOCUMENT_TYPES.map((entry) => (
                  <option key={entry.key} value={entry.key}>{entry.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              {/* A / B toggle */}
              <div className="flex items-center rounded-md border border-gray-200 overflow-hidden text-sm font-semibold">
                <button
                  type="button"
                  onClick={closeB}
                  className={`px-3 py-1.5 transition-colors ${
                    previewMode === 'A'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                  title="Prévisualisation live"
                >
                  A
                </button>
                <button
                  type="button"
                  onClick={openB}
                  disabled={pdfLoading}
                  className={`px-3 py-1.5 transition-colors disabled:opacity-50 ${
                    previewMode === 'B'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                  title="Aperçu PDF réel"
                >
                  {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'B'}
                </button>
              </div>

              <button
                type="button"
                onClick={handleSaveClick}
                className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Save className="h-4 w-4" />
                Sauvegarder
              </button>
              <button
                type="button"
                onClick={() => navigate('/company')}
                className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50"
                aria-label="Fermer Template Studio"
                title="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {bOverlay}

      {compareOpen && (
        <ABCompareOverlay
          docType={activeTemplateType}
          documentDesign={settings?.document_design ?? null}
          company={companyPayload}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </>
  );
};

export default TemplateStudioTopBar;
