import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, FolderTree, Layers } from 'lucide-react';
import { useEquipmentCategories } from '../../hooks/useEquipmentCategories';

interface EquipmentCategoriesManagerProps {
  canEdit: boolean;
}

const InlineEditor: React.FC<{
  value: string;
  onSave: (value: string) => Promise<void> | void;
  onCancel: () => void;
}> = ({ value, onSave, onCancel }) => {
  const [nextValue, setNextValue] = useState(value);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    try {
      setSaving(true);
      await onSave(nextValue);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        value={nextValue}
        onChange={(e) => setNextValue(e.target.value)}
        className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-blue-500"
        autoFocus
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center rounded-md bg-blue-600 px-2 py-1 text-sm text-white hover:bg-blue-700"
      >
        <Check className="mr-1 h-4 w-4" />
        OK
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
      >
        <X className="mr-1 h-4 w-4" />
        Annuler
      </button>
    </div>
  );
};

const EquipmentCategoriesManager: React.FC<EquipmentCategoriesManagerProps> = ({ canEdit }) => {
  const {
    categories,
    loading,
    addCategory,
    updateCategory,
    deleteCategory,
    addSubcategory,
    updateSubcategory,
    deleteSubcategory,
  } = useEquipmentCategories();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingSubcategoryId, setEditingSubcategoryId] = useState<string | null>(null);

  const selectedCategory = useMemo(
    () => categories.find((cat) => cat.id === selectedCategoryId) || categories[0] || null,
    [categories, selectedCategoryId],
  );

  const subcategories = selectedCategory?.subcategories || [];

  useEffect(() => {
    if (categories.length === 0) {
      setSelectedCategoryId(null);
      return;
    }
    if (!selectedCategoryId || !categories.some((cat) => cat.id === selectedCategoryId)) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    await addCategory(newCategoryName);
    setNewCategoryName('');
  };

  const handleAddSubcategory = async () => {
    if (!selectedCategory || !newSubcategoryName.trim()) return;
    await addSubcategory(selectedCategory.id, newSubcategoryName);
    setNewSubcategoryName('');
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <FolderTree className="h-4 w-4" /> Catégories principales
          </h3>
        </div>

        {loading ? (
          <div className="rounded-md border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
            Chargement des catégories…
          </div>
        ) : (
          <div className="space-y-2">
            {categories.length === 0 && (
              <div className="rounded-md border border-dashed border-gray-200 p-4 text-sm text-gray-500">
                Aucune catégorie pour le moment. Ajoutez votre première catégorie pour organiser votre matériel.
              </div>
            )}
            {categories.map((category) => {
              const isSelected = selectedCategory?.id === category.id;
              const isEditing = editingCategoryId === category.id;
              return (
                <div
                  key={category.id}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm transition ${
                    isSelected ? 'border-blue-500 bg-blue-50/60 text-blue-700' : 'border-gray-200 bg-white text-gray-800'
                  }`}
                >
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-2 text-left"
                    onClick={() => setSelectedCategoryId(category.id)}
                  >
                    <span className="font-medium">{category.name}</span>
                    <span className="text-xs text-gray-500">({category.subcategories.length} sous-catégories)</span>
                  </button>
                  {canEdit && (
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <InlineEditor
                          value={category.name}
                          onSave={async (next) => {
                            await updateCategory(category.id, next);
                            setEditingCategoryId(null);
                          }}
                          onCancel={() => setEditingCategoryId(null)}
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditingCategoryId(category.id)}
                            className="rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                            title="Renommer"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteCategory(category.id)}
                            className="rounded-full p-1 text-red-500 hover:bg-red-50"
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {canEdit && (
          <div className="flex items-center gap-2">
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Nouvelle catégorie"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={handleAddCategory}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Ajouter
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Layers className="h-4 w-4" /> Sous-catégories
          </h3>
          {selectedCategory && (
            <span className="text-xs text-gray-500">Catégorie active : {selectedCategory.name}</span>
          )}
        </div>

        {!selectedCategory ? (
          <div className="rounded-md border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
            Sélectionnez une catégorie pour gérer les sous-catégories associées.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {subcategories.length === 0 && (
                <div className="rounded-md border border-dashed border-gray-200 p-4 text-sm text-gray-500">
                  Aucune sous-catégorie pour cette catégorie.
                </div>
              )}
              {subcategories.map((sub) => {
                const isEditing = editingSubcategoryId === sub.id;
                return (
                  <div key={sub.id} className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
                    <span className="font-medium text-gray-800">{sub.name}</span>
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <InlineEditor
                            value={sub.name}
                            onSave={async (next) => {
                              await updateSubcategory(sub.id, next);
                              setEditingSubcategoryId(null);
                            }}
                            onCancel={() => setEditingSubcategoryId(null)}
                          />
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditingSubcategoryId(sub.id)}
                              className="rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                              title="Renommer"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSubcategory(sub.id)}
                              className="rounded-full p-1 text-red-500 hover:bg-red-50"
                              title="Supprimer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {canEdit && (
              <div className="flex items-center gap-2">
                <input
                  value={newSubcategoryName}
                  onChange={(e) => setNewSubcategoryName(e.target.value)}
                  placeholder="Nouvelle sous-catégorie"
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddSubcategory}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  disabled={!selectedCategory}
                >
                  <Plus className="h-4 w-4" />
                  Ajouter
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default EquipmentCategoriesManager;
