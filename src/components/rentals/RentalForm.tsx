import React, { useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Calendar as CalendarIcon, Clock } from 'lucide-react';
import { Rental, RentalType, RentalItem } from '../../types/rental';
import { Equipment } from '../../types/equipment';
import RentalEquipmentList from './RentalEquipmentList';

interface RentalFormProps {
  onSubmit: (data: Partial<Rental>) => void;
  initialData?: Partial<Rental>;
  clients: Array<{ id: string; name: string }>;
}

const RentalForm: React.FC<RentalFormProps> = ({ onSubmit, initialData, clients }) => {
  const [items, setItems] = useState<RentalItem[]>(initialData?.items || []);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<Partial<Rental>>({
    defaultValues: initialData,
  });

  const type = watch('type');
  const total_price = watch('total_price') || 0;
  const discount_type = watch('discount_type');

  const minDateTime = useMemo(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  }, []);

  const handleFormSubmit = (data: Partial<Rental>) => {
    onSubmit({
      ...data,
      title: (data.title?.toString() || '').trim(),
      items: items.map(item => ({
        ...item,
        is_external: !!item.is_external,
        external_name: item.is_external ? (item.external_name || item.equipment_name) : null,
        external_type: item.is_external ? (item.external_type || item.equipment_type) : null,
        external_subtype: item.is_external ? item.external_subtype || null : null,
        external_description: item.is_external ? item.external_description || null : null,
        external_supplier: item.is_external ? item.external_supplier || null : null,
      })),
    });
  };

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    setItems(items.map(item =>
      item.id === itemId ? { ...item, quantity: newQuantity } : item
    ));
  };

  const handleRemoveItem = (itemId: string) => {
    setItems(items.filter(item => item.id !== itemId));
  };

  const handleAddItem = (equipment: Equipment, quantity: number) => {
    const newItem: RentalItem = {
      id: Date.now().toString(),
      equipment_id: equipment.id,
      equipment_name: equipment.name,
      equipment_type: equipment.type,
      quantity: quantity,
      price_per_day: equipment.rental_price_ttc,
      is_external: false,
    };
    setItems([...items, newItem]);
  };

  const handleAddExternalItem = (
    payload: { name: string; description?: string; type: string; subtype?: string; supplier?: string; price_per_day: number },
    quantity: number,
  ) => {
    const baseType = [payload.type, payload.subtype].filter(Boolean).join(' / ');
    const externalLabel = type === 'sale' ? 'Achat matériel' : 'Sous-location';
    const displayType = baseType ? `${baseType} (${externalLabel})` : externalLabel;
    const newItem: RentalItem = {
      id: `ext-${Date.now()}`,
      equipment_id: null,
      equipment_name: payload.name,
      equipment_type: displayType,
      quantity,
      price_per_day: payload.price_per_day,
      is_external: true,
      external_name: payload.name,
      external_type: payload.type,
      external_subtype: payload.subtype || null,
      external_supplier: payload.supplier || null,
      external_description: payload.description || null,
    };
    setItems(prev => [...prev, newItem]);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Basic Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Type</label>
          <select
            {...register('type', { required: 'Type is required' })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="rental">Rental</option>
            <option value="service">Service</option>
            <option value="sale">Sale</option>
          </select>
          {errors.type && <p className="text-sm text-red-600">{errors.type.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Client</label>
          <select
            {...register('client_id', { required: 'Client is required' })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Select a client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          {errors.client_id && <p className="text-sm text-red-600">{errors.client_id.message}</p>}
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Title</label>
          <input
            type="text"
            {...register('title', { required: 'Title is required', setValueAs: (value: string) => value?.trim() || '' })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Ex: Music video shoot – Studio"
          />
          {errors.title && <p className="text-sm text-red-600">{errors.title.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Start Date</label>
          <div className="mt-1 relative">
            <input
              type="datetime-local"
              min={minDateTime}
              {...register('start_date', { required: 'Start date is required' })}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            <CalendarIcon className="absolute right-3 top-2 h-5 w-5 text-gray-400" />
          </div>
          {errors.start_date && <p className="text-sm text-red-600">{errors.start_date.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">End Date</label>
          <div className="mt-1 relative">
            <input
              type="datetime-local"
              min={minDateTime}
              {...register('end_date', { required: 'End date is required' })}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            <CalendarIcon className="absolute right-3 top-2 h-5 w-5 text-gray-400" />
          </div>
          {errors.end_date && <p className="text-sm text-red-600">{errors.end_date.message}</p>}
        </div>
      </div>

      {/* Equipment List */}
      <div className="border-t border-gray-200 pt-6">
        <RentalEquipmentList
          items={items}
          onQuantityChange={handleQuantityChange}
          onRemoveItem={handleRemoveItem}
          onAddItem={handleAddItem}
          onAddExternalItem={handleAddExternalItem}
          externalTabLabel={type === 'sale' ? 'Achat matériel' : undefined}
          skipAvailability={type === 'sale'}
        />
      </div>

      {/* Location and Description */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Location</label>
          <input
            type="text"
            {...register('location')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            {...register('description')}
            rows={3}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Pricing and Discounts */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Total Price</label>
          <input
            type="number"
            step="0.01"
            {...register('total_price', { min: 0 })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Discount Type</label>
            <select
              {...register('discount_type')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">No discount</option>
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed Amount</option>
            </select>
          </div>

          {discount_type && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Discount Value {discount_type === 'percentage' ? '(%)' : '(€)'}
              </label>
              <input
                type="number"
                step={discount_type === 'percentage' ? '1' : '0.01'}
                min="0"
                max={discount_type === 'percentage' ? '100' : total_price}
                {...register('discount_value')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Additional Options */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Color</label>
          <input
            type="color"
            {...register('color')}
            className="mt-1 block w-full h-10 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            {...register('generate_invoice')}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label className="ml-2 block text-sm text-gray-700">
            Generate Invoice Automatically
          </label>
        </div>
      </div>

      <button
        type="submit"
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        Save {type === 'rental' ? 'Rental' : 'Service'}
      </button>
    </form>
  );
};

export default RentalForm;
