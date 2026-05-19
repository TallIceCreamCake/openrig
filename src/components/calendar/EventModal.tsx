import React from 'react';
import { useForm } from 'react-hook-form';
import { X, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { CalendarEvent } from '../../types/calendar';
import { useTranslation } from '../../context/TranslationContext';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: Date;
  event?: CalendarEvent | null;
  onSubmit: (data: Partial<CalendarEvent>) => void;
  onDelete?: () => void;
}

const EventModal: React.FC<EventModalProps> = ({
  isOpen,
  onClose,
  date,
  event,
  onSubmit,
  onDelete,
}) => {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Partial<CalendarEvent>>({
    defaultValues: event || {
      start_date: format(date, "yyyy-MM-dd'T'HH:mm"),
      end_date: format(date, "yyyy-MM-dd'T'HH:mm"),
      type: 'task',
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {event ? t('calendar.modal.title.edit') : t('calendar.modal.title.new')}
              </h3>
              <button
                onClick={onClose}
                className="rounded-full p-1 hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('calendar.modal.fields.title')}</label>
                <input
                  type="text"
                  {...register('title', { required: t('calendar.modal.validation.titleRequired') })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
                {errors.title && (
                  <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{t('calendar.modal.fields.type')}</label>
                <select
                  {...register('type')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="task">{t('calendar.modal.type.task')}</option>
                  <option value="meeting">{t('calendar.modal.type.meeting')}</option>
                  <option value="reminder">{t('calendar.modal.type.reminder')}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('calendar.modal.fields.start')}</label>
                  <input
                    type="datetime-local"
                    {...register('start_date', { required: t('calendar.modal.validation.startRequired') })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('calendar.modal.fields.end')}</label>
                  <input
                    type="datetime-local"
                    {...register('end_date', { required: t('calendar.modal.validation.endRequired') })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{t('calendar.modal.fields.description')}</label>
                <textarea
                  {...register('description')}
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-between pt-4">
                {onDelete && (
                  <button
                    type="button"
                    onClick={onDelete}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('calendar.modal.actions.delete')}
                  </button>
                )}
                <button
                  type="submit"
                  className="inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  {event ? t('calendar.modal.actions.update') : t('calendar.modal.actions.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventModal;
