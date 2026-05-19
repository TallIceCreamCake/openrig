import React, { useState } from 'react';
import { Plus, Filter, Clock, MapPin, Package, User, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PersonnelActivity, Personnel, ActivityType, ActivityStatus } from '../../types/personnel';
import { StatusBadge, type BadgeTone } from '../ui-kit';

interface ActivityLogsProps {
  activities: PersonnelActivity[];
  personnel: Personnel[];
}

const ActivityLogs: React.FC<ActivityLogsProps> = ({ activities, personnel }) => {
  const [filterType, setFilterType] = useState<ActivityType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<ActivityStatus | 'all'>('all');
  const [filterPersonnel, setFilterPersonnel] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);

  const getActivityIcon = (type: ActivityType) => {
    switch (type) {
      case 'preparation':
        return <Package className="h-5 w-5 text-blue-500" />;
      case 'delivery':
        return <MapPin className="h-5 w-5 text-green-500" />;
      case 'pickup':
        return <MapPin className="h-5 w-5 text-orange-500" />;
      case 'maintenance':
        return <Package className="h-5 w-5 text-purple-500" />;
      case 'service':
        return <User className="h-5 w-5 text-indigo-500" />;
      case 'meeting':
        return <User className="h-5 w-5 text-gray-500" />;
      case 'training':
        return <User className="h-5 w-5 text-yellow-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusIcon = (status: ActivityStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'pending':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getActivityTypeLabel = (type: ActivityType) => {
    const labels = {
      preparation: 'Préparation',
      delivery: 'Livraison',
      pickup: 'Récupération',
      maintenance: 'Maintenance',
      service: 'Prestation',
      meeting: 'Réunion',
      training: 'Formation'
    };
    return labels[type] || type;
  };

  const getStatusLabel = (status: ActivityStatus) => {
    const labels = {
      pending: 'En attente',
      in_progress: 'En cours',
      completed: 'Terminé',
      cancelled: 'Annulé'
    };
    return labels[status] || status;
  };

  const getStatusTone = (status: ActivityStatus): BadgeTone => {
    switch (status) {
      case 'completed':
        return 'emerald';
      case 'in_progress':
        return 'blue';
      case 'pending':
        return 'amber';
      case 'cancelled':
        return 'red';
      default:
        return 'gray';
    }
  };

  const filteredActivities = activities.filter(activity => {
    if (filterType !== 'all' && activity.type !== filterType) return false;
    if (filterStatus !== 'all' && activity.status !== filterStatus) return false;
    if (filterPersonnel !== 'all' && activity.personnel_id !== filterPersonnel) return false;
    return true;
  });

  const calculateDuration = (start: string, end?: string) => {
    if (!end) return null;
    const startTime = parseISO(start);
    const endTime = parseISO(end);
    const diffMs = endTime.getTime() - startTime.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(diffMins / 60);
    const minutes = diffMins % 60;
    
    if (hours > 0) {
      return `${hours}h${minutes > 0 ? ` ${minutes}min` : ''}`;
    }
    return `${minutes}min`;
  };

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900">Journal d'Activités</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nouvelle Activité
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as ActivityType | 'all')}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            >
              <option value="all">Tous les types</option>
              <option value="preparation">Préparation</option>
              <option value="delivery">Livraison</option>
              <option value="pickup">Récupération</option>
              <option value="maintenance">Maintenance</option>
              <option value="service">Prestation</option>
              <option value="meeting">Réunion</option>
              <option value="training">Formation</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as ActivityStatus | 'all')}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending">En attente</option>
              <option value="in_progress">En cours</option>
              <option value="completed">Terminé</option>
              <option value="cancelled">Annulé</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Personnel</label>
            <select
              value={filterPersonnel}
              onChange={(e) => setFilterPersonnel(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            >
              <option value="all">Tout le personnel</option>
              {personnel.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.first_name} {person.last_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setFilterType('all');
                setFilterStatus('all');
                setFilterPersonnel('all');
              }}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <Filter className="h-4 w-4 mr-2" />
              Réinitialiser
            </button>
          </div>
        </div>
      </div>

      {/* Activities List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Activités ({filteredActivities.length})
          </h3>
        </div>

        <div className="divide-y divide-gray-200">
          {filteredActivities.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Clock className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Aucune activité</h3>
              <p className="mt-1 text-sm text-gray-500">
                Aucune activité ne correspond aux filtres sélectionnés.
              </p>
            </div>
          ) : (
            filteredActivities.map((activity) => (
              <div key={activity.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 mt-1">
                    {getActivityIcon(activity.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-medium text-gray-900">
                          {activity.title}
                        </h4>
                        <StatusBadge tone={getStatusTone(activity.status)}>
                          {getStatusLabel(activity.status)}
                        </StatusBadge>
                      </div>
                      <div className="flex items-center space-x-2 text-sm text-gray-500">
                        {getStatusIcon(activity.status)}
                        <span>{format(parseISO(activity.start_time), 'dd/MM/yyyy HH:mm', { locale: fr })}</span>
                      </div>
                    </div>
                    
                    <p className="mt-1 text-sm text-gray-600">{activity.description}</p>
                    
                    <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                      <div className="flex items-center">
                        <User className="h-3 w-3 mr-1" />
                        <span>{activity.personnel_name}</span>
                      </div>
                      
                      <div className="flex items-center">
                        <Package className="h-3 w-3 mr-1" />
                        <span>{getActivityTypeLabel(activity.type)}</span>
                      </div>
                      
                      {activity.duration_minutes && (
                        <div className="flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          <span>{calculateDuration(activity.start_time, activity.end_time)}</span>
                        </div>
                      )}
                      
                      {activity.location && (
                        <div className="flex items-center">
                          <MapPin className="h-3 w-3 mr-1" />
                          <span>{activity.location}</span>
                        </div>
                      )}
                      
                      {activity.client_name && (
                        <div className="flex items-center">
                          <User className="h-3 w-3 mr-1" />
                          <span>Client: {activity.client_name}</span>
                        </div>
                      )}
                    </div>
                    
                    {activity.equipment_involved && activity.equipment_involved.length > 0 && (
                      <div className="mt-2">
                        <div className="flex flex-wrap gap-1">
                          {activity.equipment_involved.map((equipment, index) => (
                            <StatusBadge key={index} tone="blue" size="md">
                              {equipment}
                            </StatusBadge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {activity.notes && (
                      <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                        <strong>Notes:</strong> {activity.notes}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivityLogs;
