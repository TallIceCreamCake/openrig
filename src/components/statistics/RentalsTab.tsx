import React, { useMemo, useState } from 'react';
import { Calendar, Clock, TrendingUp, MapPin, Package } from 'lucide-react';
import { useStats } from '../../hooks/useStats';
import { useDashboardData } from '../../hooks/useDashboardData';

const RentalsTab = () => {
  const [period, setPeriod] = useState('month');

  const stats = useStats();
  const data = useDashboardData();
  const rentalStats = stats.rentalsByMonth.map(m => ({ month: m.month, rentals: m.rentals, revenue: stats.monthlyRevenue.find(x => x.month === m.month)?.revenue || 0, avgDuration: m.avgDuration }));

  const rentalsByType = stats.rentalsByType.map(x => ({
    type: x.type === 'service' ? 'Prestation' : x.type === 'sale' ? 'Vente' : 'Location',
    count: x.count,
    percentage: x.percentage,
    avgValue: x.avgValue,
  }));

  const locationStats = stats.locations;

  const durationAnalysis = useMemo(() => {
    const buckets = [
      { label: '1 jour', test: (d: number) => d === 1 },
      { label: '2-3 jours', test: (d: number) => d >= 2 && d <= 3 },
      { label: '4-7 jours', test: (d: number) => d >= 4 && d <= 7 },
      { label: '1-2 semaines', test: (d: number) => d >= 8 && d <= 14 },
      { label: '+ 2 semaines', test: (d: number) => d > 14 },
    ];
    const arr = buckets.map(b => ({ duration: b.label, count: 0, percentage: 0 }));
    const total = data.rentals.length || 1;
    data.rentals.forEach(r => {
      const d = Math.max(1, Math.ceil((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / (1000*60*60*24)));
      const idx = buckets.findIndex(b => b.test(d));
      if (idx >= 0) arr[idx].count += 1;
    });
    arr.forEach(a => a.percentage = Math.round((a.count / total) * 100));
    return arr;
  }, [data.rentals]);

  const seasonalTrends = [] as any[]; // not available reliably without long history

  const upcomingRentals = data.upcomingRentals.map(r => ({ id: r.id, client: r.client_name, startDate: r.start_date, endDate: r.end_date, location: r.location, equipment: r.equipment_count, value: 0, status: r.status }));

  const getStatusColor = (status: string) => {
    return status === 'confirmed' 
      ? 'bg-green-100 text-green-800' 
      : status === 'pending'
      ? 'bg-yellow-100 text-yellow-800'
      : 'bg-gray-100 text-gray-800';
  };

  const maxRentals = Math.max(1, ...rentalStats.map(item => item.rentals));

  return (
    <div className="space-y-6">
      {/* Rental Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Locations ce mois</p>
              <p className="text-2xl font-bold text-gray-900">48</p>
            </div>
            <Calendar className="h-8 w-8 text-blue-600" />
          </div>
          <div className="mt-4 flex items-center">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="text-sm text-green-600 ml-1">+8% vs mois dernier</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Durée moyenne</p>
              <p className="text-2xl font-bold text-gray-900">3.5j</p>
            </div>
            <Clock className="h-8 w-8 text-green-600" />
          </div>
          <div className="mt-4">
            <span className="text-sm text-gray-600">+0.3j vs moyenne</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Taux de confirmation</p>
              <p className="text-2xl font-bold text-gray-900">89%</p>
            </div>
            <Package className="h-8 w-8 text-purple-600" />
          </div>
          <div className="mt-4 flex items-center">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="text-sm text-green-600 ml-1">+3%</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Locations actives</p>
              <p className="text-2xl font-bold text-gray-900">23</p>
            </div>
            <MapPin className="h-8 w-8 text-orange-600" />
          </div>
          <div className="mt-4">
            <span className="text-sm text-gray-600">En cours</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rental Trends */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Évolution des Locations</h3>
            <p className="text-sm text-gray-500">6 derniers mois</p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {rentalStats.map((item, index) => (
                <div key={index} className="flex items-center space-x-4">
                  <div className="w-12 text-sm font-medium text-gray-600">
                    {item.month}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        {item.rentals} locations
                      </span>
                      <span className="text-xs text-gray-500">
                        {item.avgDuration}j moy.
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${(item.rentals / maxRentals) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Rentals by Type */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Types de Locations</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {rentalsByType.map((item, index) => {
                const colors = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500'];
                return (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${colors[index]}`} />
                      <div>
                        <span className="text-sm font-medium text-gray-900">
                          {item.type}
                        </span>
                        <p className="text-xs text-gray-500">
                          {item.count} locations ({item.percentage}%)
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {item.avgValue}€
                      </p>
                      <p className="text-xs text-gray-500">moy.</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Location Stats */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Locations par Ville</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {locationStats.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-blue-600">
                          {index + 1}
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.location}</p>
                      <p className="text-xs text-gray-500">{item.rentals} locations</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {item.revenue.toLocaleString()}€
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Duration Analysis */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Analyse des Durées</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {durationAnalysis.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">
                        {item.duration}
                      </span>
                      <span className="text-sm text-gray-500">
                        {item.count} locations
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                    <div className="mt-1">
                      <span className="text-xs text-gray-500">{item.percentage}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Seasonal Trends */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Tendances Saisonnières</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {seasonalTrends.map((season, index) => (
              <div key={index} className="text-center p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 mb-2">
                  {season.season}
                </h4>
                <p className="text-2xl font-bold text-blue-600 mb-1">
                  {season.rentals}
                </p>
                <p className="text-xs text-gray-500">locations</p>
                <p className={`text-xs mt-1 ${
                  season.growth.startsWith('+') ? 'text-green-600' : 'text-red-600'
                }`}>
                  {season.growth}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upcoming Rentals */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Prochaines Locations</h3>
          <p className="text-sm text-gray-500">À venir cette semaine</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dates
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Lieu
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Équipements
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Valeur
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {upcomingRentals.map((rental) => (
                <tr key={rental.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {rental.client}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {new Date(rental.startDate).toLocaleDateString()} - {new Date(rental.endDate).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{rental.location}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{rental.equipment} items</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {rental.value}€
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(rental.status)}`}>
                      {rental.status === 'confirmed' ? 'Confirmé' : 'En attente'}
                    </span>
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

export default RentalsTab;
