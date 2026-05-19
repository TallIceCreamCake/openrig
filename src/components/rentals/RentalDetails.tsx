import React from 'react';
import { Rental } from '../../types/rental';

interface RentalDetailsProps {
  rental: Rental;
}

const RentalDetails: React.FC<RentalDetailsProps> = ({ rental }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-500">Titre</h3>
          <p className="mt-1 text-sm text-gray-900">{rental.title || '—'}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-500">Référence</h3>
          <p className="mt-1 text-sm text-gray-900 font-mono">{rental.reference_code || '—'}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-500">Client</h3>
          <p className="mt-1 text-sm text-gray-900">{rental.client_name}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-500">Location</h3>
          <p className="mt-1 text-sm text-gray-900">{rental.location}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-500">Description</h3>
          <p className="mt-1 text-sm text-gray-900">{rental.description}</p>
        </div>
      </div>
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-500">Dates</h3>
          <p className="mt-1 text-sm text-gray-900">
            From: {new Date(rental.start_date).toLocaleString()}
            <br />
            To: {new Date(rental.end_date).toLocaleString()}
          </p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-500">Pricing</h3>
          <div className="mt-1 text-sm">
            <p className="text-gray-900">
              Total: {rental.total_price.toFixed(2)}€
            </p>
            {rental.discount_value && (
              <p className="text-red-600">
                Discount:{' '}
                {rental.discount_type === 'percentage'
                  ? `${rental.discount_value}%`
                  : `${rental.discount_value}€`}
              </p>
            )}
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default RentalDetails;
