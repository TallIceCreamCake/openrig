import React from 'react';

interface RentalGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

const RentalGroupModal: React.FC<RentalGroupModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [name, setName] = React.useState('');

  React.useEffect(() => {
    if (isOpen) setName('');
  }, [isOpen]);

  if (!isOpen) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6 space-y-4"
      >
        <div>
          <h3 className="text-lg font-medium text-gray-900">Nouveau groupe</h3>
          <p className="mt-1 text-sm text-gray-500">Définissez un libellé pour regrouper des matériels.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Nom du groupe</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Kit caméra"
            className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={!name.trim()}
          >
            Ajouter
          </button>
        </div>
      </form>
    </div>
  );
};

export default RentalGroupModal;
