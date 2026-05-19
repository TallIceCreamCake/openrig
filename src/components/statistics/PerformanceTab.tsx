import React, { useState } from 'react';
import { Target, TrendingUp, Clock, AlertCircle, CheckCircle, Users } from 'lucide-react';

const PerformanceTab = () => {
  const [period, setPeriod] = useState('month');

  const kpiTargets = [
    {
      name: 'Chiffre d\'affaires',
      current: 32450,
      target: 35000,
      unit: '€',
      progress: 93,
      trend: '+12%',
      status: 'warning'
    },
    {
      name: 'Taux d\'utilisation',
      current: 68,
      target: 75,
      unit: '%',
      progress: 91,
      trend: '+5%',
      status: 'warning'
    },
    {
      name: 'Nouveaux clients',
      current: 12,
      target: 10,
      unit: '',
      progress: 120,
      trend: '+20%',
      status: 'success'
    },
    {
      name: 'Satisfaction client',
      current: 4.6,
      target: 4.5,
      unit: '/5',
      progress: 102,
      trend: '+2%',
      status: 'success'
    }
  ];

  const teamPerformance = [
    {
      name: 'Jean Dupont',
      role: 'Commercial',
      rentalsManaged: 45,
      revenue: 28500,
      clientSatisfaction: 4.8,
      efficiency: 92
    },
    {
      name: 'Marie Martin',
      role: 'Technicienne',
      rentalsManaged: 38,
      revenue: 24200,
      clientSatisfaction: 4.7,
      efficiency: 89
    },
    {
      name: 'Pierre Durand',
      role: 'Logistique',
      rentalsManaged: 52,
      revenue: 31800,
      clientSatisfaction: 4.5,
      efficiency: 95
    }
  ];

  const operationalMetrics = [
    { metric: 'Temps de préparation moyen', value: '45min', target: '40min', status: 'warning' },
    { metric: 'Taux de retour à temps', value: '94%', target: '95%', status: 'warning' },
    { metric: 'Équipements en panne', value: '3%', target: '< 5%', status: 'success' },
    { metric: 'Délai de réponse client', value: '2h', target: '< 4h', status: 'success' },
    { metric: 'Taux de renouvellement', value: '78%', target: '80%', status: 'warning' },
    { metric: 'Marge brute moyenne', value: '65%', target: '60%', status: 'success' }
  ];

  const monthlyComparison = [
    { month: 'Jan', revenue: 28500, target: 30000, rentals: 45, satisfaction: 4.5 },
    { month: 'Fév', revenue: 31200, target: 32000, rentals: 52, satisfaction: 4.6 },
    { month: 'Mar', revenue: 32450, target: 35000, rentals: 48, satisfaction: 4.6 },
    { month: 'Avr', revenue: 29800, target: 33000, rentals: 41, satisfaction: 4.4 },
    { month: 'Mai', revenue: 35600, target: 36000, rentals: 58, satisfaction: 4.7 },
    { month: 'Jun', revenue: 38200, target: 38000, rentals: 62, satisfaction: 4.8 }
  ];

  const alerts = [
    { type: 'warning', message: 'Objectif CA mensuel non atteint (-7%)', priority: 'high' },
    { type: 'info', message: 'Nouveau record de satisfaction client ce mois', priority: 'low' },
    { type: 'warning', message: 'Taux d\'utilisation en baisse sur les caméras', priority: 'medium' },
    { type: 'success', message: 'Dépassement objectif nouveaux clients (+20%)', priority: 'low' }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-600 bg-green-100';
      case 'warning':
        return 'text-yellow-600 bg-yellow-100';
      case 'danger':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Targets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiTargets.map((kpi, index) => (
          <div key={index} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-500">{kpi.name}</h3>
              <Target className="h-5 w-5 text-gray-400" />
            </div>
            
            <div className="mb-4">
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-bold text-gray-900">
                  {kpi.current.toLocaleString()}{kpi.unit}
                </span>
                <span className="text-sm text-gray-500">
                  / {kpi.target.toLocaleString()}{kpi.unit}
                </span>
              </div>
              <div className="flex items-center mt-1">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-600 ml-1">{kpi.trend}</span>
              </div>
            </div>

            <div className="mb-2">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Progression</span>
                <span>{kpi.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    kpi.progress >= 100 ? 'bg-green-500' : 
                    kpi.progress >= 80 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(kpi.progress, 100)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Performance */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Performance Équipe</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {teamPerformance.map((member, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">{member.name}</h4>
                      <p className="text-xs text-gray-500">{member.role}</p>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Users className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-600">{member.efficiency}%</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Locations</p>
                      <p className="font-medium">{member.rentalsManaged}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Revenus</p>
                      <p className="font-medium">{member.revenue.toLocaleString()}€</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Satisfaction</p>
                      <p className="font-medium">{member.clientSatisfaction}/5</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Operational Metrics */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Métriques Opérationnelles</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {operationalMetrics.map((metric, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{metric.metric}</p>
                    <p className="text-xs text-gray-500">Objectif: {metric.target}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-900">
                      {metric.value}
                    </span>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(metric.status)}`}>
                      {metric.status === 'success' ? '✓' : '!'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Comparison Chart */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Comparaison Objectifs vs Réalisé</h3>
          <p className="text-sm text-gray-500">6 derniers mois</p>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {monthlyComparison.map((item, index) => {
              const achievementRate = (item.revenue / item.target) * 100;
              return (
                <div key={index} className="flex items-center space-x-4">
                  <div className="w-12 text-sm font-medium text-gray-600">
                    {item.month}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        {item.revenue.toLocaleString()}€
                      </span>
                      <span className="text-xs text-gray-500">
                        Obj: {item.target.toLocaleString()}€ ({achievementRate.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 relative">
                      <div
                        className={`h-2 rounded-full ${
                          achievementRate >= 100 ? 'bg-green-500' : 
                          achievementRate >= 90 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(achievementRate, 100)}%` }}
                      />
                      <div 
                        className="absolute top-0 w-0.5 h-2 bg-gray-600"
                        style={{ left: '100%' }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">{item.rentals} loc.</p>
                    <p className="text-xs text-gray-500">{item.satisfaction}/5</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Performance Alerts */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Alertes Performance</h3>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {alerts.map((alert, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex-shrink-0 mt-0.5">
                  {getAlertIcon(alert.type)}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-900">{alert.message}</p>
                </div>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  alert.priority === 'high' ? 'bg-red-100 text-red-800' :
                  alert.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {alert.priority === 'high' ? 'Urgent' :
                   alert.priority === 'medium' ? 'Moyen' : 'Info'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceTab;