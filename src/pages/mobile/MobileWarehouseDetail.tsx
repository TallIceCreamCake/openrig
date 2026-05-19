import React, { useEffect, useState } from 'react';
import MobileLayout from './MobileLayout';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { MapPin } from 'lucide-react';

type Warehouse = {
  id: string;
  name: string;
  address: string | null;
};

type StockRow = {
  id: string;
  equipment_id: string;
  equipment_name: string;
  equipment_type: string;
  quantity: number;
};

const MobileWarehouseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [stocks, setStocks] = useState<StockRow[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const { data: warehouseRow } = await supabase
          .from('warehouses')
          .select('id, name, address')
          .eq('id', id)
          .maybeSingle();
        setWarehouse(warehouseRow as Warehouse);

        const { data: stockRows } = await supabase
          .from('equipment_stock')
          .select('id, equipment_id, quantity, equipment:equipment(name, type)')
          .eq('warehouse_id', id);
        const mapped = (stockRows || []).map((row: any) => ({
          id: row.id,
          equipment_id: row.equipment_id,
          equipment_name: row.equipment?.name || 'Équipement',
          equipment_type: row.equipment?.type || '-',
          quantity: row.quantity || 0,
        }));
        setStocks(mapped);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <MobileLayout>
      <div className="bg-white min-h-[80vh] -mt-10 -mx-4 px-4 pt-10">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : !warehouse ? (
          <div className="text-sm text-gray-500">Entrepôt introuvable.</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
              <div className="text-base font-semibold text-gray-900 dark:text-white">{warehouse.name}</div>
              <div className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <MapPin className="h-4 w-4 text-gray-400 dark:text-gray-300" />
                <span>{warehouse.address || 'Adresse non renseignée'}</span>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
              <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Matériel</div>
              {stocks.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Aucun matériel stocké.</div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {stocks.map((row) => (
                    <div key={row.id} className="py-2 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{row.equipment_name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{row.equipment_type}</div>
                      </div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{row.quantity}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </MobileLayout>
  );
};

export default MobileWarehouseDetail;
