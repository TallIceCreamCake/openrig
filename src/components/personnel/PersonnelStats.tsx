import React, { useState } from 'react';
import { BarChart3, TrendingUp, Clock, Award, Users, Activity } from 'lucide-react';
import { Personnel, PersonnelActivity } from '../../types/personnel';

interface PersonnelStatsProps {
  personnel: Personnel[];
  activities: PersonnelActivity[];
}

const PersonnelStats: React.FC<PersonnelStatsProps> = ({ personnel, activities }) => {
  const [period, setPeriod] = useState('month');

  // Calculate stats
  const totalPersonnel = personnel.length;
  const activePersonnel = personnel.filter(p => p.status === 'active').length;
  const completedActivities = activities.filter(a => a.status === 'completed').length;
  const totalActivities = activities.length;

  // Performance by person
  const personnelPerformance = personnel.map(person => {
    const personActivities = activities.filter(a => a.personnel_id === person.id);
    const completedCount = personActivities.filter(a => a.status === 'completed').length;
    const totalHours = personActivities
      .filter(a => a.duration_minutes)
      .reduce((sum, a) => sum + (a.duration_minutes || 0), 0) / 60;
    
    return {
      ...person,
      activitiesCount: personActivities.length,
      completedCount,
      totalHours: Math.round(totalHours * 10) / 10,
      efficiency: personActivities.length > 0 ? Math.round((completedCount / personActivities.length) * 100) : 0
    };
  });

  // Activity types distribution
  const activityTypes = activities.reduce((acc, activity) => {
    acc[activity.type] = (acc[activity.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const activityTypeLabels = {
    preparation: 'Préparation',
    delivery: 'Livraison',
    pickup: 'Récupération',
    maintenance: 'Maintenance',
    service: 'Prestation',
    meeting: 'Réunion',
    training: 'Formation'
  };

  // Role distribution
  const roleDistribution = personnel.reduce((acc, person) => {
    acc[person.role] = (acc[person.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const roleLabels = {
    admin: 'Administrateur',
    manager: 'Manager',
    technician: 'Technicien',
    driver: 'Chauffeur',
    commercial: 'Commercial',
    accountant: 'Comptable'
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Personnel Total</p>
              <p className="text-2xl font-bold text-gray-900">{totalPersonnel}</p>
            </div>
            <Users className="h-8 w-8 text-blue-600" />
          </div>
          <div className="mt-4">
            <span className="text-sm text-green-600">{activePersonnel} actifs</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Activités ce mois</p>
              <p className="text-2xl font-bold text-gray-900">{totalActivities}</p>
            </div>
            <Activity className="h-8 w-8 text-green-600" />
          </div>
          <div className="mt-4">
            <span className="text-sm text-green-600">{completedActivities} terminées</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Taux de réussite</p>
              <p className="text-2xl font-bold text-gray-900">
                {totalActivities > 0 ? Math.round((completedActivities / totalActivities) * 100) : 0}%
              </p>
            </div>
            <Award className="h-8 w-8 text-purple-600" />
          </div>
          <div className="mt-4 flex items-center">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="text-sm text-green-600 ml-1">+5% vs mois dernier</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Heures travaillées</p>
              <p className="text-2xl font-bold text-gray-900">
                {personnelPerformance.reduce((sum, p) => sum + p.totalHours, 0)}h
              </p>
            </div>
            <Clock className="h-8 w-8 text-orange-600" />
          </div>
          <div className="mt-4">
            <span className="text-sm text-gray-600">Ce mois</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance by Person */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Performance Individuelle</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {personnelPerformance
                .sort((a, b) => b.efficiency - a.efficiency)
                .map((person) => (
                <div key={person.id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <img
                      className="h-8 w-8 rounded-full object-cover"
                      src={person.avatar_url || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100'}
                      alt=""
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {person.first_name} {person.last_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {person.activitiesCount} activités • {person.totalHours}h
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${person.efficiency}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-10">
                      {person.efficiency}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Activity Types */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Types d'Activités</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {Object.entries(activityTypes)
                .sort(([,a], [,b]) => b - a)
                .map(([type, count]) => {
                  const percentage = totalActivities > 0 ? (count / totalActivities) * 100 : 0;
                  return (
                    <div key={type} className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900">
                            {activityTypeLabels[type as keyof typeof activityTypeLabels] || type}
                          </span>
                          <span className="text-sm text-gray-500">{count}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <div className="mt-1">
                          <span className="text-xs text-gray-500">{percentage.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>

      {/* Role Distribution */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Répartition par Rôle</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Object.entries(roleDistribution).map(([role, count]) => (
              <div key={role} className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{count}</p>
                <p className="text-sm text-gray-600">
                  {roleLabels[role as keyof typeof roleLabels] || role}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Performance Trends */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">Tendances de Performance</h3>
            <div className="flex space-x-2">
              {['week', 'month', 'quarter'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 text-sm rounded-md ${
                    period === p
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {p === 'week' ? 'Semaine' : p === 'month' ? 'Mois' : 'Trimestre'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="text-center text-gray-500 py-8">
            <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Graphiques à venir</h3>
            <p className="mt-1 text-sm text-gray-500">
              Les graphiques de tendances seront disponibles avec plus de données.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersonnelStats;