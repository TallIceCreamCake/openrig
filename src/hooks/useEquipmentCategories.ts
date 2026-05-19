import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

type DbCategory = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  equipment_subcategories?: DbSubcategory[] | null;
};

type DbSubcategory = {
  id: string;
  category_id: string | null;
  name: string;
  sort_order: number;
  created_at: string;
};

export type EquipmentSubcategory = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type EquipmentCategory = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  subcategories: EquipmentSubcategory[];
};

const mapCategory = (row: DbCategory): EquipmentCategory => ({
  id: row.id,
  name: row.name,
  sort_order: row.sort_order,
  created_at: row.created_at,
  subcategories: (row.equipment_subcategories || []).map((sub) => ({
    id: sub.id,
    name: sub.name,
    sort_order: sub.sort_order,
    created_at: sub.created_at,
  })),
});

export const useEquipmentCategories = () => {
  const [categories, setCategories] = useState<EquipmentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('equipment_categories')
        .select('id, name, sort_order, created_at, equipment_subcategories(id, category_id, name, sort_order, created_at)')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      setCategories((data || []).map(mapCategory));
      setError(null);
    } catch (err) {
      console.error('Error fetching equipment categories', err);
      setError('Impossible de charger les catégories');
      toast.error('Impossible de charger les catégories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const addCategory = useCallback(async (name: string) => {
    try {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Le nom ne peut pas être vide');
      const maxSort = categories.reduce((acc, cat) => Math.max(acc, cat.sort_order), 0);
      const { data, error } = await supabase
        .from('equipment_categories')
        .insert({ name: trimmed, sort_order: maxSort + 1 })
        .select('id, name, sort_order, created_at, equipment_subcategories(id, category_id, name, sort_order, created_at)')
        .single();
      if (error) throw error;
      setCategories((prev) => [...prev, mapCategory(data)]);
      toast.success('Catégorie créée');
    } catch (err) {
      console.error('Error creating category', err);
      toast.error(err instanceof Error ? err.message : 'Impossible de créer la catégorie');
      throw err;
    }
  }, [categories]);

  const updateCategory = useCallback(async (id: string, name: string) => {
    try {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Le nom ne peut pas être vide');
      const { error } = await supabase
        .from('equipment_categories')
        .update({ name: trimmed })
        .eq('id', id);
      if (error) throw error;
      setCategories((prev) => prev.map((cat) => (cat.id === id ? { ...cat, name: trimmed } : cat)));
      toast.success('Catégorie mise à jour');
    } catch (err) {
      console.error('Error updating category', err);
      toast.error(err instanceof Error ? err.message : 'Impossible de mettre à jour la catégorie');
      throw err;
    }
  }, []);

  const deleteCategory = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('equipment_categories').delete().eq('id', id);
      if (error) throw error;
      setCategories((prev) => prev.filter((cat) => cat.id !== id));
      toast.success('Catégorie supprimée');
    } catch (err) {
      console.error('Error deleting category', err);
      toast.error('Impossible de supprimer la catégorie');
      throw err;
    }
  }, []);

  const addSubcategory = useCallback(async (categoryId: string, name: string) => {
    try {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Le nom ne peut pas être vide');
      const category = categories.find((cat) => cat.id === categoryId);
      const maxSort = category ? category.subcategories.reduce((acc, sub) => Math.max(acc, sub.sort_order), 0) : 0;
      const { data, error } = await supabase
        .from('equipment_subcategories')
        .insert({ category_id: categoryId, name: trimmed, sort_order: maxSort + 1 })
        .select('id, category_id, name, sort_order, created_at')
        .single();
      if (error) throw error;
      setCategories((prev) => prev.map((cat) => {
        if (cat.id !== categoryId) return cat;
        return {
          ...cat,
          subcategories: [...cat.subcategories, {
            id: data.id,
            name: data.name,
            sort_order: data.sort_order,
            created_at: data.created_at,
          }],
        };
      }));
      toast.success('Sous-catégorie créée');
    } catch (err) {
      console.error('Error creating subcategory', err);
      toast.error(err instanceof Error ? err.message : 'Impossible de créer la sous-catégorie');
      throw err;
    }
  }, [categories]);

  const updateSubcategory = useCallback(async (id: string, name: string) => {
    try {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Le nom ne peut pas être vide');
      const { error } = await supabase
        .from('equipment_subcategories')
        .update({ name: trimmed })
        .eq('id', id);
      if (error) throw error;
      setCategories((prev) => prev.map((cat) => ({
        ...cat,
        subcategories: cat.subcategories.map((sub) => (sub.id === id ? { ...sub, name: trimmed } : sub)),
      })));
      toast.success('Sous-catégorie mise à jour');
    } catch (err) {
      console.error('Error updating subcategory', err);
      toast.error(err instanceof Error ? err.message : 'Impossible de mettre à jour la sous-catégorie');
      throw err;
    }
  }, []);

  const deleteSubcategory = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('equipment_subcategories')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setCategories((prev) => prev.map((cat) => ({
        ...cat,
        subcategories: cat.subcategories.filter((sub) => sub.id !== id),
      })));
      toast.success('Sous-catégorie supprimée');
    } catch (err) {
      console.error('Error deleting subcategory', err);
      toast.error('Impossible de supprimer la sous-catégorie');
      throw err;
    }
  }, []);

  const sortedCategories = useMemo(() => categories
    .slice()
    .sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name))
    .map((cat) => ({
      ...cat,
      subcategories: cat.subcategories
        .slice()
        .sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name)),
    })), [categories]);

  return {
    categories: sortedCategories,
    loading,
    error,
    refetch: fetchCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    addSubcategory,
    updateSubcategory,
    deleteSubcategory,
  };
};
