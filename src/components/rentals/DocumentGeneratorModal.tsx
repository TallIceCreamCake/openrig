import React from 'react';
import { X, FileText, FileSignature, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { Rental } from '../../types/rental';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  rental: Rental;
  onGenerateDocument?: (docType: 'devis' | 'facture' | 'bon_prepa') => Promise<void> | void;
}

const DocumentGeneratorModal: React.FC<Props> = ({ isOpen, onClose, rental, onGenerateDocument }) => {
  const [generating, setGenerating] = React.useState<null | 'devis' | 'facture' | 'bon_prepa'>(null);
  const canInvoice = ['confirmed', 'preparing', 'in_progress', 'delivered', 'return_delivery', 'in_return', 'returned', 'completed', 'paid']
    .includes(rental.status as string);

  if (!isOpen) return null;

  const handleGenerate = async (docType: 'devis' | 'facture' | 'bon_prepa') => {
    if (!onGenerateDocument) return;
    setGenerating(docType);
    try {
      await onGenerateDocument(docType);
      toast.success('Document PDF généré');
      onClose();
    } catch (e) {
      console.error(e);
      const message = e instanceof Error && e.message
        ? e.message
        : 'Impossible de générer le document';
      toast.error(message);
    } finally {
      setGenerating(null);
    }
  };

  const isBusy = generating !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="flex justify-between items-center px-5 py-4 border-b">
          <h3 className="text-lg font-medium text-gray-900">Générer un document</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <button
            onClick={() => handleGenerate('devis')}
            disabled={isBusy}
            className={`w-full flex items-center justify-between border rounded p-3 ${isBusy ? 'opacity-70 cursor-not-allowed' : 'hover:shadow'}`}
          >
            <span className="flex items-center"><FileSignature className="h-5 w-5 text-blue-600 mr-2" />Enregistrer le devis</span>
            <span className="text-sm text-gray-500">{generating === 'devis' ? 'Génération…' : 'PDF'}</span>
          </button>
          <button
            onClick={() => handleGenerate('facture')}
            disabled={!canInvoice || isBusy}
            className={`w-full flex items-center justify-between border rounded p-3 ${canInvoice && !isBusy ? 'hover:shadow' : 'opacity-50 cursor-not-allowed'}`}
          >
            <span className="flex items-center"><FileText className="h-5 w-5 text-green-600 mr-2" />Enregistrer la facture</span>
            <span className="text-sm text-gray-500">
              {generating === 'facture' ? 'Génération…' : (canInvoice ? 'PDF' : 'Disponible après devis accepté')}
            </span>
          </button>
          <button
            onClick={() => handleGenerate('bon_prepa')}
            disabled={isBusy}
            className={`w-full flex items-center justify-between border rounded p-3 ${isBusy ? 'opacity-70 cursor-not-allowed' : 'hover:shadow'}`}
          >
            <span className="flex items-center"><Truck className="h-5 w-5 text-orange-600 mr-2" />Bon de préparation</span>
            <span className="text-sm text-gray-500">{generating === 'bon_prepa' ? 'Génération…' : 'PDF'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DocumentGeneratorModal;
