import React, { useMemo, useState } from 'react';
import { Plus, Search, Filter, X } from 'lucide-react';
import WarehouseTable from '../components/warehouses/WarehouseTable';
import WarehouseForm from '../components/warehouses/WarehouseForm';
import { useWarehouses } from '../hooks/useWarehouses';
import { Warehouse } from '../types/warehouse';
import { useTranslation } from '../context/TranslationContext';

const WarehousesPage = () => {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const { warehouses, loading, addWarehouse, deleteWarehousesBulk } = useWarehouses();
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Mock stock counts - will be replaced with real data
  const mockStockCounts: Record<string, number> = {
    '1': 150,
    '2': 75,
  };

  const handleSubmit = async (data: Partial<Warehouse>) => {
    await addWarehouse(data);
    setShowForm(false);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return warehouses;
    return warehouses.filter(w => (w.name || '').toLowerCase().includes(q));
  }, [warehouses, query]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-1">
          <h1 className="text-2xl font-semibold text-gray-900">{t('warehouses.list.title')}</h1>
          {!showForm && (
            <>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('warehouses.list.searchPlaceholder')}
                  className="pl-9 pr-8 py-2 w-full rounded-md border border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                    aria-label={t('warehouses.list.searchClear')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowFilters((s) => !s)}
                  aria-haspopup="dialog"
                  aria-expanded={showFilters}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 text-sm text-gray-700 bg-white hover:bg-gray-50"
                  title={t('warehouses.list.filters.tooltip')}
                >
                  <Filter className="h-4 w-4" />
                  {t('warehouses.list.filters.button')}
                </button>

                {showFilters && (
                  <div className="absolute z-20 mt-2 w-80 right-0 bg-white border border-gray-200 rounded-md shadow-lg">
                    <div className="p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-gray-900">{t('warehouses.list.filters.header')}</div>
                        <button
                          type="button"
                          className="p-1 text-gray-400 hover:text-gray-600"
                          aria-label={t('common.close')}
                          onClick={() => setShowFilters(false)}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-2">{t('warehouses.list.filters.cityLabel')}</div>
                        <input
                          disabled
                          placeholder={t('warehouses.list.filters.cityPlaceholder')}
                          className="w-full rounded-md border-gray-300 text-sm bg-gray-50"
                        />
                      </div>

                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-2">{t('warehouses.list.filters.stockLabel')}</div>
                        <div className="flex items-center gap-2">
                          <input
                            disabled
                            placeholder={t('warehouses.list.filters.stockMin')}
                            className="w-full rounded-md border-gray-300 text-sm bg-gray-50"
                          />
                          <span className="text-gray-400">—</span>
                          <input
                            disabled
                            placeholder={t('warehouses.list.filters.stockMax')}
                            className="w-full rounded-md border-gray-300 text-sm bg-gray-50"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button disabled className="px-3 py-1.5 text-sm rounded-md border border-gray-200 text-gray-500">
                          {t('warehouses.list.filters.reset')}
                        </button>
                        <button disabled className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white">
                          {t('warehouses.list.filters.apply')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-5 w-5 mr-2" />
            {showForm ? t('warehouses.list.cancelCreate') : t('warehouses.list.addButton')}
          </button>
        </div>
      </div>

      {showForm ? (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium mb-4">{t('warehouses.list.formTitle')}</h2>
          <WarehouseForm onSubmit={handleSubmit} />
        </div>
      ) : (
        <WarehouseTable warehouses={filtered} stockCounts={mockStockCounts} onBulkDelete={deleteWarehousesBulk} />
      )}
    </div>
  );
};

export default WarehousesPage;
