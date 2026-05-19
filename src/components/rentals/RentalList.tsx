import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, MapPin, Package, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Rental } from '../../types/rental';

interface RentalListProps {
  rentals: Rental[];
  onDelete?: (id: string) => void;
}

const RentalList: React.FC<RentalListProps> = ({ rentals, onDelete }) => {
  return (
    <div className="space-y-4">
      {rentals.map((rental) => (
        <Link
          key={rental.id}
          to={`/rentals/${rental.id}`}
          className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow"
        >
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: rental.color || '#9CA3AF' }}
                />
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    {rental.type === 'rental' ? 'Location' : 'Prestation'} - {rental.client_name}
                  </h3>
                  <p className="text-sm text-gray-500">{rental.description}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${
                    rental.status === 'confirmed'
                      ? 'bg-blue-100 text-blue-800'
                      : rental.status === 'preparing'
                      ? 'bg-orange-100 text-orange-800'
                      : rental.status === 'in_progress'
                      ? 'bg-indigo-100 text-indigo-800'
                      : rental.status === 'delivered'
                      ? 'bg-teal-100 text-teal-800'
                      : rental.status === 'return_delivery'
                      ? 'bg-cyan-100 text-cyan-800'
                      : rental.status === 'in_return'
                      ? 'bg-purple-100 text-purple-800'
                      : rental.status === 'returned'
                      ? 'bg-emerald-100 text-emerald-800'
                      : rental.status === 'paid'
                      ? 'bg-green-600/10 text-green-700'
                      : rental.status === 'completed'
                      ? 'bg-gray-100 text-gray-800'
                      : rental.status === 'cancelled'
                      ? 'bg-red-100 text-red-800'
                      : rental.status === 'archived'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {rental.status}
                </span>
                {onDelete && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(rental.id); }}
                    className="inline-flex items-center px-2 py-1 text-xs rounded-md bg-red-50 text-red-700 hover:bg-red-100"
                    title="Supprimer le projet"
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Supprimer
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center text-sm text-gray-500">
                <Calendar className="h-4 w-4 mr-2" />
                <span>
                  {format(new Date(rental.start_date), 'MMM d, yyyy HH:mm')} -{' '}
                  {format(new Date(rental.end_date), 'MMM d, yyyy HH:mm')}
                </span>
              </div>

              {rental.location && (
                <div className="flex items-center text-sm text-gray-500">
                  <MapPin className="h-4 w-4 mr-2" />
                  <span>{rental.location}</span>
                </div>
              )}

              <div className="flex items-center text-sm text-gray-500">
                <Package className="h-4 w-4 mr-2" />
                <span>{rental.items.length} items</span>
              </div>
            </div>

            {rental.total_price > 0 && (
              <div className="mt-4 flex justify-end">
                <div className="text-right">
                  <span className="text-sm text-gray-500">Prix total</span>
                  <p className="text-lg font-medium text-gray-900">
                    {rental.total_price.toFixed(2)}€
                    {rental.discount_value && (
                      <span className="ml-2 text-sm text-red-600">
                        -{rental.discount_type === 'percentage'
                          ? `${rental.discount_value}%`
                          : `${rental.discount_value}€`}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
};

export default RentalList;
