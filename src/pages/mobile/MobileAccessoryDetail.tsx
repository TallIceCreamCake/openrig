import React, { useEffect, useMemo, useState } from 'react';
import MobileLayout from './MobileLayout';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

type Accessory = {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  image_urls: string[];
};

const MobileAccessoryDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [accessory, setAccessory] = useState<Accessory | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const { data } = await supabase
          .from('equipment_accessories')
          .select('id, name, description, quantity, image_urls')
          .eq('id', id)
          .maybeSingle();
        setAccessory(data as Accessory);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const mainImage = useMemo(() => {
    if (!accessory?.image_urls) return '';
    return (accessory.image_urls || []).find(Boolean) || '';
  }, [accessory?.image_urls]);

  return (
    <MobileLayout>
      <div className="bg-white min-h-[80vh] -mt-10 -mx-4 px-4 pt-10">
        <h1 className="text-xl font-semibold text-gray-900 mb-4">Accessoire</h1>
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : !accessory ? (
          <div className="text-sm text-gray-500">Accessoire introuvable.</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              {mainImage ? (
                <img src={mainImage} alt={accessory.name} className="w-full h-52 rounded-lg object-cover border" />
              ) : (
                <div className="w-full h-52 rounded-lg bg-gray-100 border flex items-center justify-center text-sm text-gray-500">
                  Aucune image
                </div>
              )}
              <div className="mt-3">
                <div className="text-base font-semibold text-gray-900">{accessory.name}</div>
                {accessory.description && (
                  <div className="text-sm text-gray-600 mt-1">{accessory.description}</div>
                )}
                <div className="mt-3 text-sm text-gray-700">
                  Quantité : <span className="font-semibold text-gray-900">{accessory.quantity}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </MobileLayout>
  );
};

export default MobileAccessoryDetail;
