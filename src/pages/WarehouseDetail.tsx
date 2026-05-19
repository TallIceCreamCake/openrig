import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, MapPin } from 'lucide-react';
import { Warehouse, WarehouseStock } from '../types/warehouse';
import WarehouseForm from '../components/warehouses/WarehouseForm';
import WarehouseStockTable from '../components/warehouses/WarehouseStockTable';
import { useWarehouses } from '../hooks/useWarehouses';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../context/TranslationContext';


const mockStocks: WarehouseStock[] = [
  {
    id: '1',
    equipment_id: '1',
    equipment_name: 'Sony A7III',
    equipment_type: 'Camera',
    quantity: 3,
    status: 'available',
  },
  {
    id: '2',
    equipment_id: '2',
    equipment_name: 'Aputure 300D',
    equipment_type: 'Lighting',
    quantity: 2,
    status: 'in_use',
  },
];

const WarehouseDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { warehouses, updateWarehouse, loading } = useWarehouses();
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [stocks, setStocks] = useState<WarehouseStock[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (!loading) {
      const foundWarehouse = warehouses.find(w => w.id === id);
      if (!foundWarehouse) {
        navigate('/warehouses');
        return;
      }
      setWarehouse(foundWarehouse);
      // Load stocks from DB for this warehouse
      (async () => {
        try {
          const { data, error } = await supabase
            .from('equipment_stock')
            .select('id, equipment_id, quantity, equipment:equipment(name, type)')
            .eq('warehouse_id', id!);
          if (error) throw error;
          const rows = (data || []).map((r: any) => ({
            id: r.id,
            equipment_id: r.equipment_id,
            equipment_name: r.equipment?.name || t('warehouses.detail.stockFallbackName'),
            equipment_type: r.equipment?.type || '-',
            quantity: r.quantity || 0,
            status: (r.quantity || 0) > 0 ? 'available' : 'in_use',
          })) as WarehouseStock[];
          setStocks(rows);
        } catch (e) {
          console.error('load warehouse stocks', e);
          setStocks([]);
        }
      })();
    }
  }, [id, navigate, warehouses, loading, t]);

  const handleEditSubmit = async (data: Partial<Warehouse>) => {
    if (warehouse) {
      try {
        await updateWarehouse(warehouse.id, data);
        setWarehouse({ ...warehouse, ...data });
        setIsEditing(false);
      } catch (error) {
        console.error('Error updating warehouse:', error);
      }
    }
  };

  const handleQuantityChange = async (stockId: string, newQuantity: number) => {
    try {
      const { error } = await supabase
        .from('equipment_stock')
        .update({ quantity: newQuantity })
        .eq('id', stockId);
      if (error) throw error;
      setStocks(prev => prev.map(stock => stock.id === stockId ? { ...stock, quantity: newQuantity, status: newQuantity > 0 ? 'available' : 'in_use' } : stock));
    } catch (e) {
      console.error('update stock quantity failed', e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!warehouse) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900">{t('warehouses.detail.notFoundTitle')}</h3>
        <p className="mt-2 text-sm text-gray-500">{t('warehouses.detail.notFoundDescription')}</p>
        <button
          onClick={() => navigate('/warehouses')}
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          {t('warehouses.detail.backToList')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <Link
            to="/warehouses"
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{warehouse.name}</h1>
            <p className="text-sm text-gray-600 flex items-center mt-1">
              <MapPin className="h-4 w-4 mr-1" />
              {warehouse.address || t('warehouses.detail.addressEmpty')}
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsEditing((prev) => !prev)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Edit className="h-4 w-4 mr-2" />
          {isEditing ? t('warehouses.detail.cancelEdit') : t('warehouses.detail.editButton')}
        </button>
      </div>

      {/* Content */}
      <div className="bg-white shadow rounded-lg">
        {isEditing ? (
          <div className="p-6">
            <WarehouseForm initialData={warehouse} onSubmit={handleEditSubmit} />
          </div>
        ) : (
          <WarehouseStockTable 
            stocks={stocks}
            onQuantityChange={handleQuantityChange}
          />
        )}
      </div>
    </div>
  );
};

export default WarehouseDetail;
