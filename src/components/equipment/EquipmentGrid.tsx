import React from 'react';
import { Link } from 'react-router-dom';
import { Equipment } from '../../types/equipment';
import { StatusBadge, type BadgeTone } from '../ui-kit';

const getEquipmentStatusMeta = (status: string): { label: string; tone: BadgeTone } => {
  switch (status) {
    case 'available':
      return { label: 'Disponible', tone: 'emerald' };
    case 'in_use':
      return { label: 'En cours', tone: 'blue' };
    case 'maintenance':
      return { label: 'Maintenance', tone: 'orange' };
    case 'broken':
      return { label: 'HS', tone: 'rose' };
    default:
      return { label: status, tone: 'red' };
  }
};

const EquipmentGrid: React.FC<{ equipment: Equipment[] }> = ({ equipment }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {equipment.map((item) => (
        <Link key={item.id} to={`/equipment/${item.id}`} className="bg-white rounded-lg shadow overflow-hidden hover:shadow-md transition-shadow">
          <div className="aspect-w-16 aspect-h-9">
            <img
              src={item.image_url || 'https://images.unsplash.com/photo-1606857521015-7f9fcf423740?w=300'}
              alt={item.name}
              className="object-cover w-full h-48"
            />
          </div>
          <div className="p-4">
            <h3 className="text-lg font-semibold">{item.name}</h3>
            <p className="text-sm text-gray-600">{item.type} {item.subtype && `- ${item.subtype}`}</p>
            <div className="mt-2 flex justify-between items-center">
              <span className="text-sm font-medium">
                {item.rental_price_ttc.toFixed(2)}€ TTC
              </span>
              <StatusBadge tone={getEquipmentStatusMeta(item.status).tone}>
                {getEquipmentStatusMeta(item.status).label}
              </StatusBadge>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
};

export default EquipmentGrid;
