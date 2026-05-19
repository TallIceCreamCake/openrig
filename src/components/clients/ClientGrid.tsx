import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, Building2 } from 'lucide-react';
import { Client } from '../../types/client';

const getInitials = (name?: string | null) => {
  if (!name) return '?';
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() || '');
  const joined = letters.join('').slice(0, 2);
  return joined || '?';
};

const ClientGrid: React.FC<{ clients: Client[] }> = ({ clients }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {clients.map((client) => (
        <Link
          key={client.id}
          to={`/clients/${client.id}`}
          className="bg-white rounded-lg shadow overflow-hidden hover:shadow-md transition-shadow"
        >
          <div className="h-24 bg-gray-100 flex items-center justify-center">
            <span className="text-2xl font-semibold text-gray-500">
              {getInitials(client.name)}
            </span>
          </div>
          <div className="p-4">
            <h3 className="text-lg font-semibold text-gray-900">{client.name}</h3>
            {client.company && (
              <p className="text-sm text-gray-600 flex items-center mt-1">
                <Building2 className="h-4 w-4 mr-1" />
                {client.company}
              </p>
            )}
            {client.email && (
              <p className="text-sm text-gray-600 flex items-center mt-1">
                <Mail className="h-4 w-4 mr-1" />
                {client.email}
              </p>
            )}
            {client.phone && (
              <p className="text-sm text-gray-600 flex items-center mt-1">
                <Phone className="h-4 w-4 mr-1" />
                {client.phone}
              </p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
};

export default ClientGrid;
