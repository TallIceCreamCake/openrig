import React, { useCallback, useState } from 'react';
import {
  AlertCircle,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  History,
  PackageSearch,
  RotateCcw,
  ScanLine,
  UserCircle2,
} from 'lucide-react';
import DepotScanModal from '../../components/depot/DepotScanModal';
import { type DepotScanResult, resolveDepotScannedCode } from '../../utils/depotScanResolver';

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
};

const formatDateOnly = (value: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('fr-FR', { dateStyle: 'medium' });
};

const eventTypeLabel = (value: string) => {
  if (value === 'prepared') return 'Préparé';
  if (value === 'returned') return 'Retourné';
  return value;
};

const DepotHome: React.FC = () => {
  const [scanOpen, setScanOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<DepotScanResult | null>(null);

  const openScanner = () => {
    setScanError(null);
    setScanOpen(true);
  };

  const handleDetected = useCallback(async (code: string) => {
    setScanning(true);
    setScanError(null);
    try {
      const resolved = await resolveDepotScannedCode(code);
      setScanResult(resolved);
      setScanOpen(false);
    } catch (error) {
      console.error('depot scan resolve', error);
      setScanError('Impossible de récupérer les informations de ce scan.');
    } finally {
      setScanning(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openScanner}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          <ScanLine className="h-4 w-4" />
          Scanner
        </button>
      </div>

      {scanError && (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {scanError}
        </section>
      )}

      {!scanResult && !scanError && (
        <section className="min-h-[calc(100vh-220px)] rounded-2xl bg-white" />
      )}

      {scanResult?.kind === 'unknown' && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <h2 className="text-base font-semibold text-amber-900">Code inconnu</h2>
              <p className="mt-1 text-sm text-amber-800">Aucune donnée trouvée pour ce code.</p>
              <p className="mt-2 font-mono text-xs text-amber-700">{scanResult.code}</p>
            </div>
          </div>
        </section>
      )}

      {scanResult?.kind === 'equipment_unit' && (
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Matériel unitaire</p>
              <h2 className="text-xl font-semibold text-gray-900">
                {scanResult.equipment?.name || 'Matériel'}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                N° de suivi: {scanResult.unit.serial_number || '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={openScanner}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <RotateCcw className="h-4 w-4" />
              Nouveau scan
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Statut unité</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{scanResult.unit.status || '—'}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Entrepôt</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{scanResult.unit.warehouse_name || '—'}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Code scanné</p>
              <p className="mt-1 truncate font-mono text-xs text-gray-900">{scanResult.code}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 p-3">
            <div className="mb-2 flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-gray-500" />
              <p className="text-sm font-semibold text-gray-900">Dernières prestations</p>
            </div>
            {scanResult.latestRentals.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun projet lié.</p>
            ) : (
              <div className="space-y-2">
                {scanResult.latestRentals.map((rental) => (
                  <div key={rental.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-sm font-medium text-gray-900">
                      {rental.reference_code || rental.title || rental.id}
                    </p>
                    <p className="text-xs text-gray-600">
                      {rental.client_name || 'Client —'} • {formatDateOnly(rental.start_date)} → {formatDateOnly(rental.end_date)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 p-3">
            <div className="mb-2 flex items-center gap-2">
              <History className="h-4 w-4 text-gray-500" />
              <p className="text-sm font-semibold text-gray-900">Historique des scans</p>
            </div>
            {scanResult.history.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun historique trouvé.</p>
            ) : (
              <div className="space-y-2">
                {scanResult.history.map((event) => (
                  <div key={event.source_id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-sm font-medium text-gray-900">
                      {eventTypeLabel(event.event_type)} • {event.reference_code || event.rental_title || 'Prestation'}
                    </p>
                    <p className="text-xs text-gray-600">
                      {event.client_name || 'Client —'} • {formatDate(event.event_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {scanResult?.kind === 'equipment' && (
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Matériel</p>
              <h2 className="text-xl font-semibold text-gray-900">{scanResult.equipment.name || 'Matériel'}</h2>
              <p className="mt-1 text-sm text-gray-600">
                {scanResult.equipment.type || 'Type —'} {scanResult.equipment.subtype ? `• ${scanResult.equipment.subtype}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={openScanner}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <RotateCcw className="h-4 w-4" />
              Nouveau scan
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Statut</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{scanResult.equipment.status || '—'}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Code scanné</p>
              <p className="mt-1 truncate font-mono text-xs text-gray-900">{scanResult.code}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 p-3">
            <div className="mb-2 flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-gray-500" />
              <p className="text-sm font-semibold text-gray-900">Dernières prestations</p>
            </div>
            {scanResult.latestRentals.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun projet lié.</p>
            ) : (
              <div className="space-y-2">
                {scanResult.latestRentals.map((rental) => (
                  <div key={rental.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-sm font-medium text-gray-900">
                      {rental.reference_code || rental.title || rental.id}
                    </p>
                    <p className="text-xs text-gray-600">
                      {rental.client_name || 'Client —'} • {formatDateOnly(rental.start_date)} → {formatDateOnly(rental.end_date)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {scanResult?.kind === 'rental' && (
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Prestation</p>
              <h2 className="text-xl font-semibold text-gray-900">
                {scanResult.rental.reference_code || scanResult.rental.title || 'Prestation'}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                {formatDateOnly(scanResult.rental.start_date)} → {formatDateOnly(scanResult.rental.end_date)}
              </p>
            </div>
            <button
              type="button"
              onClick={openScanner}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <RotateCcw className="h-4 w-4" />
              Nouveau scan
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <UserCircle2 className="h-3.5 w-3.5" />
                Client
              </div>
              <p className="mt-1 text-sm font-medium text-gray-900">{scanResult.rental.client_name || '—'}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Statut
              </div>
              <p className="mt-1 text-sm font-medium text-gray-900">{scanResult.rental.status || '—'}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <PackageSearch className="h-3.5 w-3.5" />
                Code scanné
              </div>
              <p className="mt-1 truncate font-mono text-xs text-gray-900">{scanResult.code}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 p-3">
            <div className="mb-2 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-gray-500" />
              <p className="text-sm font-semibold text-gray-900">Matériels de la prestation</p>
            </div>
            {scanResult.items.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun matériel trouvé.</p>
            ) : (
              <div className="space-y-2">
                {scanResult.items.map((item) => (
                  <div key={item.key} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-sm font-medium text-gray-900">
                      {item.label} • x{item.quantity}
                    </p>
                    <p className="text-xs text-gray-600">{item.typeLabel}</p>
                    {item.serials.length > 0 && (
                      <p className="mt-1 text-xs text-gray-700">
                        N° de suivi: {item.serials.map((serial) => serial.serial_number || serial.id).join(', ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <DepotScanModal
        isOpen={scanOpen}
        busy={scanning}
        onClose={() => {
          if (scanning) return;
          setScanOpen(false);
        }}
        onDetected={handleDetected}
      />
    </div>
  );
};

export default DepotHome;
