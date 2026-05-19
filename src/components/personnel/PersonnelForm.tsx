import React from 'react';
import { useForm } from 'react-hook-form';
import { Personnel, PersonnelRole, PersonnelStatus } from '../../types/personnel';

interface PersonnelFormProps {
  onSubmit: (data: Partial<Personnel>) => void;
  initialData?: Partial<Personnel>;
}

const PersonnelForm: React.FC<PersonnelFormProps> = ({ onSubmit, initialData }) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<Partial<Personnel>>({
    defaultValues: initialData,
  });

  const roles: { value: PersonnelRole; label: string }[] = [
    { value: 'admin', label: 'Administrateur' },
    { value: 'manager', label: 'Manager' },
    { value: 'technician', label: 'Technicien' },
    { value: 'driver', label: 'Chauffeur' },
    { value: 'commercial', label: 'Commercial' },
    { value: 'accountant', label: 'Comptable' },
  ];

  const statuses: { value: PersonnelStatus; label: string }[] = [
    { value: 'active', label: 'Actif' },
    { value: 'inactive', label: 'Inactif' },
    { value: 'vacation', label: 'En congés' },
    { value: 'sick_leave', label: 'Arrêt maladie' },
  ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Informations personnelles */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Informations personnelles</h3>
          
          <div>
            <label htmlFor="first_name" className="block text-sm font-medium text-gray-700">
              Prénom *
            </label>
            <input
              id="first_name"
              type="text"
              {...register('first_name', { required: 'Le prénom est requis' })}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                errors.first_name ? 'border-red-500' : ''
              }`}
            />
            {errors.first_name && <p className="text-sm text-red-600">{errors.first_name.message}</p>}
          </div>

          <div>
            <label htmlFor="last_name" className="block text-sm font-medium text-gray-700">
              Nom *
            </label>
            <input
              id="last_name"
              type="text"
              {...register('last_name', { required: 'Le nom est requis' })}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                errors.last_name ? 'border-red-500' : ''
              }`}
            />
            {errors.last_name && <p className="text-sm text-red-600">{errors.last_name.message}</p>}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email *
            </label>
            <input
              id="email"
              type="email"
              {...register('email', {
                required: 'L\'email est requis',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Email invalide',
                },
              })}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                errors.email ? 'border-red-500' : ''
              }`}
            />
            {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
              Téléphone *
            </label>
            <input
              id="phone"
              type="tel"
              {...register('phone', { required: 'Le téléphone est requis' })}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                errors.phone ? 'border-red-500' : ''
              }`}
            />
            {errors.phone && <p className="text-sm text-red-600">{errors.phone.message}</p>}
          </div>

          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700">
              Adresse
            </label>
            <textarea
              id="address"
              {...register('address')}
              rows={3}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Informations professionnelles */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Informations professionnelles</h3>
          
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700">
              Rôle *
            </label>
            <select
              id="role"
              {...register('role', { required: 'Le rôle est requis' })}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                errors.role ? 'border-red-500' : ''
              }`}
            >
              <option value="">Sélectionner un rôle</option>
              {roles.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
            {errors.role && <p className="text-sm text-red-600">{errors.role.message}</p>}
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700">
              Statut *
            </label>
            <select
              id="status"
              {...register('status', { required: 'Le statut est requis' })}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                errors.status ? 'border-red-500' : ''
              }`}
            >
              <option value="">Sélectionner un statut</option>
              {statuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
            {errors.status && <p className="text-sm text-red-600">{errors.status.message}</p>}
          </div>

          <div>
            <label htmlFor="hire_date" className="block text-sm font-medium text-gray-700">
              Date d'embauche *
            </label>
            <input
              id="hire_date"
              type="date"
              {...register('hire_date', { required: 'La date d\'embauche est requise' })}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                errors.hire_date ? 'border-red-500' : ''
              }`}
            />
            {errors.hire_date && <p className="text-sm text-red-600">{errors.hire_date.message}</p>}
          </div>

          <div>
            <label htmlFor="salary" className="block text-sm font-medium text-gray-700">
              Salaire annuel (€) *
            </label>
            <input
              id="salary"
              type="number"
              min="0"
              step="1000"
              {...register('salary', { 
                required: 'Le salaire est requis',
                valueAsNumber: true,
                min: { value: 0, message: 'Le salaire doit être positif' }
              })}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                errors.salary ? 'border-red-500' : ''
              }`}
            />
            {errors.salary && <p className="text-sm text-red-600">{errors.salary.message}</p>}
          </div>

          <div>
            <label htmlFor="avatar_url" className="block text-sm font-medium text-gray-700">
              URL Photo de profil
            </label>
            <input
              id="avatar_url"
              type="url"
              {...register('avatar_url')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Contact d'urgence */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Contact d'urgence</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="emergency_name" className="block text-sm font-medium text-gray-700">
              Nom du contact
            </label>
            <input
              id="emergency_name"
              type="text"
              {...register('emergency_contact.name')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="emergency_phone" className="block text-sm font-medium text-gray-700">
              Téléphone
            </label>
            <input
              id="emergency_phone"
              type="tel"
              {...register('emergency_contact.phone')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="emergency_relationship" className="block text-sm font-medium text-gray-700">
              Relation
            </label>
            <input
              id="emergency_relationship"
              type="text"
              {...register('emergency_contact.relationship')}
              placeholder="Ex: Époux/se, Parent, Ami..."
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-3 pt-6 border-t">
        <button
          type="button"
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          Annuler
        </button>
        <button
          type="submit"
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          Enregistrer
        </button>
      </div>
    </form>
  );
};

export default PersonnelForm;