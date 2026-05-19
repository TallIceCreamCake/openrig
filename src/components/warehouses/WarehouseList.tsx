import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Package } from 'lucide-react';
import { Warehouse } from '../../types/warehouse';
import { useTranslation } from '../../context/TranslationContext';

interface WarehouseListProps {
  warehouses: Warehouse[];
  stockCounts: Record<string, number>;
}

const WarehouseList: React.FC<WarehouseListProps> = ({ warehouses, stockCounts }) => {
  const { t } = useTranslation();

  const formatItems = (count: number) =>
    count === 1
      ? t('warehouses.common.itemCount.one', { count })
      : t('warehouses.common.itemCount.other', { count });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {warehouses.map((warehouse) => (
        <Link
          key={warehouse.id}
          to={`/warehouses/${warehouse.id}`}
          className="bg-white rounded-lg shadow overflow-hidden hover:shadow-md transition-shadow"
        >
          <div className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{warehouse.name}</h3>
                <p className="text-sm text-gray-600 flex items-center mt-2">
                  <MapPin className="h-4 w-4 mr-1" />
                  {warehouse.address || t('warehouses.card.noAddress')}
                </p>
              </div>
              <div className="flex items-center bg-blue-50 px-3 py-1 rounded-full">
                <Package className="h-4 w-4 text-blue-500 mr-1" />
                <span className="text-sm font-medium text-blue-600">
                  {formatItems(stockCounts[warehouse.id] || 0)}
                </span>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
};

export default WarehouseList;
