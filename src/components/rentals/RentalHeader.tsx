import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Edit, Check, X as XIcon, CreditCard, FolderOpen } from 'lucide-react';
import { Rental } from '../../types/rental';
import { Button, StatusBadge } from '../ui-kit';
import { getRentalStatusLabel, getRentalStatusTone } from '../../utils/rentalStatus';

interface RentalHeaderProps {
  rental: Rental;
  onEdit: () => void;
  isEditing?: boolean;
  showDecisionButtons?: boolean;
  onAcceptPending?: () => void;
  onRejectPending?: () => void;
  showMarkPaidButton?: boolean;
  onMarkPaid?: () => void;
  markPaidDisabled?: boolean;
  showActions?: boolean;
  onOpenFileExplorer?: () => void;
}

const RentalHeader: React.FC<RentalHeaderProps> = ({
  rental,
  onEdit,
  isEditing,
  showDecisionButtons,
  onAcceptPending,
  onRejectPending,
  showMarkPaidButton,
  onMarkPaid,
  markPaidDisabled,
  showActions = true,
  onOpenFileExplorer,
}) => {
  const typeLabel = rental.type === 'service' ? 'Prestation' : rental.type === 'sale' ? 'Vente' : 'Location';
  const titlePrefix = rental.reference_code ? `${rental.reference_code} · ${typeLabel}` : typeLabel;
  const hasTitle = !!(rental.title && rental.title.trim().length > 0);
  const heading = hasTitle ? rental.title : `${titlePrefix} – ${rental.client_name}`;
  return (
    <div className="flex justify-between items-center">
      <div className="flex items-center space-x-4">
        <Link
          to="/rentals"
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div className="flex items-center space-x-3">
          {(() => {
            const dotColor = rental.type === 'service'
              ? (rental.color || '#1D4ED8')
              : (rental.color || '#9CA3AF');
            return (
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: dotColor }}
                title={rental.type === 'service' ? (rental.color || 'Prestation') : typeLabel}
              />
            );
          })()}
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {heading}
            </h1>
            {hasTitle && (
              <p className="text-sm text-gray-500">
                {titlePrefix} – {rental.client_name}
              </p>
            )}
          </div>
        </div>
        <StatusBadge tone={getRentalStatusTone(rental.status)}>
          {getRentalStatusLabel(rental.status)}
        </StatusBadge>
      </div>
      {showActions && (
        <div className="flex items-center space-x-2">
          {onOpenFileExplorer && (
            <Button
              type="button"
              onClick={onOpenFileExplorer}
              variant="secondary"
              title="Explorateur de fichiers"
            >
              <FolderOpen className="h-4 w-4" />
              Fichiers
            </Button>
          )}
          {showDecisionButtons && (
            <>
              <Button
                onClick={onRejectPending}
                variant="secondary"
                className="bg-red-100 text-red-700 hover:bg-red-200"
                title="Rejeter le projet"
              >
                <XIcon className="h-4 w-4 mr-1" /> Rejeté
              </Button>
              <Button
                onClick={onAcceptPending}
                className="bg-green-600 text-white hover:bg-green-700"
                title="Valider le projet"
              >
                <Check className="h-4 w-4 mr-1" /> Validé
              </Button>
            </>
          )}
          {showMarkPaidButton && (
            <Button
              type="button"
              onClick={onMarkPaid}
              disabled={markPaidDisabled}
              className="bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 disabled:hover:bg-green-600"
              title="Marquer comme payée"
            >
              <CreditCard className="h-4 w-4 mr-1" /> Option de paiement
            </Button>
          )}
          <Button
            onClick={onEdit}
            className={isEditing ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-blue-600 text-white hover:bg-blue-700'}
            title={isEditing ? "Terminer l'édition" : 'Modifier'}
          >
            {isEditing ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Terminer
              </>
            ) : (
              <>
                <Edit className="h-4 w-4 mr-2" />
                Modifier
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default RentalHeader;
