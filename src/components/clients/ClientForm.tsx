import React from 'react';
import { useForm } from 'react-hook-form';
import { Client, ClientType } from '../../types/client';

type ClientFormValues = Partial<Client> & {
  company_client_id?: string;
};

interface ClientFormProps {
  onSubmit: (data: Partial<Client>) => void;
  initialData?: Partial<Client>;
  clientType?: ClientType;
  companyOptions?: Client[];
}

const ClientForm: React.FC<ClientFormProps> = ({ onSubmit, initialData, clientType = 'person', companyOptions = [] }) => {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ClientFormValues>({
    defaultValues: {
      ...initialData,
      client_type: initialData?.client_type ?? clientType,
      company_client_id: initialData?.company_client_id ?? '',
    },
  });

  const selectedCompanyId = watch('company_client_id');
  const isCompany = clientType === 'company';

  const submit = (data: ClientFormValues) => {
    onSubmit({
      ...data,
      client_type: clientType,
      company_client_id: isCompany ? null : (data.company_client_id || null),
      company: isCompany ? null : (data.company_client_id ? null : (data.company?.trim() || null)),
    });
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-6">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          {isCompany ? "Nom de l'entreprise *" : 'Nom *'}
        </label>
        <input
          id="name"
          type="text"
          {...register('name', { required: 'Name is required' })}
          className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
            errors.name ? 'border-red-500' : ''
          }`}
        />
        {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
      </div>

      {!isCompany && (
        <>
          <div>
            <label htmlFor="company_client_id" className="block text-sm font-medium text-gray-700">
              Entreprise liée
            </label>
            <select
              id="company_client_id"
              {...register('company_client_id')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Aucune</option>
              {companyOptions.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          {!selectedCompanyId && (
            <div>
              <label htmlFor="company" className="block text-sm font-medium text-gray-700">
                Société
              </label>
              <input
                id="company"
                type="text"
                {...register('company')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          )}
        </>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          {isCompany ? "Email de l'entreprise" : 'Email'}
        </label>
        <input
          id="email"
          type="email"
          {...register('email', {
            pattern: {
              value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
              message: 'Invalid email address',
            },
          })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
        {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
          {isCompany ? "Téléphone de l'entreprise" : 'Téléphone'}
        </label>
        <input
          id="phone"
          type="tel"
          {...register('phone')}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
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

      <div>
        <label htmlFor="image_url" className="block text-sm font-medium text-gray-700">
          URL de l'image
        </label>
        <input
          id="image_url"
          type="url"
          {...register('image_url')}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>

      <button
        type="submit"
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        {isCompany ? "Enregistrer l'entreprise" : 'Enregistrer le client'}
      </button>
    </form>
  );
};

export default ClientForm;
