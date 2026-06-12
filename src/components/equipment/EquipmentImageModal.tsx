import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import EquipmentImageField from './EquipmentImageField';

interface EquipmentImageModalProps {
  isOpen: boolean;
  initialUrl?: string | null;
  onClose: () => void;
  onSubmit: (url: string) => void;
}

const EquipmentImageModal: React.FC<EquipmentImageModalProps> = ({ isOpen, initialUrl, onClose, onSubmit }) => {
  const [url, setUrl] = useState(initialUrl?.trim() || '');

  useEffect(() => {
    if (isOpen) {
      setUrl(initialUrl?.trim() || '');
    }
  }, [isOpen, initialUrl]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    onSubmit(url.trim());
  };

  const previewSrc = url.trim().length > 0 ? url.trim() : initialUrl?.trim() || '';

  return (
    <div className="fixed inset-0 z-[12040] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm px-4">
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-gray-500 hover:bg-gray-100"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>

        <h3 className="text-lg font-semibold text-gray-900">Modifier l'image</h3>
        <p className="mt-1 text-sm text-gray-600">Collez une URL publique ou importez une image depuis votre ordinateur.</p>

        <div className="mt-4">
          <EquipmentImageField
            value={url}
            onChange={setUrl}
            previewHeightClassName="h-48"
            previewLabel="Apercu"
            emptyLabel={previewSrc ? 'Apercu indisponible' : 'Aucune image'}
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
};

export default EquipmentImageModal;
