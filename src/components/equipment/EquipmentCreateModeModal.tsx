import React from 'react';
import { Wand2, FileText, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onChoose: (mode: 'wizard' | 'form') => void;
}

const EquipmentCreateModeModal: React.FC<Props> = ({ isOpen, onClose, onChoose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[12040] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
        <div className="flex justify-between items-center px-5 py-4 border-b">
          <h3 className="text-lg font-medium text-gray-900">Créer un matériel</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">Choisissez un mode de création. L'assistant vous guide étape par étape avec un tuto et une barre de progression. Le formulaire manuel regroupe tous les champs par onglets thématiques.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => onChoose('wizard')}
              className="text-left border rounded-lg p-5 hover:shadow transition focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <div className="flex items-center mb-2">
                <Wand2 className="h-5 w-5 text-blue-600 mr-2" />
                <span className="font-medium">Assistant (recommandé)</span>
              </div>
              <p className="text-sm text-gray-600">Guidage pas-à-pas, conseils et validations entre chaque étape.</p>
            </button>
            <button
              onClick={() => onChoose('form')}
              className="text-left border rounded-lg p-5 hover:shadow transition focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <div className="flex items-center mb-2">
                <FileText className="h-5 w-5 text-gray-700 mr-2" />
                <span className="font-medium">Formulaire manuel</span>
              </div>
              <p className="text-sm text-gray-600">Champs regroupés par onglets (Général, Tarifs, Séries, Stock, Média).</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EquipmentCreateModeModal;

