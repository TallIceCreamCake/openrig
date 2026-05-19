import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  BarChart3, 
  TrendingUp, 
  Package, 
  Users, 
  Calendar,
  Euro,
  Activity,
  PieChart,
  LineChart,
  Target
} from 'lucide-react';
import OverviewTab from '../components/statistics/OverviewTab';
import RevenueTab from '../components/statistics/RevenueTab';
import EquipmentTab from '../components/statistics/EquipmentTab';
import ClientsTab from '../components/statistics/ClientsTab';
import RentalsTab from '../components/statistics/RentalsTab';
import PerformanceTab from '../components/statistics/PerformanceTab';

const tabs = [
  {
    id: 'overview',
    name: 'Vue d\'ensemble',
    icon: BarChart3,
    component: OverviewTab
  },
  {
    id: 'revenue',
    name: 'Chiffre d\'affaires',
    icon: Euro,
    component: RevenueTab
  },
  {
    id: 'equipment',
    name: 'Équipements',
    icon: Package,
    component: EquipmentTab
  },
  {
    id: 'clients',
    name: 'Clients',
    icon: Users,
    component: ClientsTab
  },
  {
    id: 'rentals',
    name: 'Locations',
    icon: Calendar,
    component: RentalsTab
  },
  {
    id: 'performance',
    name: 'Performance',
    icon: Target,
    component: PerformanceTab
  }
];

const Statistics = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get('tab');
    const valid = ['overview', 'revenue', 'equipment', 'clients', 'rentals', 'performance'];
    return valid.includes(t as string) ? t as string : 'overview';
  });
  useEffect(() => { setSearchParams({ tab: activeTab }, { replace: true }); }, [activeTab]);

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || OverviewTab;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Statistiques</h1>
          <p className="text-sm text-gray-600 mt-1">
            Analyse détaillée de votre activité de location
          </p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <Activity className="h-4 w-4" />
          <span>Données en temps réel</span>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[600px]">
        <ActiveComponent />
      </div>
    </div>
  );
};

export default Statistics;