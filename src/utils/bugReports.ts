import { supabase } from '../lib/supabase';
import { Database, Json } from '../lib/database.types';

export type BugReportStatus = 'open' | 'reviewed' | 'resolved';

type BugReportRow = Database['public']['Tables']['bug_reports']['Row'];
type BugReportAttachmentRow = Database['public']['Tables']['bug_report_attachments']['Row'];

export type BugReportAttachment = {
  id: string;
  bug_report_id: string;
  storage_path: string;
  file_url: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
};

export type BugReport = {
  id: string;
  title: string;
  description: string;
  page_path: string;
  page_url: string;
  page_title: string;
  created_by: string | null;
  created_by_name: string;
  created_by_email: string | null;
  status: BugReportStatus;
  context: Json;
  created_at: string;
  updated_at: string;
  attachments: BugReportAttachment[];
};

type ReporterIdentity = {
  id?: string | null;
  full_name?: string | null;
  email?: string | null;
};

type SubmitBugReportInput = {
  title: string;
  description: string;
  files?: File[];
  pagePath: string;
  pageUrl: string;
  pageTitle?: string;
  reporter?: ReporterIdentity | null;
};

const BUG_REPORT_BUCKET = 'bug-report-images';

const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `bug-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const sanitizeExtension = (file: File) => {
  const byName = file.name.split('.').pop()?.trim().toLowerCase() || '';
  if (byName) {
    return byName.replace(/[^a-z0-9]+/g, '');
  }
  const byType = file.type.split('/').pop()?.trim().toLowerCase() || '';
  return byType.replace(/[^a-z0-9]+/g, '') || 'bin';
};

const buildClientContext = (): Json => ({
  user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  language: typeof navigator !== 'undefined' ? navigator.language : null,
  viewport:
    typeof window !== 'undefined'
      ? { width: window.innerWidth, height: window.innerHeight }
      : null,
  screen:
    typeof window !== 'undefined'
      ? { width: window.screen?.width ?? null, height: window.screen?.height ?? null }
      : null,
  app_build: import.meta.env.VITE_APP_BUILD ?? null,
  client_reported_at: new Date().toISOString(),
});

const mapAttachment = (row: BugReportAttachmentRow): BugReportAttachment => ({
  id: row.id,
  bug_report_id: row.bug_report_id,
  storage_path: row.storage_path,
  file_url: row.file_url,
  file_name: row.file_name,
  file_type: row.file_type,
  file_size: row.file_size,
  created_at: row.created_at,
});

const mapReport = (
  row: BugReportRow,
  attachmentsByReportId: Map<string, BugReportAttachment[]>,
): BugReport => ({
  id: row.id,
  title: row.title,
  description: row.description,
  page_path: row.page_path,
  page_url: row.page_url,
  page_title: row.page_title,
  created_by: row.created_by,
  created_by_name: row.created_by_name,
  created_by_email: row.created_by_email,
  status: row.status as BugReportStatus,
  context: row.context,
  created_at: row.created_at,
  updated_at: row.updated_at,
  attachments: attachmentsByReportId.get(row.id) || [],
});

export const submitBugReport = async ({
  title,
  description,
  files = [],
  pagePath,
  pageUrl,
  pageTitle = '',
  reporter,
}: SubmitBugReportInput): Promise<{ report: BugReport; failedUploads: number }> => {
  const { data: reportRow, error: reportError } = await supabase
    .from('bug_reports')
    .insert([{
      title: title.trim(),
      description: description.trim(),
      page_path: pagePath,
      page_url: pageUrl,
      page_title: pageTitle,
      created_by: reporter?.id || null,
      created_by_name: reporter?.full_name?.trim() || 'Utilisateur inconnu',
      created_by_email: reporter?.email?.trim() || null,
      status: 'open',
      context: buildClientContext(),
    }])
    .select('id, title, description, page_path, page_url, page_title, created_by, created_by_name, created_by_email, status, context, created_at, updated_at')
    .single();

  if (reportError) {
    throw reportError;
  }

  const bucket = supabase.storage.from(BUG_REPORT_BUCKET);
  const uploadedAttachments: BugReportAttachment[] = [];
  let failedUploads = 0;

  for (const file of files) {
    try {
      const extension = sanitizeExtension(file);
      const storagePath = `${reportRow.id}/${generateId()}.${extension}`;
      const { error: uploadError } = await bucket.upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
      if (uploadError) {
        throw uploadError;
      }

      const { data: publicData } = bucket.getPublicUrl(storagePath);
      const { data: attachmentRow, error: attachmentError } = await supabase
        .from('bug_report_attachments')
        .insert([{
          bug_report_id: reportRow.id,
          storage_path: storagePath,
          file_url: publicData?.publicUrl || '',
          file_name: file.name || 'capture',
          file_type: file.type || null,
          file_size: typeof file.size === 'number' ? file.size : null,
        }])
        .select('id, bug_report_id, storage_path, file_url, file_name, file_type, file_size, created_at')
        .single();

      if (attachmentError) {
        throw attachmentError;
      }

      uploadedAttachments.push(mapAttachment(attachmentRow));
    } catch (error) {
      failedUploads += 1;
      console.error('bug report attachment upload failed', error);
    }
  }

  return {
    report: mapReport(reportRow, new Map([[reportRow.id, uploadedAttachments]])),
    failedUploads,
  };
};

export const listBugReports = async (): Promise<BugReport[]> => {
  const [
    { data: reportsData, error: reportsError },
    { data: attachmentsData, error: attachmentsError },
  ] = await Promise.all([
    supabase
      .from('bug_reports')
      .select('id, title, description, page_path, page_url, page_title, created_by, created_by_name, created_by_email, status, context, created_at, updated_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('bug_report_attachments')
      .select('id, bug_report_id, storage_path, file_url, file_name, file_type, file_size, created_at')
      .order('created_at', { ascending: true }),
  ]);

  if (reportsError) {
    throw reportsError;
  }
  if (attachmentsError) {
    throw attachmentsError;
  }

  const attachmentsByReportId = new Map<string, BugReportAttachment[]>();
  (attachmentsData || []).forEach((row) => {
    const attachment = mapAttachment(row as BugReportAttachmentRow);
    const current = attachmentsByReportId.get(attachment.bug_report_id) || [];
    attachmentsByReportId.set(attachment.bug_report_id, [...current, attachment]);
  });

  return (reportsData || []).map((row) => mapReport(row as BugReportRow, attachmentsByReportId));
};

export const updateBugReportStatus = async (
  reportId: string,
  status: BugReportStatus,
): Promise<void> => {
  const { error } = await supabase
    .from('bug_reports')
    .update({ status })
    .eq('id', reportId);

  if (error) {
    throw error;
  }
};
