import React, { useState, useEffect } from 'react';
import { Equipment } from '../../types/equipment';

interface EquipmentFiltersProps {
  equipment: Equipment[];
  onFilter: (filtered: Equipment[]) => void;
}

const EquipmentFilters: React.FC<EquipmentFiltersProps> = ({ equipment, onFilter }) => {
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Extract unique types and statuses, ensuring no null/undefined values
  const types = Array.from(new Set(equipment.map((e) => e.type).filter(Boolean)));
  const statuses = Array.from(new Set(equipment.map((e) => e.status).filter(Boolean)));

  useEffect(() => {
    let filtered = [...equipment];

    // Apply search filter
    if (search.trim()) {
      filtered = filtered.filter((e) => 
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.type.toLowerCase().includes(search.toLowerCase()) ||
        (e.subtype && e.subtype.toLowerCase().includes(search.toLowerCase()))
      );
    }

    // Apply type filter
    if (selectedType) {
      filtered = filtered.filter((e) => e.type === selectedType);
    }

    // Apply status filter
    if (selectedStatus) {
      filtered = filtered.filter((e) => e.status === selectedStatus);
    }

    // Pass filtered results to parent component
    onFilter(filtered);
  }, [search, selectedType, selectedStatus, equipment, onFilter]);

  return (
    <div className="flex flex-wrap gap-4">
      {/* Search input */}
      <input
        type="text"
        placeholder="Search equipment..."
        className="px-4 py-2 border rounded-md"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Filter by type */}
      <select
        className="px-4 py-2 border rounded-md"
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value)}
      >
        <option value="">All Types</option>
        {types.map((type) => (
          <option key={type} value={type}>{type}</option>
        ))}
      </select>

      {/* Filter by status */}
      <select
        className="px-4 py-2 border rounded-md"
        value={selectedStatus}
        onChange={(e) => setSelectedStatus(e.target.value)}
      >
        <option value="">All Statuses</option>
        {statuses.map((status) => (
          <option key={status} value={status}>{status}</option>
        ))}
      </select>
    </div>
  );
};

export default EquipmentFilters;
