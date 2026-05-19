import React, { useMemo, useState, useEffect } from 'react';
import { Users, TrendingUp, Star, Calendar, Euro } from 'lucide-react';
import { useDashboardData } from '../../hooks/useDashboardData';
import { useStats } from '../../hooks/useStats';
import { supabase } from '../../lib/supabase';

const ClientsTab = () => {
  const [sortBy, setSortBy] = useState('revenue');

  const data = useDashboardData();
  const stats = useStats();
  const [totalClients, setTotalClients] = useState(0);
  useEffect(() => {
    const load = async () => {
      const { count } = await supabase.from('clients').select('*', { head: true, count: 'exact' });
      setTotalClients(count || 0);
    };
    load();
  }, []);
  const rentalsByClient = useMemo(() => {
    const m = new Map<string, number>();
    data.rentals.forEach(r => {
      if (!r.client_id) return;
      m.set(r.client_id, (m.get(r.client_id) || 0) + 1);
    });
    return m;
  }, [data.rentals]);
  const clientStats = useMemo(() => data.topClients.map(c => ({
    id: c.id,
    name: c.name,
    company: c.name,
    totalRentals: rentalsByClient.get(c.id) || 0,
    totalRevenue: c.totalSpent,
    avgRentalValue: c.rentalsCount ? Math.round(c.totalSpent / c.rentalsCount) : 0,
    lastRental: c.lastRental,
    status: 'active',
    satisfaction: 4.6,
    joinDate: c.lastRental
  })), [data.topClients, rentalsByClient]);

  const clientSegments: Array<{ segment: string; count: number; revenue: number; avgValue: number }> = [];

  const monthlyNewClients = stats.newClientsByMonth;

  const topEquipmentByClient: Array<{ equipment: string; clients: number; rentals: number }> = [];

  const sortedClients = [...clientStats].sort((a, b) => {
    switch (sortBy) {
      case 'revenue':
        return b.totalRevenue - a.totalRevenue;
      case 'rentals':
        return b.totalRentals - a.totalRentals;
      case 'satisfaction':
        return b.satisfaction - a.satisfaction;
      case 'recent':
        return new Date(b.lastRental).getTime() - new Date(a.lastRental).getTime();
      default:
        return a.name.localeCompare(b.name);
    }
  });

  const getStatusColor = (status: string) => {
    return status === 'active' 
      ? 'bg-green-100 text-green-800' 
      : 'bg-gray-100 text-gray-800';
  };

  const getSatisfactionStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${
          i < Math.floor(rating) 
            ? 'text-yellow-400 fill-current' 
            : 'text-gray-300'
        }`}
      />
    ));
  };

  return (
    <div className="space-y-6">
      {/* Client Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Clients</p>
              <p className="text-2xl font-bold text-gray-900">{totalClients}</p>
            </div>
            <Users className="h-8 w-8 text-blue-600" />
          </div>
          <div className="mt-4 flex items-center">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="text-sm text-green-600 ml-1">+12 ce mois</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Clients Actifs</p>
              <p className="text-2xl font-bold text-gray-900">{Array.from(rentalsByClient.keys()).length}</p>
            </div>
            <Calendar className="h-8 w-8 text-green-600" />
          </div>
          <div className="mt-4">
            <span className="text-sm text-gray-600">76% du total</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Revenus/Client</p>
              <p className="text-2xl font-bold text-gray-900">1 156€</p>
            </div>
            <Euro className="h-8 w-8 text-purple-600" />
          </div>
          <div className="mt-4 flex items-center">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="text-sm text-green-600 ml-1">+8.5%</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Satisfaction</p>
              <p className="text-2xl font-bold text-gray-900">4.6/5</p>
            </div>
            <Star className="h-8 w-8 text-yellow-500" />
          </div>
          <div className="mt-4">
            <span className="text-sm text-gray-600">92% satisfaits</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Client Segments */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Segments Clients</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {clientSegments.map((segment, index) => {
                const colors = ['bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500'];
                return (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${colors[index]}`} />
                      <div>
                        <span className="text-sm font-medium text-gray-900">
                          {segment.segment}
                        </span>
                        <p className="text-xs text-gray-500">
                          {segment.count} clients
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {segment.revenue.toLocaleString()}€
                      </p>
                      <p className="text-xs text-gray-500">
                        {segment.avgValue}€ moy.
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* New Clients Trend */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Nouveaux Clients</h3>
            <p className="text-sm text-gray-500">6 derniers mois</p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {monthlyNewClients.map((item, index) => {
                const maxCount = Math.max(...monthlyNewClients.map(m => m.count));
                return (
                  <div key={index} className="flex items-center space-x-4">
                    <div className="w-12 text-sm font-medium text-gray-600">
                      {item.month}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {item.count} clients
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${(item.count / maxCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Top Equipment by Clients */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Équipements Populaires</h3>
          <p className="text-sm text-gray-500">Les plus demandés par les clients</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {topEquipmentByClient.map((item, index) => (
              <div key={index} className="text-center p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 mb-2">
                  {item.equipment}
                </h4>
                <p className="text-2xl font-bold text-blue-600 mb-1">
                  {item.clients}
                </p>
                <p className="text-xs text-gray-500">clients</p>
                <p className="text-xs text-gray-400 mt-1">
                  {item.rentals} locations
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Client Details Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">Détails des Clients</h3>
            <div className="flex space-x-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="text-sm border border-gray-300 rounded-md px-3 py-1"
              >
                <option value="name">Nom</option>
                <option value="revenue">Revenus</option>
                <option value="rentals">Locations</option>
                <option value="satisfaction">Satisfaction</option>
                <option value="recent">Récent</option>
              </select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Locations
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Revenus
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Panier Moyen
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Satisfaction
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dernière Location
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedClients.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {client.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {client.email}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{client.totalRentals}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {client.totalRevenue.toLocaleString()}€
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {client.avgRentalValue}€
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-1">
                      {getSatisfactionStars(client.satisfaction)}
                      <span className="text-sm text-gray-600 ml-2">
                        {client.satisfaction}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(client.status)}`}>
                      {client.status === 'active' ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {new Date(client.lastRental).toLocaleDateString()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ClientsTab;
