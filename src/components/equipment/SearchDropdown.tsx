import React from 'react';
import { Link } from 'react-router-dom';
import { Equipment } from '../../types/equipment';

type QuickEquipment = Equipment & { available_units?: number };

interface SearchDropdownProps {
  equipment: QuickEquipment[];
  searchQuery: string;
  onClose: () => void;
}

const SearchDropdown: React.FC<SearchDropdownProps> = ({ equipment, searchQuery, onClose }) => {
  if (!searchQuery) return null;

  const filteredEquipment = equipment.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.subtype && item.subtype.toLowerCase().includes(searchQuery.toLowerCase()))
  ).slice(0, 3);

  if (filteredEquipment.length === 0) return null;

  return (
    <div className="absolute mt-1 w-full bg-white rounded-md shadow-lg z-50">
      <ul className="max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
        {filteredEquipment.map((item) => (
          <li
            key={item.id}
            className="hover:bg-gray-100 cursor-pointer"
          >
            <Link
              to={`/equipment/${item.id}`}
              className="flex items-center px-4 py-2"
              onClick={onClose}
            >
              {(() => {
                const available = (item as any).available_units;
                const badgeClass = (() => {
                  if (available === undefined || available === null) return 'bg-gray-300';
                  if (available <= 0) return 'bg-red-500';
                  if (available <= 2) return 'bg-orange-500';
                  return 'bg-green-500';
                })();
                const label = (() => {
                  if (available === undefined || available === null) return 'Vérification…';
                  if (available <= 0) return 'Indisponible';
                  if (available <= 2) return `Stock limité (${available})`;
                  return `Disponible (${available})`;
                })();
                const labelClass = (() => {
                  if (available === undefined || available === null) return 'text-gray-500';
                  if (available <= 0) return 'text-red-600';
                  if (available <= 2) return 'text-orange-600';
                  return 'text-green-600';
                })();
                return (
                  <>
                    <span className={`inline-flex items-center justify-center w-2.5 h-2.5 rounded-full mr-3 ${badgeClass}`} />
                    <div className="ml-3 flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <p className="text-sm text-gray-500">{item.type} {item.subtype && `- ${item.subtype}`}</p>
                      <p className={`text-xs mt-1 ${labelClass}`}>{label}</p>
                    </div>
                  </>
                );
              })()}
              <div className="ml-3 flex-shrink-0 text-right">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                  {item.status}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SearchDropdown;
