import React from 'react';
import { useForm } from 'react-hook-form';
import { Warehouse } from '../../types/warehouse';
import { useTranslation } from '../../context/TranslationContext';

interface WarehouseFormProps {
  onSubmit: (data: Partial<Warehouse>) => void;
  initialData?: Partial<Warehouse>;
}

const WarehouseForm: React.FC<WarehouseFormProps> = ({ onSubmit, initialData }) => {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Partial<Warehouse>>({
    defaultValues: initialData,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          {t('warehouses.form.name.label')}
        </label>
        <input
          id="name"
          type="text"
          {...register('name', { required: t('warehouses.form.validation.nameRequired') })}
          className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
            errors.name ? 'border-red-500' : ''
          }`}
          placeholder={t('warehouses.form.name.placeholder')}
        />
        {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
      </div>

      <div>
        <label htmlFor="address" className="block text-sm font-medium text-gray-700">
          {t('warehouses.form.address.label')}
        </label>
        <textarea
          id="address"
          {...register('address', { required: t('warehouses.form.validation.addressRequired') })}
          rows={3}
          className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
            errors.address ? 'border-red-500' : ''
          }`}
          placeholder={t('warehouses.form.address.placeholder')}
        />
        {errors.address && <p className="text-sm text-red-600">{errors.address.message}</p>}
      </div>

      <button
        type="submit"
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        {t('warehouses.form.submit')}
      </button>
    </form>
  );
};

export default WarehouseForm;
