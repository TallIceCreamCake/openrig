import { Rental } from '../types/rental';
import type { CompanySettings } from '../hooks/useCompanySettings';
import { computeRentalCoefficient, normalizeRentalCoefficientMode } from './rentalCoefficient';

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const getRentalDays = (rental: Rental) => {
  try {
    const start = new Date(rental.start_date).getTime();
    const end = new Date(rental.end_date).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 1;
    const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff);
  } catch {
    return 1;
  }
};

export const computeEquipmentCoefficient = (rental: Rental, settings: CompanySettings | null) => {
  if (rental.type === 'sale') return 1;
  const days = getRentalDays(rental);
  const mode = normalizeRentalCoefficientMode(settings?.rental_coefficient_mode);
  const companyCoefficient = computeRentalCoefficient(mode, days, settings?.rental_coefficient_formula);
  const defaultCoefficient = companyCoefficient ?? days;
  const override = Number(rental.rental_coefficient_override);
  if (Number.isFinite(override) && override > 0) return override;
  return defaultCoefficient;
};

export const computeRentalTotals = (rental: Rental, settings: CompanySettings | null) => {
  const coefficient = computeEquipmentCoefficient(rental, settings);
  const equipmentSubtotal = (rental.items || []).reduce((sum, item) => {
    const base = (Number(item.price_per_day) || 0) * (Number(item.quantity) || 0) * coefficient;
    const discount = clampPercent(Number(item.discount_percent || 0));
    return sum + base * (1 - discount / 100);
  }, 0);
  const maintenanceTotal = (rental.maintenance_charges || []).reduce((sum, charge) => sum + (Number(charge.amount) || 0), 0);
  const deliveryTotal = Number(rental.delivery_total_amount || 0);
  const personnelTotal = (rental.personnel_services || []).reduce((sum, service) => {
    const unit = Number(service.cost_per_person || 0);
    const safeUnit = Number.isFinite(unit) ? unit : 0;
    const qty = Number(service.quantity || 0);
    const daysCount = Number(service.days || 0);
    const discount = clampPercent(Number(service.discount_percent || 0));
    return sum + safeUnit * qty * daysCount * (1 - discount / 100);
  }, 0);
  const insuranceTotal = (rental.insurance_services || []).reduce((sum, service) => {
    const unit = Number(service.amount_per_day || 0);
    const safeUnit = Number.isFinite(unit) ? unit : 0;
    const daysCount = Number(service.days || 0);
    return sum + safeUnit * daysCount;
  }, 0);
  const otherTotal = (rental.other_services || []).reduce((sum, service) => {
    const unit = Number(service.price || 0);
    const safeUnit = Number.isFinite(unit) ? unit : 0;
    const qty = Number(service.quantity || 0);
    const daysCount = Number(service.days || 0);
    return sum + safeUnit * qty * daysCount;
  }, 0);
  const subtotal = equipmentSubtotal + maintenanceTotal + deliveryTotal + personnelTotal + insuranceTotal + otherTotal;
  const discount = rental.discount_type === 'percentage'
    ? subtotal * (clampPercent(Number(rental.discount_value || 0)) / 100)
    : Number(rental.discount_value || 0);
  const total = Math.max(0, subtotal - (Number.isFinite(discount) ? discount : 0));
  return { coefficient, equipmentSubtotal, insuranceTotal, subtotal, total };
};
