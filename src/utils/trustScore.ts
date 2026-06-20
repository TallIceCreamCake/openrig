import { supabase } from '../lib/supabase';

export type TrustScoreFactor = {
  score: number;
  max: number;
  label: string;
  detail: string;
};

export type TrustScoreBreakdown = {
  payment: TrustScoreFactor & { onTime: number; late: number; overdue: number; total: number };
  returnCompleteness: TrustScoreFactor & { missing: number; totalItems: number };
  returnPunctuality: TrustScoreFactor & { late: number; total: number };
  maintenance: TrustScoreFactor & { withCharges: number; totalRentals: number };
};

export type TrustScoreResult = {
  score: number;
  breakdown: TrustScoreBreakdown;
  isNewClient: boolean;
  computedAt: string;
};

export async function computeTrustScore(
  clientId: string,
  linkedMemberIds: string[] = []
): Promise<TrustScoreResult> {
  const allIds = [clientId, ...linkedMemberIds];

  // Step 1: All rental-type rentals for this client group
  const { data: rentalsData } = await supabase
    .from('rentals')
    .select('id, end_date, returned_at, status')
    .in('client_id', allIds)
    .eq('type', 'rental');

  const rentals = (rentalsData || []) as Array<{
    id: string;
    end_date: string;
    returned_at: string | null;
    status: string;
  }>;
  const rentalIds = rentals.map((r) => r.id);

  // Step 2: Parallel fetch — invoices, rental returns, maintenance charges
  const [invoicesRes, returnsRes, maintenanceRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('status, due_date, paid_date')
      .in('client_id', allIds)
      .in('document_type', ['invoice', 'deposit_invoice'])
      .not('status', 'in', '(draft,cancelled)'),

    rentalIds.length > 0
      ? supabase.from('rental_returns').select('id').in('rental_id', rentalIds)
      : Promise.resolve({ data: [] as any[] }),

    rentalIds.length > 0
      ? supabase.from('rental_maintenance_charges').select('rental_id').in('rental_id', rentalIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const returnIds = ((returnsRes as any).data || []).map((r: any) => r.id) as string[];

  // Step 3: Return items (depends on return IDs from step 2)
  const returnItemsRes = returnIds.length > 0
    ? await supabase
        .from('rental_return_items')
        .select('expected_quantity, returned_quantity')
        .in('return_id', returnIds)
    : { data: [] as any[] };

  // ── Factor 1: Ponctualité de paiement (35 pts) ──────────────────────────
  const invoices = ((invoicesRes as any).data || []) as Array<{
    status: string;
    due_date: string | null;
    paid_date: string | null;
  }>;

  const onTime = invoices.filter(
    (i) => i.status === 'paid' && i.due_date && i.paid_date && new Date(i.paid_date) <= new Date(i.due_date)
  ).length;
  const latePaid = invoices.filter(
    (i) => i.status === 'paid' && i.due_date && i.paid_date && new Date(i.paid_date) > new Date(i.due_date)
  ).length;
  const overdue = invoices.filter((i) => i.status === 'overdue').length;
  const totalInvoices = onTime + latePaid + overdue;

  let paymentScore = 35;
  if (totalInvoices > 0) {
    paymentScore = Math.round(35 * (onTime + latePaid * 0.4) / totalInvoices);
    // Pénalité supplémentaire pour chaque facture impayée
    paymentScore = Math.max(0, paymentScore - Math.min(12, overdue * 4));
  }

  // ── Factor 2: Complétude des retours matériel (25 pts) ──────────────────
  const returnItems = ((returnItemsRes as any).data || []) as Array<{
    expected_quantity: number;
    returned_quantity: number;
  }>;
  const missingItems = returnItems.filter(
    (item) => (item.returned_quantity ?? 0) < (item.expected_quantity ?? 0)
  ).length;
  const totalReturnItems = returnItems.length;

  let completenessScore = 25;
  if (totalReturnItems > 0) {
    completenessScore = Math.round(25 * (1 - missingItems / totalReturnItems));
  }

  // ── Factor 3: Ponctualité de retour (20 pts) ────────────────────────────
  const rentalsWithReturn = rentals.filter((r) => r.returned_at);
  const lateReturns = rentalsWithReturn.filter((r) => {
    const returnedAt = new Date(r.returned_at!);
    const endDate = new Date(r.end_date);
    endDate.setDate(endDate.getDate() + 1); // 1 jour de grâce
    return returnedAt > endDate;
  }).length;

  let punctualityScore = 20;
  if (rentalsWithReturn.length > 0) {
    punctualityScore = Math.round(20 * (1 - lateReturns / rentalsWithReturn.length));
  }

  // ── Factor 4: SAV & charges de maintenance (20 pts) ─────────────────────
  const maintenanceRows = ((maintenanceRes as any).data || []) as Array<{ rental_id: string }>;
  const rentalsWithMaintenance = new Set(maintenanceRows.map((m) => m.rental_id)).size;
  const completedRentals = rentals.filter((r) =>
    ['completed', 'paid', 'returned', 'archived'].includes(r.status)
  ).length;

  let maintenanceScore = 20;
  if (completedRentals > 0) {
    maintenanceScore = Math.max(0, Math.round(20 * (1 - rentalsWithMaintenance / completedRentals)));
  }

  // ── Score final ──────────────────────────────────────────────────────────
  const totalScore = Math.min(100, Math.max(0,
    paymentScore + completenessScore + punctualityScore + maintenanceScore
  ));

  const isNewClient =
    totalInvoices === 0 &&
    totalReturnItems === 0 &&
    rentalsWithReturn.length === 0 &&
    completedRentals === 0;

  return {
    score: totalScore,
    isNewClient,
    computedAt: new Date().toISOString(),
    breakdown: {
      payment: {
        score: paymentScore,
        max: 35,
        label: 'Ponctualité de paiement',
        detail: totalInvoices > 0
          ? `${onTime} à temps · ${latePaid} en retard · ${overdue} impayé(s)`
          : 'Aucune facture trouvée',
        onTime,
        late: latePaid,
        overdue,
        total: totalInvoices,
      },
      returnCompleteness: {
        score: completenessScore,
        max: 25,
        label: 'Retour du matériel',
        detail: totalReturnItems > 0
          ? `${missingItems} article(s) manquant(s) sur ${totalReturnItems}`
          : 'Aucun retour enregistré',
        missing: missingItems,
        totalItems: totalReturnItems,
      },
      returnPunctuality: {
        score: punctualityScore,
        max: 20,
        label: 'Ponctualité de retour',
        detail: rentalsWithReturn.length > 0
          ? `${lateReturns} retour(s) en retard sur ${rentalsWithReturn.length}`
          : 'Aucun retour enregistré',
        late: lateReturns,
        total: rentalsWithReturn.length,
      },
      maintenance: {
        score: maintenanceScore,
        max: 20,
        label: 'SAV & incidents (location)',
        detail: completedRentals > 0
          ? `${rentalsWithMaintenance} location(s) avec charges SAV sur ${completedRentals} terminée(s)`
          : 'Aucune location terminée',
        withCharges: rentalsWithMaintenance,
        totalRentals: completedRentals,
      },
    },
  };
}
