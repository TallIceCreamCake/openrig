import React, { useEffect, useState } from 'react';
import { FileText, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { MaintenanceTask } from '../../hooks/useMaintenance';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import { extractDocumentDesign, DocumentTableDesign } from '../../utils/documentDesign';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  maintenance: MaintenanceTask;
  onSaveDocument?: (title: string, pdfBase64: string) => Promise<void> | void;
};

const labelStyles = 'block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide';
const inputStyles = 'w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error || new Error('file_read_failed'));
  reader.readAsDataURL(blob);
});

const MaintenanceDocumentModal: React.FC<Props> = ({ isOpen, onClose, maintenance, onSaveDocument }) => {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [operations, setOperations] = useState('');
  const [parts, setParts] = useState('');
  const [notes, setNotes] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const { settings } = useCompanySettings();
  const documentDesign = React.useMemo<DocumentTableDesign>(() => extractDocumentDesign(settings), [settings]);

  useEffect(() => {
    if (isOpen) {
      setTitle(`Rapport maintenance — ${maintenance.title}`);
      setSummary(maintenance.description || '');
      setNotes(maintenance.notes || '');
      setOperations('');
      setParts('');
    }
  }, [isOpen, maintenance]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    try {
      setIsGenerating(true);
      const { Document, Page, Text, View, StyleSheet, pdf } = await import('@react-pdf/renderer');
      const pdfFontFamily = ['Helvetica', 'Times-Roman', 'Courier'].includes(documentDesign.fontFamily)
        ? documentDesign.fontFamily
        : 'Helvetica';
      const borderToken = documentDesign.borderWidth > 0
        ? `${documentDesign.borderWidth} solid ${documentDesign.borderColor}`
        : '0 solid transparent';
      const safeCornerRadius = Number.isFinite(Number(documentDesign.cornerRadius))
        ? Math.max(0, Number(documentDesign.cornerRadius))
        : 0;
      const radiusStyle = safeCornerRadius > 0 ? { borderRadius: safeCornerRadius } : {};

      const styles = StyleSheet.create({
        page: { padding: 28, fontSize: documentDesign.fontSize, fontFamily: pdfFontFamily, color: '#111827' },
        header: { marginBottom: 16 },
        title: { fontSize: documentDesign.fontSize + 6, marginBottom: 4, fontWeight: 600, color: documentDesign.headerBackground },
        meta: { color: '#4B5563', marginBottom: 2 },
        section: { marginBottom: 14, padding: documentDesign.cellPadding, border: borderToken, backgroundColor: '#ffffff', ...radiusStyle },
        sectionTitle: { fontSize: documentDesign.fontSize + 1, marginBottom: 6, fontWeight: 600, color: documentDesign.headerBackground },
        paragraph: { marginBottom: 4, lineHeight: 1.4 },
        badgeRow: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
        badge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, fontSize: documentDesign.fontSize - 2, backgroundColor: documentDesign.rowStripeColor, color: documentDesign.headerBackground, marginRight: 6 },
        footer: { marginTop: 20, paddingTop: 10, borderTop: '1 solid #E5E7EB', color: '#6B7280', fontSize: documentDesign.fontSize - 2 },
      });

      const doc = (
        <Document>
          <Page size="A4" style={styles.page}>
            <View style={styles.header}>
              <Text style={styles.title}>{title || maintenance.title}</Text>
              <Text style={styles.meta}>Équipement: {maintenance.equipment_name || maintenance.equipment_id || 'N/A'}</Text>
              <Text style={styles.meta}>Planifiée: {new Date(maintenance.scheduled_date).toLocaleDateString()}</Text>
              {maintenance.completed_date ? (
                <Text style={styles.meta}>Terminée: {new Date(maintenance.completed_date).toLocaleDateString()}</Text>
              ) : null}
              <View style={styles.badgeRow}>
                <Text style={styles.badge}>Type: {maintenance.type}</Text>
                <Text style={styles.badge}>Priorité: {maintenance.priority}</Text>
                <Text style={styles.badge}>Statut: {maintenance.status}</Text>
                {typeof maintenance.cost === 'number' ? (
                  <Text style={styles.badge}>Coût: {maintenance.cost.toFixed(2)} €</Text>
                ) : null}
              </View>
            </View>

            {summary ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Résumé de l'intervention</Text>
                <Text style={styles.paragraph}>{summary}</Text>
              </View>
            ) : null}

            {operations ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Opérations effectuées</Text>
                {operations.split('\n').map((line, idx) => (
                  <Text key={idx} style={styles.paragraph}>• {line}</Text>
                ))}
              </View>
            ) : null}

            {parts ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Pièces utilisées</Text>
                {parts.split('\n').map((line, idx) => (
                  <Text key={idx} style={styles.paragraph}>• {line}</Text>
                ))}
              </View>
            ) : null}

            {notes ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Notes et recommandations</Text>
                <Text style={styles.paragraph}>{notes}</Text>
              </View>
            ) : null}

            <View style={styles.footer}>
              <Text>Rapport généré le {new Date().toLocaleDateString()}</Text>
            </View>
          </Page>
        </Document>
      );

      const blob = await pdf(doc).toBlob();
      const pdfBase64 = await blobToDataUrl(blob);
      await onSaveDocument?.(title || maintenance.title, pdfBase64);
      toast.success('Rapport généré');
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Impossible de générer le rapport');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <span className="text-lg font-medium text-gray-900">Rapport de maintenance</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className={labelStyles}>Titre</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputStyles} placeholder="Rapport maintenance — Caméra" />
          </div>
          <div>
            <label className={labelStyles}>Résumé</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} className={`${inputStyles} min-h-[90px]`} placeholder="Résumé global de l'intervention" />
          </div>
          <div>
            <label className={labelStyles}>Opérations effectuées</label>
            <textarea value={operations} onChange={(e) => setOperations(e.target.value)} className={`${inputStyles} min-h-[90px]`} placeholder="Listez chaque opération sur une nouvelle ligne" />
          </div>
          <div>
            <label className={labelStyles}>Pièces / consommables</label>
            <textarea value={parts} onChange={(e) => setParts(e.target.value)} className={`${inputStyles} min-h-[90px]`} placeholder="Liste des pièces utilisées" />
          </div>
          <div>
            <label className={labelStyles}>Notes / Recommandations</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputStyles} min-h-[80px]`} placeholder="Observations, recommandations, suivi" />
          </div>
        </div>
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Annuler</button>
          <button onClick={handleGenerate} disabled={isGenerating} className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
            {isGenerating ? 'Génération…' : 'Générer le PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MaintenanceDocumentModal;
