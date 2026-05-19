import React, { useEffect, useState } from 'react';
import { Bug, ExternalLink, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { StatusBadge, type BadgeTone } from '../ui-kit';
import {
  BugReport,
  BugReportStatus,
  listBugReports,
  updateBugReportStatus,
} from '../../utils/bugReports';

const statusLabels: Record<BugReportStatus, string> = {
  open: 'Ouvert',
  reviewed: 'Lu',
  resolved: 'Résolu',
};

const statusTones: Record<BugReportStatus, BadgeTone> = {
  open: 'rose',
  reviewed: 'amber',
  resolved: 'emerald',
};

type BugReportsPanelProps = {
  canEdit: boolean;
  isActive: boolean;
};

const BugReportsPanel: React.FC<BugReportsPanelProps> = ({ canEdit, isActive }) => {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive) return;

    let ignore = false;
    const loadReports = async () => {
      try {
        setLoading(true);
        const data = await listBugReports();
        if (!ignore) {
          setReports(data);
        }
      } catch (error) {
        console.error('load bug reports', error);
        if (!ignore) {
          toast.error('Impossible de charger les reports de bugs.');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    void loadReports();
    return () => {
      ignore = true;
    };
  }, [isActive]);

  const handleStatusChange = async (reportId: string, status: BugReportStatus) => {
    if (!canEdit || statusSavingId) return;
    try {
      setStatusSavingId(reportId);
      await updateBugReportStatus(reportId, status);
      setReports((prev) => prev.map((report) => (
        report.id === reportId
          ? { ...report, status }
          : report
      )));
      toast.success('Statut du report mis à jour.');
    } catch (error) {
      console.error('update bug report status', error);
      toast.error('Impossible de modifier le statut du report.');
    } finally {
      setStatusSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-rose-50 p-2 text-rose-600">
          <Bug className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Reports de bugs</h3>
          <p className="text-sm text-gray-500">
            Vue partagée de tous les reports remontés par les utilisateurs pendant la bêta.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-sm text-gray-500">
          <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
          Chargement des reports…
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-sm text-gray-500">
          Aucun report enregistré pour le moment.
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const context = report.context && typeof report.context === 'object' && !Array.isArray(report.context)
              ? report.context as Record<string, unknown>
              : {};
            const viewport = context.viewport && typeof context.viewport === 'object' && !Array.isArray(context.viewport)
              ? context.viewport as Record<string, unknown>
              : null;

            return (
              <div key={report.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-semibold text-gray-900">{report.title}</h4>
                      <StatusBadge tone={statusTones[report.status]} variant="outline">
                        {statusLabels[report.status]}
                      </StatusBadge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                      <span>{new Date(report.created_at).toLocaleString('fr-FR')}</span>
                      <span>{report.created_by_name || report.created_by_email || 'Utilisateur inconnu'}</span>
                      <span>{report.page_title || report.page_path}</span>
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-2">
                      {(['open', 'reviewed', 'resolved'] as BugReportStatus[]).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => void handleStatusChange(report.id, status)}
                          disabled={statusSavingId === report.id || report.status === status}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                            report.status === status
                              ? 'bg-gray-900 text-white'
                              : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                          } disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          {statusSavingId === report.id && report.status !== status ? '...' : statusLabels[status]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {report.description && (
                  <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700">{report.description}</p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <StatusBadge tone="gray">
                    Page: {report.page_path}
                  </StatusBadge>
                  {viewport && (
                    <StatusBadge tone="gray">
                      Viewport: {String(viewport.width ?? '?')} x {String(viewport.height ?? '?')}
                    </StatusBadge>
                  )}
                  {report.page_url && (
                    <a
                      href={report.page_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700 transition hover:bg-blue-100"
                    >
                      Ouvrir la page
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>

                {report.attachments.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {report.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={attachment.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 transition hover:border-blue-300 hover:shadow-sm"
                      >
                        <div className="aspect-[4/3] bg-gray-100">
                          <img
                            src={attachment.file_url}
                            alt={attachment.file_name || 'Capture de bug'}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="px-3 py-2">
                          <p className="truncate text-xs font-medium text-gray-700">
                            {attachment.file_name || 'Capture'}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BugReportsPanel;
