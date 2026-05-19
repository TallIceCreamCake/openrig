import React from 'react';
import { Link } from 'react-router-dom';
import { Equipment } from '../../types/equipment';
import StockIndicator from './StockIndicator';
import EmptyTableRow from '../common/EmptyTableRow';

// Mock stock data - replace with actual data in production
const getStockForEquipment = (equipmentId: string) => {
  const mockStocks: Record<string, number> = {
    '1': 5,
    '2': 2,
  };
  return mockStocks[equipmentId] || 0;
};

interface EnhancedEquipmentTableProps {
  equipment: Equipment[];
  searchQuery: string;
}

const EnhancedEquipmentTable: React.FC<EnhancedEquipmentTableProps> = ({ 
  equipment,
  searchQuery 
}) => {
  const filteredEquipment = equipment.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.subtype && item.subtype.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8"></th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price (HT/TTC)</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {filteredEquipment.length === 0 && (
            <EmptyTableRow colSpan={5} message={"Aucun matériel ne correspond à la recherche"} />
          )}
          {filteredEquipment.map((item) => {
            const totalStock = getStockForEquipment(item.id);
            
            return (
              <tr
                key={item.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => window.location.href = `/equipment/${item.id}`}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <StockIndicator totalStock={totalStock} status={item.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="h-10 w-10 flex-shrink-0">
                      <img 
                        className="h-10 w-10 rounded-full object-cover"
                        src={item.image_url || 'https://images.unsplash.com/photo-1606857521015-7f9fcf423740?w=300'}
                        alt=""
                      />
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{item.name}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{item.type}</div>
                  {item.subtype && (
                    <div className="text-sm text-gray-500">{item.subtype}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{item.rental_price_ht.toFixed(2)}€ HT</div>
                  <div className="text-sm text-gray-500">{item.rental_price_ttc.toFixed(2)}€ TTC</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    item.status === 'available' ? 'bg-green-100 text-green-800' :
                    item.status === 'in_use' ? 'bg-blue-100 text-blue-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {item.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default EnhancedEquipmentTable;
