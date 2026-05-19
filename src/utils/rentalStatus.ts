export type RentalStatusTone = 'green' | 'blue' | 'orange' | 'red' | 'slate';

export const getRentalStatusTone = (status: string): RentalStatusTone => {
  switch (status) {
    case 'pending':
    case 'preparing':
      return 'orange';
    case 'confirmed':
    case 'in_progress':
    case 'delivered':
    case 'return_delivery':
    case 'in_return':
      return 'blue';
    case 'returned':
    case 'completed':
    case 'paid':
      return 'green';
    case 'cancelled':
      return 'red';
    case 'archived':
      return 'slate';
    default:
      return 'orange';
  }
};

export const getRentalStatusLabel = (status: string, meta?: { cancelledAt?: string | null }) => {
  switch (status) {
    case 'pending':
      return 'En attente';
    case 'confirmed':
      return 'Validé';
    case 'preparing':
      return 'En préparation';
    case 'in_progress':
      return 'En cours';
    case 'delivered':
      return 'Livrée / Récupérée';
    case 'return_delivery':
      return 'Livraison retour';
    case 'in_return':
      return 'En retour';
    case 'returned':
      return 'Terminée';
    case 'completed':
      return 'Terminé';
    case 'paid':
      return 'Payée';
    case 'cancelled':
      return meta?.cancelledAt ? 'Annulée' : 'Rejetée';
    case 'archived':
      return 'Archivé';
    default:
      return status;
  }
};
