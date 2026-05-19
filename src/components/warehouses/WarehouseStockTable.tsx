import React, { useMemo, useState } from 'react';
import { Package } from 'lucide-react';
import { WarehouseStock } from '../../types/warehouse';
import EmptyTableRow from '../common/EmptyTableRow';
import { useTranslation } from '../../context/TranslationContext';
import { cn } from '../../utils/cn';

interface WarehouseStockTableProps {
  stocks: WarehouseStock[];
  onQuantityChange?: (stockId: string, newQuantity: number) => void;
}

const WarehouseStockTable: React.FC<WarehouseStockTableProps> = ({
  stocks,
  onQuantityChange,
}) => {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);

  const statusMeta = useMemo(
    () => ({
      available: {
        label: t('warehouses.stock.status.available'),
        className: 'bg-green-100 text-green-800',
      },
      in_use: {
        label: t('warehouses.stock.status.in_use'),
        className: 'bg-blue-100 text-blue-800',
      },
      maintenance: {
        label: t('warehouses.stock.status.maintenance'),
        className: 'bg-amber-100 text-amber-800',
      },
      broken: {
        label: t('warehouses.stock.status.broken'),
        className: 'bg-red-100 text-red-800',
      },
    }),
    [t]
  );

  const handleEdit = (stock: WarehouseStock) => {
    setEditingId(stock.id);
    setEditValue(stock.quantity);
  };

  const handleSave = (stockId: string) => {
    if (onQuantityChange) {
      onQuantityChange(stockId, editValue);
    }
    setEditingId(null);
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          <Package className="h-5 w-5 mr-2" />
          {t('warehouses.stock.title')}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('warehouses.stock.columns.equipment')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('warehouses.stock.columns.type')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('warehouses.stock.columns.quantity')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('warehouses.stock.columns.status')}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {stocks.length === 0 && <EmptyTableRow colSpan={4} message={t('warehouses.stock.empty')} />}
            {stocks.map((stock) => {
              const meta = statusMeta[stock.status as keyof typeof statusMeta];
              return (
                <tr key={stock.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{stock.equipment_name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{stock.equipment_type}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingId === stock.id ? (
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min="0"
                          value={editValue}
                          onChange={(e) => {
                            const next = Number.parseInt(e.target.value, 10);
                            setEditValue(Number.isNaN(next) ? 0 : next);
                          }}
                          className="w-20 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => handleSave(stock.id)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          {t('common.save')}
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => onQuantityChange && handleEdit(stock)}
                        className={cn(
                          'text-sm',
                          onQuantityChange ? 'cursor-pointer hover:text-blue-600' : ''
                        )}
                      >
                        {stock.quantity}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={cn(
                        'px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full',
                        meta?.className ?? 'bg-slate-100 text-slate-700'
                      )}
                    >
                      {meta?.label ?? stock.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WarehouseStockTable;
