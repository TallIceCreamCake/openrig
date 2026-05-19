import React, { useState } from 'react';
import { Grid, List } from 'lucide-react';
import ClientGrid from './ClientGrid';
import ClientTable from './ClientTable';
import { Client } from '../../types/client';

interface ClientListProps {
  clients: Client[];
  onBulkDelete?: (ids: string[]) => Promise<void> | void;
}

const ClientList: React.FC<ClientListProps> = ({ clients, onBulkDelete }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="flex space-x-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded transition ${
              viewMode === 'grid' ? 'bg-gray-200 text-gray-900' : 'bg-gray-100 text-gray-600'
            }`}
          >
            <Grid className="h-5 w-5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded transition ${
              viewMode === 'list' ? 'bg-gray-200 text-gray-900' : 'bg-gray-100 text-gray-600'
            }`}
          >
            <List className="h-5 w-5" />
          </button>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <ClientGrid clients={clients} />
      ) : (
        <ClientTable clients={clients} onBulkDelete={onBulkDelete} />
      )}
    </div>
  );
};

export default ClientList;
