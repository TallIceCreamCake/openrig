/* Simple Node server to store PDFs locally
 * Requires: npm i express body-parser cors nodemailer
 */
import express from 'express';
import bodyParser from 'body-parser';
import pg from 'pg';
const { Client: PgClient } = pg;
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import JSZip from 'jszip';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { renderPdfFromHtml } from './pdf/pdfRenderer.js';
import { buildRentalDocumentHtml } from './pdf/rentalDocumentHtml.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadEnv = () => {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf-8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) return;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\u2018') && value.endsWith('\u2019'))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
};

loadEnv();

const DATA_DIR = path.join(__dirname, 'data');
const DATABASE_INFO_FILE = path.join(DATA_DIR, 'database-info.json');
const MAIL_CONFIG_FILE = path.join(DATA_DIR, 'mail-config.json');
const COMPANY_LOGO_BUCKET = 'company-assets';
const EQUIPMENT_IMAGE_BUCKET = 'equipment-images';

const DEFAULT_DATABASE_INFO = {
  host: '127.0.0.1',
  port: '5432',
  database: 'openrig',
  user: 'postgres',
  password: '',
};

const DEFAULT_MAIL_CONFIG = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  user: '',
  pass: '',
};

const RESET_MAIL_SUBJECT = process.env.OPENRIG_RESET_SUBJECT || 'Open RIG - Code de réinitialisation';
const TWO_FACTOR_MAIL_SUBJECT = process.env.OPENRIG_TWO_FACTOR_SUBJECT || 'Open RIG - Code de connexion';
const RESET_MAIL_SENDER = process.env.OPENRIG_RESET_FROM || 'no-reply@openrig.test';
const ONBOARDING_MAIL_SUBJECT = process.env.OPENRIG_ONBOARDING_SUBJECT || 'Open RIG - Accès initial';
const LOGIN_URL = process.env.OPENRIG_LOGIN_URL || process.env.VITE_APP_URL || 'https://localhost:5173';
const APP_BASE_URL = process.env.OPENRIG_APP_URL || process.env.VITE_APP_URL || LOGIN_URL;
const TOTP_ISSUER = process.env.OPENRIG_TOTP_ISSUER || 'Open RIG';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SHARE_ACCESS_MODES = new Set(['viewer', 'editor']);
const escapeIcsText = (value = '') => String(value || '')
  .replace(/\\/g, '\\\\')
  .replace(/\r?\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

const toIcsDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
};

const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

const SUPABASE_CREDENTIALS_FILE = path.join(DATA_DIR, 'supabase-credentials.json');

const sanitizeSupabaseCredentials = (payload = {}) => ({
  supabaseUrl: typeof payload.supabaseUrl === 'string' ? payload.supabaseUrl : '',
  savedAt: typeof payload.savedAt === 'string' ? payload.savedAt : null,
  hasServiceRoleKey: typeof payload.serviceRoleKey === 'string' && payload.serviceRoleKey.length > 0,
  hasAnonKey: typeof payload.anonKey === 'string' && payload.anonKey.length > 0,
  source: typeof payload.source === 'string' ? payload.source : null,
});

const readSupabaseCredentials = ({ includeKey = false } = {}) => {
  ensureDataDir();
  if (!fs.existsSync(SUPABASE_CREDENTIALS_FILE)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(SUPABASE_CREDENTIALS_FILE, 'utf-8'));
    if (includeKey) return parsed;
    return sanitizeSupabaseCredentials(parsed);
  } catch (err) {
    console.error('[supabase-credentials] read error', err);
    return null;
  }
};

const writeSupabaseCredentials = ({ supabaseUrl, serviceRoleKey, anonKey }) => {
  ensureDataDir();
  const payload = {
    supabaseUrl,
    serviceRoleKey,
    anonKey,
    savedAt: new Date().toISOString(),
    source: 'file',
  };
  fs.writeFileSync(SUPABASE_CREDENTIALS_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  return payload;
};

const PROJECT_ROOT = path.join(__dirname, '..');
const SUPABASE_CLI_TIMEOUT = 4 * 60 * 1000; // 4 minutes safety timeout

const runSupabaseCli = (args, { timeout = SUPABASE_CLI_TIMEOUT } = {}) => new Promise((resolve, reject) => {
  const child = spawn('npx', ['supabase', ...args], {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (!child.pid) {
    reject(new Error('Unable to start supabase CLI process'));
    return;
  }

  const timer = setTimeout(() => {
    child.kill('SIGTERM');
    reject(new Error(`supabase ${args.join(' ')} timed out after ${timeout}ms`));
  }, timeout);

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('close', (code) => {
    clearTimeout(timer);
    if (code === 0) {
      resolve({ stdout, stderr });
    } else {
      const error = new Error(`supabase ${args.join(' ')} exited with code ${code}`);
      error.stdout = stdout;
      error.stderr = stderr;
      error.exitCode = code;
      reject(error);
    }
  });
});


const readCliOutputFromError = (error) => {
  const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
  const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
  return `${stdout}\n${stderr}`.trim();
};

const isRecoverableDbResetFailure = (error) => {
  const output = readCliOutputFromError(error).toLowerCase();
  if (!output) return false;
  const resetStarted = output.includes('resetting local database');
  const hasUpstream502 = output.includes('error status 502')
    || output.includes('invalid response was received from the upstream server');
  const mentionsRestart = output.includes('restarting containers');
  return resetStarted && (hasUpstream502 || mentionsRestart);
};

const isSupabaseAlreadyRunningFailure = (error) => {
  const output = readCliOutputFromError(error).toLowerCase();
  return output.includes('supabase start is already running');
};

const parseSupabaseBootMode = () => {
  const raw = String(
    process.env.OPENRIG_SUPABASE_BOOT_MODE
    || process.env.OPENRIG_SUPABASE_BOOT
    || '',
  ).trim().toLowerCase();
  if (raw === 'skip' || raw === 'off' || raw === 'disabled' || raw === 'bypass') {
    return 'skip';
  }
  return 'start';
};

const parseSupabaseInfoOutput = (output = '') => {
  const result = {};
  output.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('API URL:')) {
      result.apiUrl = trimmed.split('API URL:')[1].trim();
    } else if (trimmed.startsWith('Database URL:')) {
      result.databaseUrl = trimmed.split('Database URL:')[1].trim();
    } else if (trimmed.startsWith('Publishable key:')) {
      result.anonKey = trimmed.split('Publishable key:')[1].trim();
    } else if (trimmed.startsWith('Secret key:')) {
      result.serviceRoleKey = trimmed.split('Secret key:')[1].trim();
    }
  });
  return result;
};

const roundCurrencyValue = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const isStandardRentalInvoice = (row) => {
  const documentType = row?.document_type || 'invoice';
  return documentType !== 'quote' && documentType !== 'credit_note';
};

const buildRentalInvoicePrefix = (referenceCode, rentalId) => {
  const ref = String(referenceCode || rentalId?.slice(0, 6) || 'DOC').trim().toUpperCase();
  return `INV-${ref || 'DOC'}-`;
};

const computeNextRentalInvoiceNumber = async (prefix) => {
  if (!supabase) throw new Error('Supabase client not configured');
  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_number')
    .like('invoice_number', `${prefix}%`);

  if (error) throw error;

  const nextSequence = ((data || []).reduce((max, row) => {
    const raw = typeof row?.invoice_number === 'string' ? row.invoice_number : '';
    if (!raw.startsWith(prefix)) return max;
    const suffix = raw.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) return max;
    return Math.max(max, Number(suffix));
  }, 0)) + 1;

  return `${prefix}${String(nextSequence).padStart(3, '0')}`;
};

const ensureRentalDraftInvoiceForAcceptance = async ({
  rentalId,
  clientId = null,
  referenceCode = null,
  amountTTC = 0,
  note = '',
}) => {
  if (!supabase) throw new Error('Supabase client not configured');

  const normalizedAmount = roundCurrencyValue(amountTTC);
  const payload = {
    client_id: clientId,
    rental_id: rentalId,
    amount_ht: normalizedAmount,
    amount_ttc: normalizedAmount,
    vat_amount: 0,
    due_date: null,
    notes: note,
  };

  const { data: existingRows, error: existingError } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, document_type, created_at')
    .eq('rental_id', rentalId)
    .order('created_at', { ascending: true });

  if (existingError) throw existingError;

  const existingInvoice = (existingRows || []).find(isStandardRentalInvoice) || null;
  if (existingInvoice) {
    const nextStatus = existingInvoice.status === 'cancelled' ? 'draft' : (existingInvoice.status || 'draft');
    const { data: updated, error: updateError } = await supabase
      .from('invoices')
      .update({
        ...payload,
        status: nextStatus,
      })
      .eq('id', existingInvoice.id)
      .select('id, invoice_number')
      .single();

    if (updateError) throw updateError;
    return {
      id: updated?.id || existingInvoice.id,
      invoice_number: updated?.invoice_number || existingInvoice.invoice_number,
      reused: true,
    };
  }

  const prefix = buildRentalInvoicePrefix(referenceCode, rentalId);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const invoiceNumber = await computeNextRentalInvoiceNumber(prefix);
    const { data: created, error: createError } = await supabase
      .from('invoices')
      .insert([
        {
          invoice_number: invoiceNumber,
          status: 'draft',
          ...payload,
        },
      ])
      .select('id, invoice_number')
      .single();

    if (!createError) {
      return {
        id: created?.id || null,
        invoice_number: created?.invoice_number || invoiceNumber,
        reused: false,
      };
    }

    if (createError.code !== '23505') {
      throw createError;
    }
  }

  const { data: fallbackRows, error: fallbackError } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, document_type, created_at')
    .eq('rental_id', rentalId)
    .order('created_at', { ascending: true });

  if (fallbackError) throw fallbackError;

  const fallbackInvoice = (fallbackRows || []).find(isStandardRentalInvoice) || null;
  if (!fallbackInvoice) {
    throw new Error('Unable to create or locate rental invoice');
  }

  return {
    id: fallbackInvoice.id,
    invoice_number: fallbackInvoice.invoice_number,
    reused: true,
  };
};

let supabaseCliLock = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const collectSupabaseStatusInfo = async ({ attempts = 5, delay = 2000 } = {}) => {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { stdout, stderr } = await runSupabaseCli(['status'], { timeout: 30 * 1000 });
      const parsed = parseSupabaseInfoOutput(`${stdout}\n${stderr}`);
      if (parsed.apiUrl || parsed.serviceRoleKey || parsed.anonKey) {
        return { parsed, stdout, stderr };
      }
      await sleep(delay);
    } catch (err) {
      lastError = err;
      await sleep(delay);
    }
  }
  if (lastError) {
    throw lastError;
  }
  return null;
};

const updateEnvFileWithSupabaseConfig = (config) => {
  if (!config?.supabaseUrl || !config?.serviceRoleKey || !config?.anonKey) return;
  const envPath = path.join(PROJECT_ROOT, '.env');
  const entries = {
    VITE_SUPABASE_URL: config.supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
    VITE_SUPABASE_ANON_KEY: config.anonKey,
  };

  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8').split(/\r?\n/) : [];
  const map = new Map();
  existing.forEach((line) => {
    const idx = line.indexOf('=');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      map.set(key, line.slice(idx + 1));
    } else if (line.trim() !== '') {
      map.set(line, null);
    }
  });

  ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].forEach((key) => {
    map.delete(key);
  });

  Object.entries(entries).forEach(([key, value]) => {
    map.set(key, value);
  });

  const lines = [];
  map.forEach((value, key) => {
    if (value === null) {
      lines.push(key);
    } else {
      lines.push(`${key}=${value}`);
    }
  });

  fs.writeFileSync(envPath, `${lines.join('\n')}\n`, 'utf-8');
};

const REQUIRED_ENV_KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const SUPABASE_BOOT_FILE = path.join(DATA_DIR, 'supabase-bootstrap.json');
const SUPABASE_VERIFICATION_FILE = path.join(DATA_DIR, 'supabase-verification.json');
const SUPABASE_CONFIG_STATE_FILE = path.join(DATA_DIR, 'supabase-config-state.json');

const ALLOWED_LOGO_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']);
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

const envHasRequiredSupabaseConfig = () => REQUIRED_ENV_KEYS.every((key) => {
  const value = process.env[key];
  return typeof value === 'string' && value.trim().length > 0;
});

const readSupabaseBootstrapMetadata = () => {
  try {
    if (!fs.existsSync(SUPABASE_BOOT_FILE)) return { completed: false, lastCompletedAt: null, lastError: null };
    const raw = fs.readFileSync(SUPABASE_BOOT_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      completed: Boolean(parsed?.completed),
      lastCompletedAt: typeof parsed?.lastCompletedAt === 'string' ? parsed.lastCompletedAt : null,
      lastError: typeof parsed?.lastError === 'string' ? parsed.lastError : null,
      forceReset: Boolean(parsed?.forceReset),
      updatedAt: parsed?.updatedAt || null,
    };
  } catch (err) {
    console.warn('[supabase/bootstrap] unable to read metadata', err);
    return { completed: false, lastCompletedAt: null, lastError: null };
  }
};

const readSupabaseVerificationFlag = () => {
  try {
    if (!fs.existsSync(SUPABASE_VERIFICATION_FILE)) {
      return { verified: false, updatedAt: null };
    }
    const raw = fs.readFileSync(SUPABASE_VERIFICATION_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      verified: Boolean(parsed?.verified),
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch (err) {
    console.warn('[supabase/verification] unable to read verification flag', err);
    return { verified: false, updatedAt: null };
  }
};

const writeSupabaseVerificationFlag = (verified) => {
  ensureDataDir();
  try {
    if (readSupabaseVerificationFlag().verified === Boolean(verified)) return;
    fs.writeFileSync(
      SUPABASE_VERIFICATION_FILE,
      JSON.stringify({ verified: Boolean(verified), updatedAt: new Date().toISOString() }, null, 2),
      'utf-8',
    );
  } catch (err) {
    console.warn('[supabase/verification] unable to persist verification flag', err);
  }
};

const hasStoredSupabaseCredentials = () => {
  const stored = readSupabaseCredentials({ includeKey: false });
  return Boolean(stored?.supabaseUrl && stored?.hasServiceRoleKey);
};

const inferSupabaseConfigState = () => {
  const bootstrap = readSupabaseBootstrapMetadata();
  const verification = readSupabaseVerificationFlag();
  const hasUsableConfig = hasStoredSupabaseCredentials() || envHasRequiredSupabaseConfig();
  if (bootstrap.completed && hasUsableConfig) return true;
  if (verification.verified && hasUsableConfig) return true;
  return false;
};

const readSupabaseConfigState = () => {
  try {
    if (!fs.existsSync(SUPABASE_CONFIG_STATE_FILE)) {
      return {
        supabaseIsConfig: inferSupabaseConfigState(),
        updatedAt: null,
        source: 'inferred',
      };
    }
    const raw = fs.readFileSync(SUPABASE_CONFIG_STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      supabaseIsConfig: Boolean(parsed?.supabaseIsConfig),
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null,
      source: 'file',
    };
  } catch (err) {
    console.warn('[supabase/config-state] unable to read config state', err);
    return {
      supabaseIsConfig: inferSupabaseConfigState(),
      updatedAt: null,
      source: 'fallback',
    };
  }
};

const writeSupabaseConfigState = (supabaseIsConfig) => {
  ensureDataDir();
  try {
    const current = readSupabaseConfigState();
    if (current.source === 'file' && current.supabaseIsConfig === Boolean(supabaseIsConfig)) return;
    fs.writeFileSync(
      SUPABASE_CONFIG_STATE_FILE,
      JSON.stringify(
        {
          supabaseIsConfig: Boolean(supabaseIsConfig),
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf-8',
    );
  } catch (err) {
    console.warn('[supabase/config-state] unable to persist config state', err);
  }
};

const sanitizeNullableString = (value, { toLowerCase = false } = {}) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return toLowerCase ? trimmed.toLowerCase() : trimmed;
};

const sanitizeNullableNumber = (value) => {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const hashSharePassword = (value) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(value, salt, 64);
  return { salt, hash: derived.toString('hex') };
};

const verifySharePassword = (value, salt, hash) => {
  if (!value || !salt || !hash) return false;
  const derived = crypto.scryptSync(value, salt, 64);
  const hashBuffer = Buffer.from(hash, 'hex');
  if (hashBuffer.length !== derived.length) return false;
  return crypto.timingSafeEqual(hashBuffer, derived);
};

const inferLogoExtension = (mime) => {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/svg+xml':
      return 'svg';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
};

const buildCompanyLogoPath = (extension = 'png') => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `company/setup/logo-${suffix}.${extension}`;
};

let companyLogoBucketEnsured = false;
const ensureCompanyLogoBucket = async () => {
  if (!supabase || companyLogoBucketEnsured) {
    return companyLogoBucketEnsured;
  }
  try {
    const { data, error } = await supabase.storage.getBucket(COMPANY_LOGO_BUCKET);
    if (error && !/not\sfound/i.test(error.message || '')) {
      throw error;
    }
    if (data) {
      companyLogoBucketEnsured = true;
      return true;
    }

    const { error: createErr } = await supabase.storage.createBucket(COMPANY_LOGO_BUCKET, {
      public: true,
      fileSizeLimit: null,
      allowedMimeTypes: Array.from(ALLOWED_LOGO_MIME_TYPES),
    });

    if (createErr && !/already\sexists/i.test(createErr.message || '')) {
      throw createErr;
    }

    companyLogoBucketEnsured = true;
    return true;
  } catch (err) {
    console.error('[storage] ensure bucket failed', err);
    throw err;
  }
};

const writeSupabaseBootstrapMetadata = (patch = {}) => {
  ensureDataDir();
  const current = readSupabaseBootstrapMetadata();
  const merged = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(SUPABASE_BOOT_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
};

const resolveSupabaseBootstrapMode = () => {
  const configState = readSupabaseConfigState();
  if (configState.source !== 'file') {
    writeSupabaseConfigState(configState.supabaseIsConfig);
  }

  const envOk = envHasRequiredSupabaseConfig();
  const meta = readSupabaseBootstrapMetadata();
  const verification = readSupabaseVerificationFlag();
  const checks = {
    supabaseIsConfig: Boolean(configState.supabaseIsConfig),
    verificationVerified: Boolean(verification?.verified),
    bootstrapCompleted: Boolean(meta?.completed),
    envConfigured: envOk,
    storedCredentials: hasStoredSupabaseCredentials(),
  };

  const forceReset = !configState.supabaseIsConfig;
  console.info(
    `[supabase/bootstrap] startup checks=${JSON.stringify(checks)} mode=${forceReset ? 'start+reset' : 'start-only'}`,
  );
  return { forceReset, checks };
};

let supabaseBootstrapPromise = null;
let supabaseBootstrapState = {
  status: 'idle',
  lastError: null,
  startedAt: null,
  completedAt: null,
};

let latestSupabaseHealth = {
  status: 'unknown',
  message: null,
  issues: [],
  updatedAt: null,
};

const setSupabaseHealth = (patch = {}) => {
  latestSupabaseHealth = {
    status: patch.status || latestSupabaseHealth.status || 'unknown',
    message: Object.prototype.hasOwnProperty.call(patch, 'message') ? patch.message : latestSupabaseHealth.message,
    issues: Array.isArray(patch.issues) ? patch.issues : latestSupabaseHealth.issues || [],
    updatedAt: new Date().toISOString(),
  };
};

const applyStructureEvaluation = (result) => {
  if (!result) return;

  const previousStatus = latestSupabaseHealth.status || 'unknown';

  if (result.ok) {
    setSupabaseHealth({ status: 'ready', issues: [], message: null });
    writeSupabaseVerificationFlag(true);
    writeSupabaseConfigState(true);

    if (previousStatus !== 'ready') {
      writeSupabaseBootstrapMetadata({
        completed: true,
        lastError: null,
        forceReset: false,
        lastCompletedAt: new Date().toISOString(),
      });
    }
    return;
  }

  if (result.reason === 'unauthorized') {
    const message = result.error?.message || 'Accès Supabase refusé. Vérifiez la clé service_role.';
    setSupabaseHealth({ status: 'unauthorized', issues: [], message });
    writeSupabaseVerificationFlag(false);
    return;
  }

  if (result.reason === 'unreachable') {
    const message = result.error?.message || 'Supabase est inaccessible.';
    setSupabaseHealth({ status: 'unreachable', issues: [], message });
    writeSupabaseVerificationFlag(false);
    return;
  }

  const issues = Array.isArray(result.checks)
    ? result.checks.filter((check) => check.status && check.status !== 'ok')
    : [];
  const message = issues.length > 0
    ? 'Certaines tables ou colonnes requises sont manquantes.'
    : 'Structure Supabase invalide.';

  setSupabaseHealth({ status: 'invalid', issues, message });
  writeSupabaseVerificationFlag(false);
  writeSupabaseConfigState(false);

  if (result.reason === 'invalid' && previousStatus !== 'invalid') {
    const meta = readSupabaseBootstrapMetadata();
    if (meta.completed || !meta.forceReset) {
      writeSupabaseBootstrapMetadata({
        completed: false,
        lastError: 'structure_invalid',
        forceReset: true,
      });
    }
  }
};

const refreshSupabaseHealth = async () => {
  if (!supabase) {
    setSupabaseHealth({ status: 'unreachable', issues: [], message: 'Supabase non configuré' });
    writeSupabaseVerificationFlag(false);
    return null;
  }
  try {
    const evaluation = await evaluateSupabaseStructure(supabase);
    applyStructureEvaluation(evaluation);
    return evaluation;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setSupabaseHealth({ status: 'failed', issues: [], message });
    writeSupabaseVerificationFlag(false);
    return null;
  }
};

// Background/health-poll variant: refreshes the in-memory status without writing
// any persisted flags on failure. A transient failure observed by a poll (e.g.
// Supabase containers still starting) must never set forceReset metadata, which
// would trigger a destructive "db reset" on the next full boot.
const refreshSupabaseHealthLight = async () => {
  if (!supabase) {
    setSupabaseHealth({ status: 'unreachable', issues: [], message: 'Supabase non configuré' });
    return null;
  }
  try {
    const evaluation = await evaluateSupabaseStructure(supabase);
    if (!evaluation) return null;
    if (evaluation.ok) {
      applyStructureEvaluation(evaluation);
      return evaluation;
    }
    if (evaluation.reason === 'unauthorized') {
      setSupabaseHealth({
        status: 'unauthorized',
        issues: [],
        message: evaluation.error?.message || 'Accès Supabase refusé. Vérifiez la clé service_role.',
      });
    } else if (evaluation.reason === 'unreachable') {
      setSupabaseHealth({
        status: 'unreachable',
        issues: [],
        message: evaluation.error?.message || 'Supabase est inaccessible.',
      });
    } else {
      const issues = Array.isArray(evaluation.checks)
        ? evaluation.checks.filter((check) => check.status && check.status !== 'ok')
        : [];
      setSupabaseHealth({
        status: 'invalid',
        issues,
        message: issues.length > 0
          ? 'Certaines tables ou colonnes requises sont manquantes.'
          : 'Structure Supabase invalide.',
      });
    }
    return evaluation;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setSupabaseHealth({ status: 'failed', issues: [], message });
    return null;
  }
};

const HEALTH_REFRESH_MIN_INTERVAL_MS = 15 * 1000;
const HEALTH_REFRESH_WAIT_BUDGET_MS = 8 * 1000;
let healthRefreshInFlight = null;

// Re-checks Supabase health when the cached status is stale, so the status
// endpoints reflect reality in every launch mode (with or without the
// Supabase auto-bootstrap). Waits at most HEALTH_REFRESH_WAIT_BUDGET_MS so a
// slow/unreachable Supabase never blocks the HTTP response: the refresh keeps
// running in the background and the next poll picks up the result.
const refreshSupabaseHealthIfStale = async ({ maxAgeMs = HEALTH_REFRESH_MIN_INTERVAL_MS } = {}) => {
  if (supabaseBootstrapState.status === 'running') return;
  const updatedAtMs = latestSupabaseHealth.updatedAt ? Date.parse(latestSupabaseHealth.updatedAt) : 0;
  if (Number.isFinite(updatedAtMs) && updatedAtMs > 0 && Date.now() - updatedAtMs < maxAgeMs) return;
  if (!healthRefreshInFlight) {
    healthRefreshInFlight = refreshSupabaseHealthLight()
      .catch(() => null)
      .finally(() => {
        healthRefreshInFlight = null;
      });
  }
  await Promise.race([healthRefreshInFlight, sleep(HEALTH_REFRESH_WAIT_BUDGET_MS)]);
};

const waitForSupabaseStructure = async ({ attempts = 10, delay = 2000 } = {}) => {
  let evaluation = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    evaluation = await refreshSupabaseHealth();
    if (evaluation && evaluation.ok) {
      return evaluation;
    }
    if (attempt < attempts) {
      await sleep(delay);
    }
  }
  return evaluation;
};

const bootstrapSupabase = async ({ forceReset = false } = {}) => {
  supabaseBootstrapState = {
    status: 'running',
    lastError: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    forceReset,
  };

  writeSupabaseBootstrapMetadata({ completed: false, lastError: null, forceReset, lastAttemptAt: supabaseBootstrapState.startedAt });

  try {
    while (supabaseCliLock) {
      await sleep(500);
    }
    supabaseCliLock = true;

    let parsed = {};

    let startRecoveredFromRunningState = false;
    const runStartAndMerge = async () => {
      try {
        const { stdout, stderr } = await runSupabaseCli(['start']);
        const startParsed = parseSupabaseInfoOutput(`${stdout}\n${stderr}`);
        parsed = { ...parsed, ...startParsed };
      } catch (startErr) {
        if (!isSupabaseAlreadyRunningFailure(startErr)) {
          throw startErr;
        }
        startRecoveredFromRunningState = true;
        const output = readCliOutputFromError(startErr);
        const startParsed = parseSupabaseInfoOutput(output);
        parsed = { ...parsed, ...startParsed };
        console.info('[supabase/bootstrap] supabase start already running, continuing with readiness checks');
      }
    };

    await runStartAndMerge();

    let resetRecoveredFromTransientFailure = false;

    if (forceReset) {
      try {
        await runSupabaseCli(['db', 'reset']);
      } catch (resetErr) {
        if (!isRecoverableDbResetFailure(resetErr)) {
          throw resetErr;
        }
        resetRecoveredFromTransientFailure = true;
        const resetMessage = resetErr instanceof Error ? resetErr.message : String(resetErr);
        console.warn(`[supabase/bootstrap] transient db reset failure detected (${resetMessage}), continuing with startup checks`);
      }
      await runStartAndMerge();
    }

    const statusInfo = await collectSupabaseStatusInfo({
      attempts: (resetRecoveredFromTransientFailure || startRecoveredFromRunningState) ? 20 : 10,
      delay: (resetRecoveredFromTransientFailure || startRecoveredFromRunningState) ? 3000 : 2000,
    });
    parsed = { ...parsed, ...(statusInfo?.parsed || {}) };

    if (parsed.apiUrl && parsed.serviceRoleKey && parsed.anonKey) {
      const payload = {
        supabaseUrl: parsed.apiUrl,
        serviceRoleKey: parsed.serviceRoleKey,
        anonKey: parsed.anonKey,
        savedAt: new Date().toISOString(),
        source: 'cli',
      };
      applySupabaseConfig(payload);
      writeSupabaseCredentials(payload);
      updateEnvFileWithSupabaseConfig(payload);
    } else {
      throw new Error('supabase_info_missing');
    }

    if (parsed.databaseUrl) {
      try {
        const dbUrl = new URL(parsed.databaseUrl);
        writeDatabaseInfo({
          host: dbUrl.hostname || '127.0.0.1',
          port: dbUrl.port || '5432',
          database: dbUrl.pathname ? dbUrl.pathname.replace(/^\//, '') : 'postgres',
          user: decodeURIComponent(dbUrl.username || 'postgres'),
          password: decodeURIComponent(dbUrl.password || ''),
        });
      } catch (err) {
        console.warn('[supabase/bootstrap] unable to parse database URL', err);
      }
    }

    let structureEvaluation = await waitForSupabaseStructure({
      attempts: (resetRecoveredFromTransientFailure || startRecoveredFromRunningState) ? 20 : 10,
      delay: 2000,
    });
    if ((!structureEvaluation || !structureEvaluation.ok) && resetRecoveredFromTransientFailure) {
      console.warn('[supabase/bootstrap] structure still not ready after transient reset failure, retrying one final start');
      await runStartAndMerge();
      const retryStatusInfo = await collectSupabaseStatusInfo({ attempts: 10, delay: 2000 });
      parsed = { ...parsed, ...(retryStatusInfo?.parsed || {}) };
      structureEvaluation = await waitForSupabaseStructure({ attempts: 10, delay: 2000 });
    }
    if (!structureEvaluation || !structureEvaluation.ok) {
      throw new Error('structure_invalid');
    }

    supabaseBootstrapState = {
      status: 'ready',
      lastError: null,
      startedAt: supabaseBootstrapState.startedAt,
      completedAt: new Date().toISOString(),
      forceReset,
    };
    writeSupabaseBootstrapMetadata({ completed: true, lastError: null, lastCompletedAt: supabaseBootstrapState.completedAt, forceReset: false });
    writeSupabaseConfigState(true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    supabaseBootstrapState = {
      status: 'failed',
      lastError: message,
      startedAt: supabaseBootstrapState.startedAt,
      completedAt: new Date().toISOString(),
      forceReset,
    };
    if (latestSupabaseHealth.status !== 'invalid') {
      const displayMessage = message === 'structure_invalid'
        ? 'Structure Supabase invalide.'
        : message;
      setSupabaseHealth({ status: 'failed', issues: [], message: displayMessage });
    }
    writeSupabaseBootstrapMetadata({ completed: false, lastError: message, forceReset, lastCompletedAt: readSupabaseBootstrapMetadata().lastCompletedAt || null });
    writeSupabaseVerificationFlag(false);
    if (message === 'structure_invalid' || forceReset) {
      writeSupabaseConfigState(false);
    }
    throw err;
  } finally {
    supabaseCliLock = false;
  }
};

const ensureSupabaseOnBoot = () => {
  const bootMode = parseSupabaseBootMode();
  if (bootMode === 'skip') {
    if (supabaseBootstrapState.status === 'idle') {
      supabaseBootstrapState = {
        status: 'skipped',
        lastError: null,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        forceReset: false,
      };
    }
    console.info('[supabase/bootstrap] boot mode=skip (set OPENRIG_SUPABASE_BOOT_MODE=start to restore auto-start)');
    // Still evaluate the real health once so stale flags left by a previous
    // full launch (credentials file, .env) don't make the app believe the
    // database is up — or down — when it isn't.
    return refreshSupabaseHealthLight().catch((err) => {
      console.warn('[supabase/health] initial check failed', err);
    });
  }

  if (!supabaseBootstrapPromise) {
    const { forceReset } = resolveSupabaseBootstrapMode();
    supabaseBootstrapPromise = bootstrapSupabase({ forceReset }).catch((err) => {
      console.warn('[supabase/bootstrap] failed', err);
    });
  }
  return supabaseBootstrapPromise;
};

const decodeJwtPayload = (token) => {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
  try {
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
  } catch (err) {
    return null;
  }
};

let supabase = null;
let supabaseConfig = {
  supabaseUrl: '',
  serviceRoleKey: '',
  anonKey: '',
  savedAt: null,
  source: 'none',
};

let HAS_SUPABASE_SERVICE_KEY = false;

const applySupabaseConfig = (config) => {
  if (!config?.supabaseUrl || !config?.serviceRoleKey) {
    supabase = null;
    supabaseConfig = { supabaseUrl: '', serviceRoleKey: '', anonKey: '', savedAt: null, source: 'none' };
    HAS_SUPABASE_SERVICE_KEY = false;
    companyLogoBucketEnsured = false;
    return;
  }
  supabase = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false } });
  const anonKey = typeof config.anonKey === 'string' ? config.anonKey : '';
  supabaseConfig = {
    supabaseUrl: config.supabaseUrl,
    serviceRoleKey: config.serviceRoleKey,
    anonKey,
    savedAt: config.savedAt || new Date().toISOString(),
    source: config.source || 'runtime',
  };
  process.env.VITE_SUPABASE_URL = config.supabaseUrl;
  process.env.SUPABASE_URL = config.supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = config.serviceRoleKey;
  if (anonKey) {
    process.env.VITE_SUPABASE_ANON_KEY = anonKey;
    process.env.SUPABASE_ANON_KEY = anonKey;
  }
  HAS_SUPABASE_SERVICE_KEY = true;
  companyLogoBucketEnsured = false;
};

const loadInitialSupabaseConfig = () => {
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    return {
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_KEY,
      anonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
      source: 'env',
      savedAt: new Date().toISOString(),
    };
  }
  const stored = readSupabaseCredentials({ includeKey: true });
  if (stored?.supabaseUrl && stored?.serviceRoleKey) {
    return { ...stored, source: 'file' };
  }
  return null;
};

const initialSupabaseConfig = loadInitialSupabaseConfig();

if (initialSupabaseConfig) {
  applySupabaseConfig(initialSupabaseConfig);
  if (initialSupabaseConfig.source === 'env' && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[server] SUPABASE_SERVICE_ROLE_KEY is missing. Sensitive RPCs (password reset, 2FA, user provisioning) may fail.');
  }
} else {
  console.warn('[server] Supabase client is not fully configured. Password reset endpoints will be disabled.');
}

const REQUIRED_SUPABASE_TABLES = {
  app_users: ['id', 'email', 'hashed_password', 'must_change_password', 'two_factor_email_enabled', 'two_factor_totp_enabled'],
  app_permissions: ['user_id', 'superadmin'],
  app_user_preferences: ['user_id', 'preferences'],
  auth_two_factor_codes: ['id', 'user_id', 'code_hash', 'expires_at', 'consumed_at'],
  auth_password_reset_codes: ['id', 'email', 'code_hash', 'expires_at'],
  auth_login_audit: ['id', 'user_id', 'created_at'],
};

const evaluateSupabaseStructure = async (client) => {
  if (!client) {
    return { ok: false, reason: 'client_not_configured', checks: [] };
  }

  const unauthorizedCodes = new Set(['PGRST301', 'PGRST302', 'PGRST303', '401', '403']);
  const checks = [];

  for (const [table, columns] of Object.entries(REQUIRED_SUPABASE_TABLES)) {
    const projection = columns.join(',');
    const { error } = await client.from(table).select(projection).limit(1);
    if (error) {
      if (unauthorizedCodes.has(error.code)) {
        return {
          ok: false,
          reason: 'unauthorized',
          error,
          checks,
        };
      }

      if (typeof error.message === 'string' && /fetch failed/i.test(error.message)) {
        return {
          ok: false,
          reason: 'unreachable',
          error,
          checks,
        };
      }

      const status = error.code === '42P01'
        ? 'missing_table'
        : error.code === '42703'
          ? 'missing_columns'
          : 'error';

      checks.push({
        table,
        columns,
        status,
        errorCode: error.code || null,
        message: error.message || null,
      });
    } else {
      checks.push({
        table,
        columns,
        status: 'ok',
      });
    }
  }

  const ok = checks.every((check) => check.status === 'ok');
  return { ok, checks, reason: ok ? 'ok' : 'invalid' };
};

const ADMIN_PERMISSION_COLUMNS = [
  'can_create_service',
  'can_edit_equipment',
  'can_manage_warehouses',
  'can_manage_personnel',
  'can_manage_clients',
  'can_view_accounting',
  'can_manage_maintenance',
  'can_manage_notifications',
  'can_edit_settings',
  'eq_view_menu',
  'eq_view_list',
  'eq_view_detail',
  'eq_create',
  'eq_edit',
  'eq_delete',
  'eq_manage_pricing',
  'eq_manage_stock',
  'eq_manage_serials',
  'eq_upload_media',
  'eq_export',
  'eq_import',
  'eq_bulk_actions',
  'eq_archive',
  'eq_manage_categories',
  'eq_view_costs',
  'eq_view_margins',
  'eq_view_history',
  'eq_view_audit',
  'eq_assign_warehouse',
  'eq_transfer_stock',
  'eq_print_labels',
  'eq_view_documents',
  'eq_manage_documents',
  'eq_view_maintenance',
  'eq_schedule_maintenance',
  'eq_calibrate',
  'eq_deprecate',
  'eq_restore_item',
  'eq_tag',
  'eq_manage_tags',
  'eq_comment',
  'eq_manage_comments',
  'eq_share',
  'eq_publish_catalog',
  'eq_view_reports',
  'eq_generate_barcodes',
  'eq_scan_barcodes',
  'eq_change_status',
  'eq_link_accessories',
  'rn_view_menu',
  'rn_view_list',
  'rn_view_detail',
  'rn_create',
  'rn_edit',
  'rn_delete',
  'rn_change_status',
  'rn_manage_items',
  'rn_generate_documents',
  'rn_send_documents',
  'rn_accept_service',
  'rn_refuse_service',
  'rn_export',
  'rn_import',
  'rn_view_reports',
  'rn_view_calendar',
  'rn_schedule',
  'rn_invoice',
  'rn_discount',
  'rn_view_costs',
  'rn_view_margins',
  'cl_view_menu',
  'cl_view_list',
  'cl_view_detail',
  'cl_create',
  'cl_edit',
  'cl_delete',
  'cl_manage_contacts',
  'cl_view_invoices',
  'cl_export',
  'cl_import',
  'cl_view_reports',
  'wh_view_menu',
  'wh_view_list',
  'wh_view_detail',
  'wh_create',
  'wh_edit',
  'wh_delete',
  'wh_manage_stock',
  'wh_transfer',
  'wh_print_labels',
  'wh_view_reports',
  'wh_export',
  'wh_import',
  'wh_audit',
  'pe_view_menu',
  'pe_view_list',
  'pe_view_detail',
  'pe_create_user',
  'pe_edit_user',
  'pe_delete_user',
  'pe_manage_roles',
  'pe_manage_permissions',
  'pe_view_activities',
  'pe_schedule',
  'pe_view_reports',
  'pe_export',
  'pe_import',
  'ac_view_menu',
  'ac_view_dashboard',
  'ac_view_invoices',
  'ac_view_payments',
  'ac_view_reports',
  'ac_create_invoice',
  'ac_edit_invoice',
  'ac_delete_invoice',
  'ac_send_invoice',
  'ac_mark_paid',
  'ac_refund',
  'ac_manage_taxes',
  'ac_manage_accounts',
  'ac_export',
  'ac_import',
  'mt_view_menu',
  'mt_view_list',
  'mt_view_detail',
  'mt_view_calendar',
  'mt_view_reports',
  'mt_create_task',
  'mt_edit_task',
  'mt_delete_task',
  'mt_schedule',
  'mt_assign',
  'mt_complete',
  'mt_cancel',
  'mt_manage_procedures',
  'mt_export',
  'mt_import',
  'cs_view_company',
  'cs_edit_company',
];

const buildSuperadminPermissionsPayload = (record = null) => {
  const payload = { superadmin: true };
  if (record && typeof record === 'object') {
    Object.entries(record).forEach(([key, value]) => {
      if (key === 'user_id' || key === 'created_at') return;
      if (typeof value === 'boolean') {
        payload[key] = true;
      }
    });
    return payload;
  }
  ADMIN_PERMISSION_COLUMNS.forEach((key) => {
    payload[key] = true;
  });
  return payload;
};

const isSupabaseReady = () => Boolean(supabase) && HAS_SUPABASE_SERVICE_KEY;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APPROVAL_CODE_LENGTH = 6;

const parseCookies = (req) => {
  const list = {};
  const header = req.headers?.cookie;
  if (!header) return list;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    list[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return list;
};

const hashApprovalPassword = (rawToken, password) =>
  crypto.createHash('sha256').update(`${rawToken}|${password}`).digest('hex');

const buildUnlockCookieValue = (requestId, rawToken) =>
  crypto.createHmac('sha256', SUPABASE_SERVICE_KEY || 'openrig-approval')
    .update(`${requestId}|${rawToken}`)
    .digest('hex');

const UNLOCK_COOKIE_PREFIX = 'or_appr_';
const APPROVAL_MAX_ATTEMPTS = 5;
const APPROVAL_CONSENT_TEXT = "Je confirme être habilité(e) à valider ce devis et j'accepte que cette validation soit enregistrée comme signature électronique simple.";

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeApprovalDecision = (value) => {
  const normalized = sanitizeNullableString(value, { toLowerCase: true });
  if (normalized === 'accept' || normalized === 'accepted') return 'accept';
  if (normalized === 'refuse' || normalized === 'refused' || normalized === 'reject' || normalized === 'rejected') return 'refuse';
  if (normalized === 'modification' || normalized === 'modification_requested') return 'modification';
  return null;
};

const generateApprovalCode = () => String(crypto.randomInt(0, 10 ** APPROVAL_CODE_LENGTH)).padStart(APPROVAL_CODE_LENGTH, '0');

const hashApprovalCode = (token, code) => {
  const safeToken = String(token || '');
  const safeCode = String(code || '').replace(/\D/g, '');
  return crypto.createHash('sha256').update(`${safeToken}:${safeCode}`).digest('hex');
};

const approvalCodeMatches = (expectedHash, token, code) => {
  if (!expectedHash) return true;
  const candidate = hashApprovalCode(token, code);
  if (expectedHash.length !== candidate.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expectedHash, 'utf8'), Buffer.from(candidate, 'utf8'));
  } catch {
    return false;
  }
};

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Encode = (buffer) => {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
};

const base32Decode = (input) => {
  const clean = (input || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

const generateTotpSecret = (size = 20) => base32Encode(crypto.randomBytes(size));

const hotp = (secretBuffer, counter, digits = 6) => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuffer).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  const mod = 10 ** digits;
  return String(code % mod).padStart(digits, '0');
};

const verifyTotp = (code, secret, { window = 1, step = 30, digits = 6 } = {}) => {
  const sanitizedCode = String(code || '').replace(/[^0-9]/g, '');
  if (sanitizedCode.length !== digits) return false;
  const key = base32Decode(secret);
  if (key.length === 0) return false;
  const currentCounter = Math.floor(Date.now() / 1000 / step);
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = hotp(key, currentCounter + offset, digits);
    if (expected === sanitizedCode) return true;
  }
  return false;
};

const buildOtpAuthUrl = (email, secret) => {
  const label = `${TOTP_ISSUER}:${email}`;
  const params = new URLSearchParams({
    secret,
    issuer: TOTP_ISSUER,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
};

const fetchLoginContext = async (userId) => {
  if (!supabase) throw new Error('Supabase client not configured');
  const { data: userRow, error: userErr } = await supabase
    .from('app_users')
    .select('id, email, full_name, must_change_password, two_factor_email_enabled, two_factor_enabled_at, two_factor_totp_enabled, two_factor_totp_enabled_at')
    .eq('id', userId)
    .maybeSingle();
  if (userErr) throw userErr;
  if (!userRow) return null;

  const { data: permRow, error: permErr } = await supabase
    .from('app_permissions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (permErr) throw permErr;

  return {
    user_id: userRow.id,
    email: userRow.email,
    full_name: userRow.full_name || '',
    superadmin: !!permRow?.superadmin,
    must_change_password: !!userRow.must_change_password,
    two_factor_email_enabled: !!userRow.two_factor_email_enabled,
    two_factor_enabled_at: userRow.two_factor_enabled_at,
    two_factor_totp_enabled: !!userRow.two_factor_totp_enabled,
    two_factor_totp_enabled_at: userRow.two_factor_totp_enabled_at,
  };
};

const insertLoginAudit = async ({ userId, success, method, ip, userAgent, location }) => {
  if (!supabase) return;
  try {
    await supabase
      .from('auth_login_audit')
      .insert({
        user_id: userId,
        success,
        method,
        ip_address: ip || null,
        user_agent: userAgent || null,
        location: location || null,
      });
  } catch (err) {
    console.error('[login_audit] insert failed', err);
  }
};

const readDatabaseInfo = () => {
  ensureDataDir();
  if (!fs.existsSync(DATABASE_INFO_FILE)) {
    fs.writeFileSync(DATABASE_INFO_FILE, JSON.stringify(DEFAULT_DATABASE_INFO, null, 2), 'utf-8');
    return { ...DEFAULT_DATABASE_INFO };
  }

  try {
    const raw = fs.readFileSync(DATABASE_INFO_FILE, 'utf-8');
    return { ...DEFAULT_DATABASE_INFO, ...JSON.parse(raw) };
  } catch (err) {
    console.error('[database-info] read error', err);
    return { ...DEFAULT_DATABASE_INFO };
  }
};

const writeDatabaseInfo = (payload) => {
  ensureDataDir();
  const safe = {
    host: typeof payload.host === 'string' ? payload.host : DEFAULT_DATABASE_INFO.host,
    port: typeof payload.port === 'string' ? payload.port : DEFAULT_DATABASE_INFO.port,
    database: typeof payload.database === 'string' ? payload.database : DEFAULT_DATABASE_INFO.database,
    user: typeof payload.user === 'string' ? payload.user : DEFAULT_DATABASE_INFO.user,
    password: typeof payload.password === 'string' ? payload.password : DEFAULT_DATABASE_INFO.password,
  };
  fs.writeFileSync(DATABASE_INFO_FILE, JSON.stringify(safe, null, 2), 'utf-8');
  return safe;
};

const sanitizeMailConfig = (config) => ({
  host: config.host,
  port: config.port,
  secure: !!config.secure,
  user: config.user || '',
  hasPass: !!config.pass,
});

const readMailConfig = ({ includeSecrets = false } = {}) => {
  ensureDataDir();
  if (!fs.existsSync(MAIL_CONFIG_FILE)) {
    fs.writeFileSync(MAIL_CONFIG_FILE, JSON.stringify(DEFAULT_MAIL_CONFIG, null, 2), 'utf-8');
    return includeSecrets ? { ...DEFAULT_MAIL_CONFIG } : sanitizeMailConfig(DEFAULT_MAIL_CONFIG);
  }

  try {
    const raw = fs.readFileSync(MAIL_CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const port = parseInt(parsed.port, 10);
    const merged = {
      ...DEFAULT_MAIL_CONFIG,
      ...parsed,
      port: Number.isFinite(port) && port > 0 ? port : DEFAULT_MAIL_CONFIG.port,
      secure: typeof parsed.secure === 'boolean' ? parsed.secure : DEFAULT_MAIL_CONFIG.secure,
      user: typeof parsed.user === 'string' ? parsed.user.trim() : DEFAULT_MAIL_CONFIG.user,
      pass: typeof parsed.pass === 'string' ? parsed.pass : DEFAULT_MAIL_CONFIG.pass,
    };
    return includeSecrets ? merged : sanitizeMailConfig(merged);
  } catch (err) {
    console.error('[mail-config] read error', err);
    return includeSecrets ? { ...DEFAULT_MAIL_CONFIG } : sanitizeMailConfig(DEFAULT_MAIL_CONFIG);
  }
};

const writeMailConfig = (payload = {}) => {
  ensureDataDir();
  const safe = {
    host: typeof payload.host === 'string' ? payload.host.trim() : DEFAULT_MAIL_CONFIG.host,
    port: (() => {
      const parsed = parseInt(payload.port, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAIL_CONFIG.port;
    })(),
    secure: typeof payload.secure === 'boolean' ? payload.secure : DEFAULT_MAIL_CONFIG.secure,
    user: typeof payload.user === 'string' ? payload.user.trim() : DEFAULT_MAIL_CONFIG.user,
    pass: typeof payload.pass === 'string' ? payload.pass : DEFAULT_MAIL_CONFIG.pass,
  };
  fs.writeFileSync(MAIL_CONFIG_FILE, JSON.stringify(safe, null, 2), 'utf-8');
  return safe;
};

const addDirectoryToZip = (zip, sourceDir, targetPrefix) => {
  if (!sourceDir || !fs.existsSync(sourceDir)) return 0;
  let fileCount = 0;
  const safePrefix = String(targetPrefix || '').replace(/^\/+|\/+$/g, '');

  const walk = (currentDir, relativePrefix = '') => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.forEach((entry) => {
      const absolutePath = path.join(currentDir, entry.name);
      const nextRelativePrefix = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(absolutePath, nextRelativePrefix);
        return;
      }
      if (!entry.isFile()) return;
      const zipPath = safePrefix ? `${safePrefix}/${nextRelativePrefix}` : nextRelativePrefix;
      const content = fs.readFileSync(absolutePath);
      zip.file(zipPath, content);
      fileCount += 1;
    });
  };

  walk(sourceDir);
  return fileCount;
};

const listStorageEntries = async (bucketName, prefix = '') => {
  if (!supabase) return [];
  const entries = [];
  const pageSize = 100;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list(prefix, { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) {
      throw error;
    }
    const chunk = Array.isArray(data) ? data : [];
    entries.push(...chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }
  return entries;
};

const appendStorageBucketToZip = async ({
  zip,
  bucketName,
  prefix = '',
  warnings = [],
}) => {
  if (!supabase) return 0;
  let fileCount = 0;
  const entries = await listStorageEntries(bucketName, prefix);

  for (const entry of entries) {
    if (!entry?.name) continue;
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const isFolder = !entry.id && !entry.metadata;

    if (isFolder) {
      fileCount += await appendStorageBucketToZip({
        zip,
        bucketName,
        prefix: fullPath,
        warnings,
      });
      continue;
    }

    const { data, error } = await supabase.storage.from(bucketName).download(fullPath);
    if (error || !data) {
      warnings.push(`storage_download_failed:${bucketName}/${fullPath}`);
      continue;
    }

    try {
      const arrayBuffer = await data.arrayBuffer();
      zip.file(`storage/${bucketName}/${fullPath}`, Buffer.from(arrayBuffer));
      fileCount += 1;
    } catch (err) {
      warnings.push(`storage_read_failed:${bucketName}/${fullPath}`);
    }
  }

  return fileCount;
};

const buildDbUrlFromInfo = (info) => {
  if (!info?.host || !info?.port || !info?.database || !info?.user) return null;
  const encodedUser = encodeURIComponent(info.user);
  const encodedPassword = encodeURIComponent(info.password || '');
  const authPart = encodedPassword ? `${encodedUser}:${encodedPassword}` : encodedUser;
  return `postgresql://${authPart}@${info.host}:${info.port}/${info.database}`;
};

const runSupabaseDbDump = async ({ outputFile, dataOnly = false, dbUrl = null }) => {
  const args = ['db', 'dump'];
  if (dbUrl) {
    args.push('--db-url', dbUrl);
  } else {
    args.push('--local');
  }
  if (dataOnly) {
    args.push('--data-only');
  }
  args.push('--schema', 'public', '-f', outputFile);
  await runSupabaseCli(args, { timeout: 8 * 60 * 1000 });
};

const buildTransporter = (config) => {
  if (!config.host || config.host === DEFAULT_MAIL_CONFIG.host) {
    throw new Error('Mail configuration incomplete');
  }
  const transporterOptions = {
    host: config.host,
    port: config.port,
    secure: !!config.secure,
  };
  if (config.user && config.pass) {
    transporterOptions.auth = {
      user: config.user,
      pass: config.pass,
    };
  }
  return nodemailer.createTransport(transporterOptions);
};

const buildBoxesHtml = (items, { background = '#e2e8f0', textColor = '#0f172a' } = {}) =>
  items.map((char) => `
    <td style="width:52px;height:66px;border-radius:14px;background:${background};text-align:center;">
      <span style="display:inline-block;font-size:24px;font-weight:600;font-family:'IBM Plex Mono','SFMono-Regular',Menlo,monospace;color:${textColor};line-height:66px;">${escapeHtml(char)}</span>
    </td>
  `).join('');

const buildPasswordBoxHtml = (value, { background = '#e2e8f0', textColor = '#0f172a' } = {}) => `
  <td style="padding:0;">
    <div style="display:inline-block;min-width:360px;padding:24px 32px;border-radius:18px;background:${background};text-align:center;">
      <span style="display:inline-block;font-size:20px;font-weight:600;font-family:'IBM Plex Mono','SFMono-Regular',Menlo,monospace;color:${textColor};letter-spacing:0;">${escapeHtml(value)}</span>
    </div>
  </td>
`;

const sanitizeFilename = (value = '') => {
  const cleaned = String(value)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'document';
};

const sanitizeRelativePath = (value = '') => String(value)
  .replace(/\\/g, '/')
  .replace(/^\/+/, '')
  .replace(/\.\.(\/|$)/g, '');

const resolveSafePath = (baseDir, relativePath) => {
  const normalizedRelative = sanitizeRelativePath(relativePath);
  const target = path.resolve(baseDir, normalizedRelative);
  const normalizedBase = path.resolve(baseDir);
  if (target === normalizedBase || target.startsWith(`${normalizedBase}${path.sep}`)) {
    return target;
  }
  throw new Error(`unsafe_path:${relativePath}`);
};

const ensureParentDir = (filePath) => {
  const parentDir = path.dirname(filePath);
  fs.mkdirSync(parentDir, { recursive: true });
};

const guessContentTypeFromPath = (filePath = '') => {
  const ext = path.extname(filePath || '').toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.pdf':
      return 'application/pdf';
    case '.json':
      return 'application/json';
    case '.txt':
      return 'text/plain';
    case '.csv':
      return 'text/csv';
    case '.sql':
      return 'application/sql';
    default:
      return 'application/octet-stream';
  }
};

const runPsqlQuery = async ({ dbUrl, sql }) => {
  if (!dbUrl || !sql) throw new Error('missing_psql_arguments');
  const client = new PgClient({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
};

const runPsqlFile = async ({ dbUrl, filePath }) => {
  if (!dbUrl || !filePath) throw new Error('missing_psql_arguments');
  const sql = fs.readFileSync(filePath, 'utf-8');
  const client = new PgClient({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
};

const parsePdfDataPayload = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:')) {
    const match = trimmed.match(/^data:([^;]+);base64,(.*)$/s);
    if (!match) return null;
    const contentType = match[1] || 'application/pdf';
    const base64 = match[2];
    try {
      const content = Buffer.from(base64, 'base64');
      if (content.length === 0) return null;
      return { contentType, content, dataUrl: `data:${contentType};base64,${base64}` };
    } catch (_err) {
      return null;
    }
  }

  const base64Candidate = trimmed.replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/=]+$/.test(base64Candidate)) {
    try {
      const content = Buffer.from(base64Candidate, 'base64');
      if (content.length === 0) return null;
      const contentType = 'application/pdf';
      return {
        contentType,
        content,
        dataUrl: `data:${contentType};base64,${content.toString('base64')}`,
      };
    } catch (_err) {
      return null;
    }
  }

  return null;
};

const tryReadLocalStoredPdf = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/')) return null;
  const relative = trimmed.replace(/^\/+/, '');
  const publicRoot = path.resolve(__dirname, '..', 'public');
  const targetPath = path.resolve(publicRoot, relative);
  if (!targetPath.startsWith(publicRoot)) return null;
  if (!fs.existsSync(targetPath)) return null;
  try {
    const content = fs.readFileSync(targetPath);
    if (!content || content.length === 0) return null;
    return {
      contentType: 'application/pdf',
      content,
    };
  } catch (_err) {
    return null;
  }
};

const buildPdfAttachmentFromStoredValue = async (storedValue, baseName) => {
  const parsed = parsePdfDataPayload(storedValue);
  if (parsed) {
    return {
      filename: `${sanitizeFilename(baseName || 'document')}.pdf`,
      content: parsed.content,
      contentType: parsed.contentType || 'application/pdf',
      dataUrl: parsed.dataUrl,
    };
  }

  const local = tryReadLocalStoredPdf(storedValue);
  if (local) {
    return {
      filename: `${sanitizeFilename(baseName || 'document')}.pdf`,
      content: local.content,
      contentType: local.contentType || 'application/pdf',
      dataUrl: `data:${local.contentType || 'application/pdf'};base64,${local.content.toString('base64')}`,
    };
  }

  if (typeof storedValue === 'string' && /^https?:\/\//i.test(storedValue.trim())) {
    try {
      const response = await fetch(storedValue.trim());
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      const content = Buffer.from(arrayBuffer);
      if (content.length === 0) return null;
      const contentType = response.headers.get('content-type') || 'application/pdf';
      return {
        filename: `${sanitizeFilename(baseName || 'document')}.pdf`,
        content,
        contentType,
        dataUrl: `data:${contentType};base64,${content.toString('base64')}`,
      };
    } catch (_err) {
      return null;
    }
  }

  return null;
};

const buildInlineLogoAttachmentFromDataUrl = (dataUrl, cid) => {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) return null;
  const contentType = match[1] || 'image/png';
  const base64 = match[2];
  try {
    const content = Buffer.from(base64, 'base64');
    const ext = inferLogoExtension(contentType);
    return {
      filename: `logo.${ext}`,
      content,
      contentType,
      cid,
      contentDisposition: 'inline',
    };
  } catch (err) {
    return null;
  }
};

const minifyEmailHtml = (html = '') => html
  .replace(/>\s+</g, '><')
  .replace(/\s{2,}/g, ' ')
  .trim();

const renderSimpleDocumentEmail = ({
  greeting,
  docLabel,
  docTitle,
  rental,
  logoUrl,
  companyName,
}) => {
  const reference = formatRentalReference(rental) || docTitle || '';
  const referenceSuffix = reference ? ` (${reference})` : '';
  const headerCompanyName = companyName || 'Open RIG';
  const logoHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="display:block;margin:0 auto 14px;height:170px;max-width:440px;object-fit:contain;" />`
    : '';

  const headerHtml = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td align="center" valign="middle" style="height:230px;">
              ${logoHtml}
              <div style="font-size:16px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;color:#2563eb;">Document ${escapeHtml(headerCompanyName)}</div>
              <div style="margin-top:8px;font-size:32px;font-weight:700;color:#0f172a;">${escapeHtml(docLabel)} prêt</div>
            </td>
          </tr>
        </table>
  `;

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${docLabel} prêt</title>
  </head>
  <body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="padding:24px 12px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:20px 22px;">
        ${headerHtml}
        <div style="height:14px;line-height:14px;">&nbsp;</div>
        <p style="margin:0 0 10px;font-size:18px;color:#475569;">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 12px;font-size:18px;color:#475569;">Votre ${escapeHtml(docLabel.toLowerCase())}${escapeHtml(referenceSuffix)} est en pièce jointe.</p>
        <!-- TEMP: masked until reply system is ready -->
        <div style="display:none;font-size:17px;color:#64748b;">Si vous avez une question, répondez simplement à cet email.</div>
      </div>
    </div>
  </body>
</html>`;
};

const buildDocumentEmailHtml = ({
  greeting,
  docLabel,
  docTitle,
  rental,
  logoUrl,
  companyName,
}) => {
  const html = minifyEmailHtml(renderSimpleDocumentEmail({
    greeting,
    docLabel,
    docTitle,
    rental,
    logoUrl,
    companyName,
  }));
  return { html, mode: 'simple' };
};

const renderApprovalRequestEmail = ({
  greeting,
  docLabel,
  docTitle,
  rental,
  logoUrl,
  companyName,
  approvalUrl,
  verificationCode,
}) => {
  const reference = formatRentalReference(rental) || docTitle || '';
  const referenceSuffix = reference ? ` (${reference})` : '';
  const headerCompanyName = companyName || 'Open RIG';
  const logoHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="display:block;margin:0 auto 14px;height:170px;max-width:440px;object-fit:contain;" />`
    : '';

  const headerHtml = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td align="center" valign="middle" style="height:230px;">
              ${logoHtml}
              <div style="font-size:16px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;color:#2563eb;">Document ${escapeHtml(headerCompanyName)}</div>
              <div style="margin-top:8px;font-size:32px;font-weight:700;color:#0f172a;">${escapeHtml(docLabel)} à valider</div>
            </td>
          </tr>
        </table>
  `;

  const reviewLabel = docLabel.toLowerCase() === 'devis' ? 'Ouvrir la validation du devis' : `Ouvrir la validation du ${docLabel.toLowerCase()}`;
  const legalText = docLabel.toLowerCase() === 'devis'
    ? "Ce devis est valable 30 jours. L'acceptation constitue une signature électronique simple avec traçabilité (date, IP et agent utilisateur)."
    : '';

  const ctaHtml = `
        ${legalText ? `<p style="margin:0 0 16px;font-size:12px;color:#94a3b8;text-align:center;line-height:1.7;">${escapeHtml(legalText)}</p>` : ''}
        <p style="margin:0 0 12px;font-size:14px;color:#334155;text-align:center;line-height:1.6;">
          Code de vérification : <strong style="font-size:18px;letter-spacing:2px;color:#0f172a;">${escapeHtml(verificationCode)}</strong>
        </p>
        <div style="margin:12px 0 18px;text-align:center;">
          <a href="${escapeHtml(approvalUrl)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(reviewLabel)}</a>
        </div>
        <div style="margin:18px auto 14px;height:1px;max-width:360px;background:#e2e8f0;"></div>
        <p style="margin:0 0 6px;font-size:12px;color:#cbd5e1;text-align:center;line-height:1.6;">Si le bouton ne fonctionne pas, utilisez ce lien :</p>
        <p style="margin:0;font-size:12px;color:#cbd5e1;word-break:break-all;text-align:center;line-height:1.6;">
          <a href="${escapeHtml(approvalUrl)}" style="display:block;color:#cbd5e1;text-decoration:underline;">${escapeHtml(approvalUrl)}</a>
        </p>
  `;

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${docLabel} à valider</title>
  </head>
  <body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="padding:24px 12px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:26px 28px;">
        ${headerHtml}
        <div style="height:18px;line-height:18px;">&nbsp;</div>
        <p style="margin:0 0 12px;font-size:18px;color:#475569;line-height:1.6;">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 14px;font-size:18px;color:#475569;line-height:1.6;">Votre ${escapeHtml(docLabel.toLowerCase())}${escapeHtml(referenceSuffix)} est en pièce jointe.</p>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">Merci de confirmer votre choix :</p>
        ${ctaHtml}
      </div>
    </div>
  </body>
</html>`;
};

const buildApprovalRequestEmailHtml = ({
  greeting,
  docLabel,
  docTitle,
  rental,
  logoUrl,
  companyName,
  approvalUrl,
  verificationCode,
}) => {
  const html = minifyEmailHtml(renderApprovalRequestEmail({
    greeting,
    docLabel,
    docTitle,
    rental,
    logoUrl,
    companyName,
    approvalUrl,
    verificationCode,
  }));
  return { html };
};

const renderApprovalResponsePage = ({ title, message, tone = 'blue', legalText = null }) => {
  const accent = tone === 'green'
    ? { bg: '#dcfce7', text: '#166534' }
    : tone === 'red'
      ? { bg: '#fee2e2', text: '#991b1b' }
      : { bg: '#dbeafe', text: '#1d4ed8' };
  const legalHtml = legalText
    ? `<p style="margin:16px 0 0;font-size:12px;color:#94a3b8;line-height:1.6;">${escapeHtml(legalText)}</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="padding:48px 12px;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;text-align:center;">
        <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:${accent.bg};color:${accent.text};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Open RIG</div>
        <h1 style="margin:16px 0 8px;font-size:24px;">${escapeHtml(title)}</h1>
        <p style="margin:0;font-size:15px;color:#475569;line-height:1.6;">${escapeHtml(message)}</p>
        ${legalHtml}
      </div>
    </div>
  </body>
</html>`;
};

const renderPasswordUnlockPage = ({
  requestRow,
  rental,
  company,
  token,
  errorMessage = null,
}) => {
  const ref = formatRentalReference(rental) || rental?.reference_code || null;
  const rentalTitle = rental?.title ? escapeHtml(rental.title) : null;
  const companyName = company?.name ? escapeHtml(company.name) : null;
  const logoUrl = company?.logo_url ? escapeHtml(company.logo_url) : null;
  const safeToken = escapeHtml(token);

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Accès protégé · ${rentalTitle || ref || 'Document'}</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { min-height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #111827; background: #f8fafc; }
      .page { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 16px; }
      .card { width: 100%; max-width: 400px; background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.07); }
      .card-header { padding: 28px 28px 22px; border-bottom: 1px solid #e5e7eb; }
      .brand-row { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
      .brand-logo { height: 28px; max-width: 110px; object-fit: contain; }
      .brand-name { font-size: 14px; font-weight: 700; color: #111827; }
      .project-row { display: flex; align-items: center; gap: 9px; }
      .project-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
      .project-title { font-size: 15px; font-weight: 700; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .project-ref { font-size: 11px; color: #9ca3af; font-family: ui-monospace, monospace; margin-top: 2px; }
      .card-body { padding: 24px 28px 28px; }
      .lock-icon { width: 44px; height: 44px; border-radius: 12px; background: #eff6ff; display: flex; align-items: center; justify-content: center; margin-bottom: 14px; }
      .heading { font-size: 17px; font-weight: 700; color: #111827; margin-bottom: 4px; }
      .sub { font-size: 13px; color: #6b7280; line-height: 1.55; margin-bottom: 18px; }
      .error-box { margin-bottom: 14px; padding: 10px 14px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; font-size: 13px; line-height: 1.5; display: flex; gap: 8px; align-items: flex-start; }
      .error-box svg { flex-shrink: 0; margin-top: 1px; }
      .field-label { display: block; margin: 0 0 6px; font-size: 13px; font-weight: 500; color: #374151; }
      input[type="password"] { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 15px; font-family: inherit; color: #111827; background: #fff; outline: none; transition: border-color .15s, box-shadow .15s; letter-spacing: 2px; }
      input[type="password"]:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.12); }
      .btn { display: flex; width: 100%; margin-top: 14px; padding: 11px 20px; border: none; border-radius: 8px; font-weight: 600; font-size: 14px; font-family: inherit; cursor: pointer; background: #2563eb; color: #fff; align-items: center; justify-content: center; gap: 7px; transition: opacity .15s; }
      .btn:hover { opacity: .88; }
      .footer-note { margin-top: 16px; font-size: 11px; color: #9ca3af; text-align: center; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="card">
        <div class="card-header">
          ${(logoUrl || companyName) ? `
          <div class="brand-row">
            ${logoUrl ? `<img class="brand-logo" src="${logoUrl}" alt="${companyName || ''}" />` : ''}
            ${companyName ? `<span class="brand-name">${companyName}</span>` : ''}
          </div>` : ''}
          <div class="project-row">
            <div>
              ${rentalTitle ? `<div class="project-title">${rentalTitle}</div>` : ''}
              ${ref ? `<div class="project-ref">${escapeHtml(ref)}</div>` : ''}
            </div>
          </div>
        </div>
        <div class="card-body">
          <div class="lock-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div class="heading">Accès protégé</div>
          <p class="sub">Ce document est protégé par un mot de passe. Entrez le mot de passe communiqué par l'émetteur pour y accéder.</p>
          ${errorMessage ? `
          <div class="error-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>${escapeHtml(errorMessage)}</span>
          </div>` : ''}
          <form method="POST" action="/api/rental-documents/approval/${safeToken}/unlock">
            <label class="field-label" for="access_password">Mot de passe</label>
            <input id="access_password" name="access_password" type="password" required autocomplete="current-password" autofocus />
            <button type="submit" class="btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Accéder au document
            </button>
          </form>
          <p class="footer-note">Le mot de passe vous a été communiqué par l'émetteur du document.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
};

const renderApprovalDecisionFormPage = ({
  requestRow,
  rental,
  token,
  errorMessage = null,
  company = null,
}) => {
  const docLabel = requestRow?.doc_type === 'devis'
    ? 'Devis'
    : requestRow?.doc_type === 'facture'
      ? 'Facture'
      : requestRow?.doc_type === 'bon_prepa'
        ? 'Bon de préparation'
        : 'Document';
  const ref = formatRentalReference(rental) || rental?.reference_code || requestRow?.id;
  const codeRequired = Boolean(requestRow?.decision_code_hash);
  const attempts = Number(requestRow?.decision_attempts || 0);
  const attemptsLeft = Math.max(0, APPROVAL_MAX_ATTEMPTS - attempts);
  const expiresAt = requestRow?.expires_at ? new Date(requestRow.expires_at) : null;
  const expiresLabel = expiresAt && Number.isFinite(expiresAt.getTime())
    ? expiresAt.toLocaleString('fr-FR')
    : null;
  const safeToken = escapeHtml(token);

  const rentalTitle = rental?.title ? escapeHtml(rental.title) : null;
  const rentalType = rental?.type === 'service' ? 'Prestation' : rental?.type === 'sale' ? 'Vente' : rental?.type === 'rental' ? 'Location' : null;
  const rentalColor = (typeof rental?.color === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(rental.color)) ? rental.color : '#2563eb';
  const clientName = (rental?.clients?.name || rental?.client_name) ? escapeHtml(rental?.clients?.name || rental?.client_name) : null;
  const location = rental?.location ? escapeHtml(rental.location) : null;

  const fmtDate = (val) => {
    if (!val) return null;
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const startDate = fmtDate(rental?.start_date);
  const endDate = fmtDate(rental?.end_date);
  const dateRange = startDate && endDate && startDate !== endDate
    ? `${startDate} → ${endDate}`
    : startDate || null;

  const companyName = company?.name ? escapeHtml(company.name) : null;
  const logoUrl = company?.logo_url ? escapeHtml(company.logo_url) : null;

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(docLabel)}${ref ? ` · ${escapeHtml(ref)}` : ''} · Validation</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #111827; background: #f8fafc; }
      .layout { display: flex; height: 100vh; }

      /* PDF panel */
      .pdf-panel { flex: 1; background: #e2e8f0; position: relative; min-width: 0; }
      .pdf-panel iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: none; display: block; }

      /* Right panel */
      .form-panel { width: 440px; min-width: 340px; background: #ffffff; border-left: 1px solid #e5e7eb; overflow-y: auto; display: flex; flex-direction: column; flex-shrink: 0; }

      /* Brand header */
      .brand-header { padding: 20px 28px 18px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 12px; background: #fff; }
      .brand-logo { height: 32px; max-width: 120px; object-fit: contain; flex-shrink: 0; }
      .brand-name { font-size: 15px; font-weight: 700; color: #111827; letter-spacing: -0.01em; }
      .brand-sep { flex: 1; }
      .secure-badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 600; letter-spacing: 0.03em; white-space: nowrap; }
      .secure-badge svg { flex-shrink: 0; }

      /* Project card */
      .project-card { margin: 20px 28px 0; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; }
      .project-card-header { padding: 14px 16px 12px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; display: flex; align-items: flex-start; gap: 10px; }
      .project-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
      .project-meta { flex: 1; min-width: 0; }
      .project-title { font-size: 15px; font-weight: 700; color: #111827; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .project-ref { font-size: 12px; color: #6b7280; margin-top: 2px; font-family: ui-monospace, monospace; }
      .type-chip { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; background: #f3f4f6; color: #374151; white-space: nowrap; }
      .project-card-body { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
      .info-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #374151; }
      .info-row svg { flex-shrink: 0; color: #9ca3af; }

      /* Doc label */
      .doc-section { padding: 18px 28px 0; }
      .doc-label-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
      .doc-icon { width: 36px; height: 36px; border-radius: 8px; background: #eff6ff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .doc-title { font-size: 16px; font-weight: 700; color: #111827; }
      .doc-sub { font-size: 12px; color: #6b7280; line-height: 1.5; }
      ${expiresLabel ? `.expires-row { margin-top: 6px; font-size: 12px; color: #6b7280; }` : ''}

      /* Error */
      .error-box { margin: 14px 28px 0; padding: 10px 14px; border-radius: 10px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; font-size: 13px; line-height: 1.5; display: flex; gap: 8px; align-items: flex-start; }
      .error-box svg { flex-shrink: 0; margin-top: 1px; }

      /* Form */
      .form-section { padding: 18px 28px 24px; flex: 1; }
      .form-heading { font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 14px; }
      .form-group { margin-bottom: 14px; }
      .field-label { display: block; margin: 0 0 5px; font-size: 13px; font-weight: 500; color: #374151; }
      input[type="text"] { width: 100%; padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; font-family: inherit; color: #111827; background: #fff; outline: none; transition: border-color .15s, box-shadow .15s; }
      input[type="text"]:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.12); }
      .code-input { letter-spacing: 5px; font-size: 20px; text-align: center; font-weight: 700; }
      .attempts-note { margin: 5px 0 0; font-size: 12px; color: #6b7280; }
      .consent-row { display: flex; align-items: flex-start; gap: 9px; margin: 0 0 18px; font-size: 13px; color: #374151; line-height: 1.55; }
      .consent-row input[type="checkbox"] { margin-top: 2px; flex-shrink: 0; width: 15px; height: 15px; cursor: pointer; accent-color: #2563eb; }
      .btn-row { display: flex; gap: 8px; }
      .btn { flex: 1; padding: 10px 16px; border: none; border-radius: 8px; font-weight: 600; font-size: 14px; font-family: inherit; cursor: pointer; transition: opacity .15s, transform .1s; display: flex; align-items: center; justify-content: center; gap: 6px; }
      .btn:hover { opacity: .88; }
      .btn:active { transform: scale(.98); }
      .btn-accept { background: #16a34a; color: #fff; }
      .btn-refuse { background: #fff; color: #dc2626; border: 1.5px solid #fca5a5; }
      .btn-refuse:hover { background: #fef2f2; opacity: 1; }
      .btn-mod { background: #fff; color: #d97706; border: 1.5px solid #fcd34d; flex: none; padding: 10px 14px; }
      .btn-mod:hover { background: #fffbeb; opacity: 1; }
      .btn-mod-submit { background: #d97706; color: #fff; width: 100%; margin-top: 10px; }
      .mod-section { margin-top: 14px; padding: 14px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 10px; }
      .mod-section-label { font-size: 13px; font-weight: 600; color: #92400e; margin-bottom: 8px; }
      textarea.mod-textarea { width: 100%; padding: 9px 12px; border: 1px solid #fcd34d; border-radius: 8px; font-size: 13px; font-family: inherit; color: #111827; background: #fff; outline: none; resize: vertical; min-height: 80px; transition: border-color .15s, box-shadow .15s; }
      textarea.mod-textarea:focus { border-color: #d97706; box-shadow: 0 0 0 3px rgba(217,119,6,.12); }

      /* Footer */
      .form-footer { padding: 12px 28px 20px; border-top: 1px solid #e5e7eb; }
      .footer-note { font-size: 11px; color: #9ca3af; line-height: 1.5; display: flex; gap: 6px; align-items: flex-start; }
      .footer-note svg { flex-shrink: 0; margin-top: 1px; }

      @media (max-width: 860px) {
        .layout { flex-direction: column; }
        .pdf-panel { height: 45vh; flex: none; }
        .form-panel { width: 100%; min-width: 0; border-left: none; border-top: 1px solid #e5e7eb; }
      }
    </style>
  </head>
  <body>
    <div class="layout">
      <div class="pdf-panel">
        <iframe src="/api/rental-documents/approval/${safeToken}/pdf" title="${escapeHtml(docLabel)}" loading="lazy"></iframe>
      </div>
      <div class="form-panel">

        <!-- Brand header -->
        <div class="brand-header">
          ${logoUrl ? `<img class="brand-logo" src="${logoUrl}" alt="${companyName || ''}" />` : ''}
          ${companyName ? `<span class="brand-name">${companyName}</span>` : ''}
          <span class="brand-sep"></span>
          <span class="secure-badge">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Sécurisé
          </span>
        </div>

        <!-- Project card -->
        <div class="project-card" style="margin:20px 28px 0;">
          <div class="project-card-header">
            <div class="project-dot" style="background:${rentalColor};"></div>
            <div class="project-meta">
              ${rentalTitle ? `<div class="project-title">${rentalTitle}</div>` : ''}
              ${ref ? `<div class="project-ref">${escapeHtml(ref)}</div>` : ''}
            </div>
            ${rentalType ? `<span class="type-chip">${rentalType}</span>` : ''}
          </div>
          ${(dateRange || clientName || location) ? `
          <div class="project-card-body">
            ${dateRange ? `
            <div class="info-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span>${escapeHtml(dateRange)}</span>
            </div>` : ''}
            ${clientName ? `
            <div class="info-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span>${clientName}</span>
            </div>` : ''}
            ${location ? `
            <div class="info-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>${location}</span>
            </div>` : ''}
          </div>` : ''}
        </div>

        <!-- Doc label -->
        <div class="doc-section" style="margin-top:18px;">
          <div class="doc-label-row">
            <div class="doc-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <div>
              <div class="doc-title">${escapeHtml(docLabel)}</div>
              <div class="doc-sub">Merci d'indiquer votre décision ci-dessous.</div>
            </div>
          </div>
          ${expiresLabel ? `<p class="expires-row">Lien valide jusqu'au <strong>${escapeHtml(expiresLabel)}</strong></p>` : ''}
        </div>

        <!-- Error -->
        ${errorMessage ? `
        <div class="error-box">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>${escapeHtml(errorMessage)}</span>
        </div>` : ''}

        <!-- Form -->
        <div class="form-section">
          <p class="form-heading">Votre décision</p>
          <form method="POST" action="/api/rental-documents/approval/${safeToken}/decision">
            <div class="form-group">
              <label class="field-label" for="signer_name">Nom et prénom</label>
              <input id="signer_name" name="signer_name" type="text" required minlength="2" maxlength="120" autocomplete="name" placeholder="Jean Dupont" />
            </div>

            ${codeRequired ? `
            <div class="form-group">
              <label class="field-label" for="verification_code">Code de vérification (reçu par email)</label>
              <input id="verification_code" name="verification_code" type="text" required inputmode="numeric" pattern="\\d{${APPROVAL_CODE_LENGTH}}" maxlength="${APPROVAL_CODE_LENGTH}" class="code-input" placeholder="${'·'.repeat(APPROVAL_CODE_LENGTH)}" />
              <p class="attempts-note">Tentatives restantes : ${attemptsLeft}</p>
            </div>` : ''}

            <label class="consent-row" id="consent-row">
              <input type="checkbox" name="consent_ack" value="1" required id="consent-checkbox" />
              <span>Je confirme être habilité(e) à répondre à ce ${escapeHtml(docLabel.toLowerCase())} et j'accepte que cette réponse vaille signature électronique simple.</span>
            </label>

            <div class="btn-row">
              <button type="submit" name="decision" value="accept" class="btn btn-accept">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Accepter
              </button>
              <button type="button" class="btn btn-mod" onclick="toggleModSection()" id="mod-toggle-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Modifier
              </button>
              <button type="submit" name="decision" value="refuse" class="btn btn-refuse">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Refuser
              </button>
            </div>

            <div class="mod-section" id="mod-section" style="display:none">
              <p class="mod-section-label">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-2px;margin-right:4px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Décrivez les modifications souhaitées
              </p>
              <textarea class="mod-textarea" name="modification_comment" id="mod-comment" rows="4" placeholder="Ex : Veuillez corriger le tarif du poste X, modifier les dates..."></textarea>
              <button type="submit" name="decision" value="modification" class="btn btn-mod-submit">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                Envoyer la demande de modification
              </button>
            </div>
          </form>
          <script>
            function toggleModSection() {
              var section = document.getElementById('mod-section');
              var consent = document.getElementById('consent-row');
              var checkbox = document.getElementById('consent-checkbox');
              var btn = document.getElementById('mod-toggle-btn');
              var open = section.style.display !== 'none';
              section.style.display = open ? 'none' : 'block';
              if (open) {
                consent.style.display = '';
                checkbox.required = true;
                btn.style.background = '';
                btn.style.color = '';
              } else {
                consent.style.display = 'none';
                checkbox.required = false;
                checkbox.checked = false;
                btn.style.background = '#fffbeb';
                btn.style.color = '#d97706';
                document.getElementById('mod-comment').focus();
              }
            }
          </script>
        </div>

        <!-- Footer -->
        <div class="form-footer">
          <p class="footer-note">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Cette action est horodatée et journalisée (adresse IP, agent utilisateur). Elle constitue une preuve de décision électronique.
          </p>
        </div>

      </div>
    </div>
  </body>
</html>`;
};

const insertRentalActivityLog = async ({ rentalId, actorName, action, details, metadata }) => {
  if (!isSupabaseReady()) return;
  if (!rentalId) return;
  try {
    await supabase.from('rental_activity_logs').insert([{
      rental_id: rentalId,
      actor_id: null,
      actor_name: actorName || 'Client',
      action,
      details: details || null,
      metadata: metadata || null,
    }]);
  } catch (err) {
    console.warn('[rental-activity-log] insert error', err);
  }
};

const notifyQuoteDecision = async ({ rental, decision, actorName, requestId, respondedAt, modificationComment = null }) => {
  if (!isSupabaseReady()) return;
  if (!rental?.id) return;

  try {
    const { data: permissionRows, error: permissionErr } = await supabase
      .from('app_permissions')
      .select('user_id')
      .or([
        'superadmin.eq.true',
        'can_manage_notifications.eq.true',
        'rn_view_menu.eq.true',
        'rn_view_list.eq.true',
        'rn_view_detail.eq.true',
        'rn_change_status.eq.true',
        'rn_accept_service.eq.true',
        'rn_refuse_service.eq.true',
      ].join(','));

    if (permissionErr) {
      console.warn('[quote-decision-notification] permissions error', permissionErr);
      return;
    }

    const recipientIds = [...new Set(
      (permissionRows || [])
        .map((row) => (typeof row?.user_id === 'string' ? row.user_id : null))
        .filter(Boolean),
    )];

    if (recipientIds.length === 0) return;

    const isModification = decision === 'modification';
    const accepted = decision === 'accept';
    const rentalRef = formatRentalReference(rental);
    const actor = sanitizeNullableString(actorName) || 'Le client';
    const decisionLabel = isModification ? 'demandé des modifications sur' : accepted ? 'accepté' : 'refusé';
    const rentalTypeLabel = rental?.type === 'service'
      ? 'prestation'
      : rental?.type === 'sale'
        ? 'vente'
        : 'location';

    const message = rentalRef
      ? `${actor} a ${decisionLabel} le devis ${rentalRef}.${isModification && modificationComment ? ` — « ${modificationComment} »` : ''}`
      : `${actor} a ${decisionLabel} un devis.`;

    const metadata = {
      rentalId: rental.id,
      rentalType: rentalTypeLabel,
      decision: isModification ? 'modification_requested' : accepted ? 'accepted' : 'refused',
      requestId: requestId || null,
      respondedAt: respondedAt || null,
      actorName: actor,
      ...(isModification && modificationComment ? { modificationComment } : {}),
    };

    const payload = recipientIds.map((recipientId) => ({
      type: 'rental',
      title: isModification ? 'Modification demandée par le client' : accepted ? 'Devis accepté par le client' : 'Devis refusé par le client',
      message,
      action_url: `/rentals/${rental.id}`,
      action_label: 'Ouvrir la fiche',
      avatar: null,
      metadata,
      recipient_id: recipientId,
    }));

    const { error: insertErr } = await supabase.from('notifications').insert(payload);
    if (insertErr) {
      console.warn('[quote-decision-notification] insert error', insertErr);
    }
  } catch (err) {
    console.warn('[quote-decision-notification] unexpected error', err);
  }
};

const renderBrandEmail = ({ headline, subtitle, boxesHtml, footerLine, note, eyebrow = 'Sécurité du compte', bodyHtml, logoUrl }) => {
  const footerHtml = footerLine ? `
                  <tr>
                    <td style="padding-top:24px;text-align:center;">
                      <p style="margin:0;color:#0f172a;font-size:16px;font-weight:600;display:block !important;">${footerLine}</p>
                      ${note ? `<p style="margin:12px 0 0;color:#475569;font-size:13px;line-height:1.7;display:block !important;mso-line-height-rule:exactly;">${note}</p>` : ''}
                    </td>
                  </tr>` : '';
  const boxesSection = `
                  <tr>
                    <td align="center">
                      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:12px;">
                        <tr>${boxesHtml || ''}</tr>
                      </table>
                    </td>
                  </tr>
                  ${footerHtml}`;
  const contentHtml = bodyHtml || `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${boxesSection}
                </table>`;
  const finalHtml = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${headline}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:'Inter',Arial,sans-serif;color:#0f172a;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f1f5f9;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="640" style="max-width:640px;border-radius:32px;overflow:hidden;box-shadow:0 28px 60px rgba(15,23,42,0.18);">
            <tr>
              <td style="background:#2563eb;text-align:center;padding:56px 40px 44px;">
                ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="display:block;margin:0 auto 18px;height:40px;max-width:180px;object-fit:contain;" />` : ''}
                <p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#ffffff;font-weight:600;display:block !important;">${eyebrow}</p>
                <h1 style="margin:12px auto 10px;font-size:30px;line-height:1.3;font-weight:600;color:#ffffff;display:block !important;">${headline}</h1>
                <p style="margin:0 auto;color:#ffffff;font-size:14px;line-height:1.6;max-width:360px;display:block !important;mso-line-height-rule:exactly;">
                  ${subtitle}
                </p>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;padding:48px 40px 44px;">
                ${contentHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return finalHtml;
};

const formatDocumentDate = (value) => {
  if (!value) return null;
  try {
    const date = new Date(value);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return null;
  }
};

const formatDocumentRange = (start, end) => {
  const startLabel = formatDocumentDate(start);
  const endLabel = formatDocumentDate(end);
  if (startLabel && endLabel) {
    return startLabel === endLabel ? startLabel : `${startLabel} → ${endLabel}`;
  }
  return startLabel || endLabel || null;
};

const formatDocumentCurrency = (value) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
};

const formatRentalReference = (rental) => {
  const raw = typeof rental?.reference_code === 'string' ? rental.reference_code.trim() : '';
  if (raw) return raw;
  if (typeof rental?.id === 'string' && rental.id.trim()) {
    return rental.id.trim().slice(0, 6).toUpperCase();
  }
  return null;
};

const formatRentalStatus = (value) => {
  const map = {
    pending: 'En attente',
    confirmed: 'Confirmée',
    preparing: 'Préparation',
    in_progress: 'En cours',
    delivered: 'Livrée',
    return_delivery: 'Livraison retour',
    in_return: 'En retour',
    returned: 'Retournée',
    completed: 'Terminée',
    paid: 'Payée',
    cancelled: 'Annulée',
    archived: 'Archivée',
  };
  return map[value] || (value ? String(value) : null);
};

const truncateDocumentText = (value, max = 160) => {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 3)}...`;
};

const renderDocumentEmailBody = ({
  greeting,
  rentalTypeLabel,
  docLabel,
  docTitle,
  rental,
  items,
  mode = 'full',
}) => {
  const reference = formatRentalReference(rental) || docTitle;
  const statusLabel = formatRentalStatus(rental?.status);
  const isCompact = mode !== 'full';
  const maxValueLength = mode === 'tiny' ? 60 : (isCompact ? 90 : 140);
  const safeValue = (value) => truncateDocumentText(value, maxValueLength);
  const description = mode === 'full' ? truncateDocumentText(rental?.description, 160) : null;
  const notes = mode === 'full' ? truncateDocumentText(rental?.notes, 160) : null;
  const totalItems = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const itemsLabel = items.length > 0
    ? `${totalItems} unité${totalItems > 1 ? 's' : ''} • ${items.length} ligne${items.length > 1 ? 's' : ''}`
    : null;
  const rows = [
    reference ? { label: 'Référence', value: reference } : null,
    rental?.title ? { label: 'Objet', value: safeValue(rental.title) } : null,
    (rental?.clients?.name || rental?.client_name) ? { label: 'Client', value: safeValue(rental?.clients?.name || rental?.client_name) } : null,
    rentalTypeLabel ? { label: 'Type', value: rentalTypeLabel } : null,
    statusLabel ? { label: 'Statut', value: statusLabel } : null,
    rental?.start_date || rental?.end_date ? { label: 'Dates', value: formatDocumentRange(rental?.start_date, rental?.end_date) } : null,
    rental?.location ? { label: 'Lieu', value: safeValue(rental.location) } : null,
    !isCompact && rental?.delivery_address ? { label: 'Adresse livraison', value: safeValue(rental.delivery_address) } : null,
    !isCompact && rental?.pickup_address ? { label: 'Adresse retrait', value: safeValue(rental.pickup_address) } : null,
    itemsLabel ? { label: 'Articles', value: itemsLabel } : null,
    rental?.total_price != null ? { label: 'Montant', value: formatDocumentCurrency(rental.total_price) } : null,
    description ? { label: 'Description', value: description } : null,
    notes ? { label: 'Notes', value: notes } : null,
  ].filter((row) => row && row.value);

  const summaryRowsHtml = rows.map((row) => `
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;width:32%;">${escapeHtml(row.label)}</td>
          <td style="padding:6px 0;color:#0f172a;font-size:15px;font-weight:600;line-height:1.5;">${escapeHtml(row.value)}</td>
        </tr>
  `).join('');

  const MAX_ITEMS = mode === 'full' ? 10 : (mode === 'compact' ? 6 : 0);
  const displayItems = items.slice(0, MAX_ITEMS);
  const remaining = Math.max(0, items.length - displayItems.length);
  const itemRowsHtml = displayItems.map((item, index) => {
    const isLast = index === displayItems.length - 1 && remaining === 0;
    return `
        <tr>
          <td style="padding:10px 0;border-bottom:${isLast ? '0' : '1px solid #e2e8f0'};color:#0f172a;font-size:14px;line-height:1.5;">
            <span style="display:inline-block;min-width:40px;font-weight:600;color:#0f172a;">${escapeHtml(String(item.quantity))}×</span>
            <span>${escapeHtml(truncateDocumentText(item.name, 70) || item.name)}</span>
          </td>
        </tr>
    `;
  }).join('');

  const remainingRowHtml = remaining > 0 && MAX_ITEMS > 0 ? `
        <tr>
          <td style="padding-top:10px;color:#64748b;font-size:13px;line-height:1.5;">Et ${remaining} autre(s) article(s)…</td>
        </tr>
  ` : '';

  const itemsSectionHtml = items.length > 0 && MAX_ITEMS > 0 ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:22px;">
        <tr>
          <td style="padding:0 0 10px;font-size:15px;font-weight:700;color:#0f172a;">Matériel</td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;">
        <tr>
          <td style="padding:12px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              ${itemRowsHtml}
              ${remainingRowHtml}
            </table>
          </td>
        </tr>
      </table>
  ` : '';

  const cardHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:24px;">
        <tr>
          <td style="padding:28px 30px;">
            <p style="margin:0 0 18px;font-size:17px;font-weight:700;color:#0f172a;">Résumé de la ${escapeHtml(rentalTypeLabel?.toLowerCase() || 'prestation')}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              ${summaryRowsHtml}
            </table>
            ${itemsSectionHtml}
          </td>
        </tr>
      </table>
  `;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-bottom:18px;">
          <p style="margin:0 0 8px;font-size:16px;line-height:1.6;color:#0f172a;font-weight:600;">${escapeHtml(greeting)}</p>
          <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">Vous trouverez votre ${escapeHtml(docLabel.toLowerCase())} en pièce jointe. Voici le résumé de la ${escapeHtml(rentalTypeLabel?.toLowerCase() || 'prestation')} :</p>
        </td>
      </tr>
      <tr>
        <td>
          ${cardHtml}
        </td>
      </tr>
      <tr>
        <td style="padding-top:18px;">
          <p style="margin:0;font-size:13px;line-height:1.7;color:#475569;">Si vous avez une question, répondez simplement à cet email.</p>
        </td>
      </tr>
    </table>
  `;
};

const generatePassword = (length = 12) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@$!?';
  const buffer = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i += 1) {
    password += chars[buffer[i] % chars.length];
  }
  return password;
};

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ extended: false }));

// Serve static files from public (so /cms/... is accessible)
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/system/database-info', (req, res) => {
  try {
    res.json(readDatabaseInfo());
  } catch (err) {
    console.error('[database-info] get error', err);
    res.status(500).json({ error: 'Unable to read database info' });
  }
});

app.put('/api/system/database-info', (req, res) => {
  try {
    const saved = writeDatabaseInfo(req.body || {});
    res.json(saved);
  } catch (err) {
    console.error('[database-info] put error', err);
    res.status(500).json({ error: 'Unable to persist database info' });
  }
});

app.get('/api/system/database-connection-status', (req, res) => {
  try {
    const stored = readSupabaseCredentials({ includeKey: false });
    res.json({
      configured: Boolean(supabase),
      supabaseUrl: supabaseConfig.supabaseUrl || stored?.supabaseUrl || '',
      savedAt: supabaseConfig.savedAt || stored?.savedAt || null,
      source: supabaseConfig.source || (stored ? 'file' : 'none'),
      hasServiceRoleKey: Boolean(supabaseConfig.serviceRoleKey || stored?.hasServiceRoleKey),
      hasAnonKey: Boolean(supabaseConfig.anonKey || stored?.hasAnonKey),
    });
  } catch (err) {
    console.error('[supabase-credentials] status error', err);
    res.status(500).json({ error: 'Unable to read Supabase configuration' });
  }
});

app.get('/api/system/connect-existing-supabase/start', (req, res) => {
  const redirectUrl = process.env.SUPABASE_CONNECT_URL || 'https://supabase.com/dashboard/projects';
  res.json({ ok: true, redirectUrl });
});

app.post('/api/system/connect-existing-supabase', async (req, res) => {
  const supabaseUrlInput = typeof req.body?.supabaseUrl === 'string' ? req.body.supabaseUrl.trim() : '';
  const anonKeyInput = typeof req.body?.anonKey === 'string' ? req.body.anonKey.trim() : '';
  const serviceRoleKeyInput = typeof req.body?.serviceRoleKey === 'string' ? req.body.serviceRoleKey.trim() : '';
  const skipVerification = req.body?.skipVerification === true;

  let normalizedUrl = '';
  let anonKey = '';
  let serviceRoleKey = '';
  let configSource = 'body';
  let savedAtHint = null;

  const hasAnyDirectInput = Boolean(supabaseUrlInput || anonKeyInput || serviceRoleKeyInput);

  if (hasAnyDirectInput) {
    if (!supabaseUrlInput) {
      return res.status(400).json({ ok: false, error: 'missing_supabase_url' });
    }
    if (!anonKeyInput) {
      return res.status(400).json({ ok: false, error: 'missing_anon_key' });
    }
    if (!serviceRoleKeyInput) {
      return res.status(400).json({ ok: false, error: 'missing_service_role_key' });
    }
    normalizedUrl = supabaseUrlInput;
    anonKey = anonKeyInput;
    serviceRoleKey = serviceRoleKeyInput;
  } else {
    const storedWithKey = readSupabaseCredentials({ includeKey: true }) || initialSupabaseConfig;
    if (storedWithKey?.supabaseUrl && storedWithKey?.serviceRoleKey && storedWithKey?.anonKey) {
      normalizedUrl = storedWithKey.supabaseUrl;
      anonKey = storedWithKey.anonKey;
      serviceRoleKey = storedWithKey.serviceRoleKey;
      configSource = storedWithKey.source || (initialSupabaseConfig ? initialSupabaseConfig.source || 'env' : 'stored');
      savedAtHint = storedWithKey.savedAt || null;
    }

    if (!normalizedUrl || !serviceRoleKey || !anonKey) {
      return res.status(400).json({ ok: false, error: 'no_credentials' });
    }
  }

  try {
    const parsed = new URL(normalizedUrl);
    normalizedUrl = parsed.origin;
  } catch (err) {
    return res.status(400).json({ ok: false, error: 'invalid_supabase_url' });
  }

  if (!/https:\/\/.+\.supabase\.co$/i.test(normalizedUrl)) {
    return res.status(400).json({ ok: false, error: 'invalid_supabase_domain' });
  }

  const claims = decodeJwtPayload(serviceRoleKey);
  if (!claims || claims.role !== 'service_role') {
    return res.status(400).json({ ok: false, error: 'invalid_service_role_key' });
  }

  let checks = [];
  if (!skipVerification) {
    const testClient = createClient(normalizedUrl, serviceRoleKey, { auth: { persistSession: false } });

    try {
      const evaluation = await evaluateSupabaseStructure(testClient);
      checks = evaluation.checks || [];
      if (evaluation.reason === 'unauthorized') {
        const message = evaluation.error?.message || 'Invalid Supabase credentials';
        return res.status(401).json({ ok: false, error: 'invalid_credentials', details: message });
      }
      if (!evaluation.ok) {
        return res.status(400).json({ ok: false, reason: 'structure', checks });
      }
    } catch (err) {
      console.error('[supabase-connect] verification error', err);
      return res.status(500).json({ ok: false, error: 'verification_failed', details: err.message });
    }
  }

  try {
    let persisted = null;
    if (hasAnyDirectInput) {
      persisted = writeSupabaseCredentials({ supabaseUrl: normalizedUrl, serviceRoleKey, anonKey });
      configSource = 'file';
      savedAtHint = persisted.savedAt;
    }

    const finalSavedAt = savedAtHint || new Date().toISOString();

    applySupabaseConfig({
      supabaseUrl: normalizedUrl,
      serviceRoleKey,
      anonKey,
      source: configSource,
      savedAt: finalSavedAt,
    });

    updateEnvFileWithSupabaseConfig({
      supabaseUrl: normalizedUrl,
      serviceRoleKey,
      anonKey,
    });

    await refreshSupabaseHealth();

    return res.json({
      ok: true,
      supabaseUrl: normalizedUrl,
      savedAt: finalSavedAt,
      source: configSource,
      hasAnonKey: Boolean(anonKey),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      checks,
      verified: !skipVerification,
    });
  } catch (err) {
    console.error('[supabase-connect] persist error', err);
    return res.status(500).json({ ok: false, error: 'persist_failed', details: err.message });
  }
});

app.get('/api/system/initial-admin/status', async (req, res) => {
  try {
    if (!isSupabaseReady()) {
      return res.json({ configured: false, hasUsers: false });
    }
    const { count, error } = await supabase
      .from('app_users')
      .select('id', { count: 'exact', head: true });
    if (error) {
      const message = typeof error?.message === 'string' ? error.message : '';
      if (/fetch failed/i.test(message)) {
        return res.json({ configured: false, hasUsers: false, error: 'unreachable' });
      }
      console.error('[initial-admin/status] count error', error);
      return res.status(500).json({ configured: true, hasUsers: false, error: 'count_failed' });
    }
    return res.json({ configured: true, hasUsers: typeof count === 'number' && count > 0 });
  } catch (err) {
    console.error('[initial-admin/status] unexpected error', err);
    return res.status(500).json({ configured: false, hasUsers: false, error: 'unexpected' });
  }
});

app.post('/api/system/initial-admin', async (req, res) => {
  try {
    if (!isSupabaseReady()) {
      return res.status(503).json({ ok: false, error: 'supabase_not_configured' });
    }

    const { fullName, email, password } = req.body || {};
    const trimmedName = typeof fullName === 'string' ? fullName.trim() : '';
    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const rawPassword = typeof password === 'string' ? password : '';

    if (!trimmedName || !trimmedEmail || !rawPassword) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return res.status(400).json({ ok: false, error: 'invalid_email' });
    }
    if (rawPassword.length < 8) {
      return res.status(400).json({ ok: false, error: 'password_too_short' });
    }

    const normalizedEmail = trimmedEmail.toLowerCase();

    const { count, error: countErr } = await supabase
      .from('app_users')
      .select('id', { count: 'exact', head: true });
    if (countErr) {
      console.error('[initial-admin] count error', countErr);
      return res.status(500).json({ ok: false, error: 'status_check_failed' });
    }
    if (typeof count === 'number' && count > 0) {
      return res.status(409).json({ ok: false, error: 'admin_already_exists' });
    }

    const { data: rpcData, error: createErr } = await supabase.rpc('create_user', {
      p_email: normalizedEmail,
      p_full_name: trimmedName,
      p_password: rawPassword,
      p_role: 'admin',
      p_job_title: 'Administrateur',
    });
    if (createErr) {
      console.error('[initial-admin] create_user error', createErr);
      return res.status(500).json({ ok: false, error: 'create_user_failed' });
    }

    const userId = Array.isArray(rpcData)
      ? rpcData[0]
      : rpcData;
    if (!userId || (typeof userId !== 'string' && typeof userId !== 'object')) {
      console.error('[initial-admin] unexpected RPC payload', rpcData);
      return res.status(500).json({ ok: false, error: 'create_user_failed' });
    }
    const userUuid = typeof userId === 'string' ? userId : userId?.id ?? null;
    if (!userUuid || !UUID_REGEX.test(userUuid)) {
      console.error('[initial-admin] invalid user id', rpcData);
      return res.status(500).json({ ok: false, error: 'create_user_failed' });
    }

    const nowIso = new Date().toISOString();
    const { error: userUpdateErr } = await supabase
      .from('app_users')
      .update({
        must_change_password: false,
        password_changed_at: nowIso,
        full_name: trimmedName,
        email: normalizedEmail,
      })
      .eq('id', userUuid);
    if (userUpdateErr) {
      console.error('[initial-admin] update user error', userUpdateErr);
      return res.status(500).json({ ok: false, error: 'user_update_failed' });
    }

    let existingPermissions = null;
    const { data: existingPermRow, error: fetchPermErr } = await supabase
      .from('app_permissions')
      .select('*')
      .eq('user_id', userUuid)
      .maybeSingle();
    if (fetchPermErr) {
      console.error('[initial-admin] permission fetch error', fetchPermErr);
    } else {
      existingPermissions = existingPermRow;
    }

    const permissionPayload = buildSuperadminPermissionsPayload(existingPermissions);
    const { error: permUpsertErr } = await supabase
      .from('app_permissions')
      .upsert({ user_id: userUuid, ...permissionPayload }, { onConflict: 'user_id' });
    if (permUpsertErr) {
      console.error('[initial-admin] permission update error', permUpsertErr);
      return res.status(500).json({ ok: false, error: 'permission_update_failed' });
    }

    return res.json({ ok: true, userId: userUuid });
  } catch (err) {
    console.error('[initial-admin] unexpected error', err);
    return res.status(500).json({ ok: false, error: 'unexpected_error' });
  }
});

app.get('/api/system/company-setup', async (req, res) => {
  if (!isSupabaseReady()) {
    return res.status(503).json({ ok: false, error: 'supabase_not_ready' });
  }

  try {
    const { data, error } = await supabase
      .from('company_settings')
      .select('name, legal_name, email, phone, address, about, logo_url')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const response = {
      name: data?.name || '',
      legalName: data?.legal_name || '',
      email: data?.email || '',
      phone: data?.phone || '',
      address: data?.address || '',
      about: data?.about || '',
      logoUrl: data?.logo_url || null,
    };

    return res.json({ ok: true, saved: Boolean(response.name && response.email), data: response });
  } catch (err) {
    console.error('[company-setup] fetch error', err);
    return res.status(500).json({
      ok: false,
      error: 'fetch_failed',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

const extractStoragePathFromUrl = (url) => {
  if (typeof url !== 'string') return null;
  const matcher = new RegExp(`/storage/v1/object/public/${escapeRegExp(COMPANY_LOGO_BUCKET)}/(.+)$`);
  const match = url.match(matcher);
  return match ? match[1] : null;
};

const inferImageContentType = (source = '') => {
  const lower = source.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.webp')) return 'image/webp';
  return '';
};

const normalizeImageContentType = (contentType = '', fallbackSource = '') => {
  if (contentType.startsWith('image/')) return contentType;
  const inferred = inferImageContentType(fallbackSource);
  return inferred || 'image/png';
};

const bufferToDataUrl = (buffer, contentType = 'image/png') =>
  `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`;

const getCompanyLogoDataUrl = async () => {
  if (!isSupabaseReady()) return null;
  const { data, error } = await supabase
    .from('company_settings')
    .select('logo_url')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  const logoUrl = data?.logo_url || null;
  if (!logoUrl) return null;
  if (typeof logoUrl === 'string' && logoUrl.startsWith('data:')) {
    return logoUrl;
  }

  const storagePath = extractStoragePathFromUrl(logoUrl);
  if (storagePath) {
    const { data: file, error: downloadErr } = await supabase.storage
      .from(COMPANY_LOGO_BUCKET)
      .download(storagePath);
    if (downloadErr) throw downloadErr;
    const arrayBuffer = await file.arrayBuffer();
    const contentType = normalizeImageContentType(file.type || '', storagePath);
    return bufferToDataUrl(arrayBuffer, contentType);
  }

  const response = await fetch(logoUrl);
  if (!response.ok) {
    throw new Error('logo_fetch_failed');
  }
  const contentType = normalizeImageContentType(response.headers.get('content-type') || '', logoUrl);
  const arrayBuffer = await response.arrayBuffer();
  return bufferToDataUrl(arrayBuffer, contentType);
};

const getCompanyLogoEmailAsset = async () => {
  if (!isSupabaseReady()) return { logoUrl: null, attachment: null, companyName: null };
  const { data, error } = await supabase
    .from('company_settings')
    .select('logo_url, name, legal_name')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  const companyName = data?.legal_name || data?.name || null;
  const logoUrl = data?.logo_url || null;
  if (!logoUrl) return { logoUrl: null, attachment: null, companyName };

  const cid = 'company-logo@openrig';
  if (typeof logoUrl === 'string' && logoUrl.startsWith('data:')) {
    const attachment = buildInlineLogoAttachmentFromDataUrl(logoUrl, cid);
    if (!attachment) return { logoUrl: null, attachment: null, companyName };
    return { logoUrl: `cid:${cid}`, attachment, companyName };
  }

  if (typeof logoUrl === 'string') {
    try {
      const response = await fetch(logoUrl);
      if (response.ok) {
        const contentType = normalizeImageContentType(response.headers.get('content-type') || '', logoUrl);
        const arrayBuffer = await response.arrayBuffer();
        const attachment = {
          filename: `logo.${inferLogoExtension(contentType)}`,
          content: Buffer.from(arrayBuffer),
          contentType,
          cid,
          contentDisposition: 'inline',
        };
        return { logoUrl: `cid:${cid}`, attachment, companyName };
      }
    } catch (err) {
      console.warn('[company-logo] inline fetch error', err);
    }
    return { logoUrl, attachment: null, companyName };
  }

  return { logoUrl: null, attachment: null, companyName };
};

app.get('/api/system/company-logo-data', async (req, res) => {
  if (!isSupabaseReady()) {
    return res.status(503).json({ ok: false, error: 'supabase_not_ready' });
  }

  try {
    const dataUrl = await getCompanyLogoDataUrl();
    return res.json({ ok: true, dataUrl: dataUrl || null });
  } catch (err) {
    console.error('[company-logo] data url error', err);
    return res.status(500).json({
      ok: false,
      error: 'logo_data_failed',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

const isAllowedPublicImageUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    const hostAllowed = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
    const portAllowed = parsed.port === '54321' || parsed.port === '';
    const pathAllowed = parsed.pathname.startsWith('/storage/v1/object/public/');
    return parsed.protocol === 'http:' && hostAllowed && portAllowed && pathAllowed;
  } catch {
    return false;
  }
};

app.get('/api/system/public-image-data', async (req, res) => {
  const url = typeof req.query.url === 'string' ? req.query.url : '';
  if (!isAllowedPublicImageUrl(url)) {
    return res.status(400).json({ ok: false, error: 'invalid_url' });
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(502).json({ ok: false, error: 'image_fetch_failed' });
    }
    const contentType = normalizeImageContentType(response.headers.get('content-type') || '', url);
    const arrayBuffer = await response.arrayBuffer();
    return res.json({ ok: true, dataUrl: bufferToDataUrl(arrayBuffer, contentType) });
  } catch (err) {
    console.error('[public-image] data url error', err);
    return res.status(500).json({
      ok: false,
      error: 'image_data_failed',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post('/api/system/company-setup', async (req, res) => {
  if (!isSupabaseReady()) {
    return res.status(503).json({ ok: false, error: 'supabase_not_ready' });
  }

  const {
    name,
    legalName,
    email,
    phone,
    address,
    about,
    logo,
  } = req.body || {};

  const trimmedName = sanitizeNullableString(name);
  if (!trimmedName) {
    return res.status(400).json({ ok: false, error: 'name_required' });
  }

  const normalizedEmail = sanitizeNullableString(email, { toLowerCase: true });
  if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }

  let removeLogo = Boolean(logo?.remove === true);
  let logoUrl = null;

  if (logo && typeof logo === 'object' && typeof logo.data === 'string' && logo.data.trim().length > 0) {
    await ensureCompanyLogoBucket();
    const contentType = typeof logo.contentType === 'string' && logo.contentType.trim().length > 0
      ? logo.contentType.trim()
      : 'image/png';

    if (!ALLOWED_LOGO_MIME_TYPES.has(contentType)) {
      return res.status(400).json({ ok: false, error: 'logo_invalid_type' });
    }

    let base64Payload = logo.data.trim();
    const commaIndex = base64Payload.indexOf(',');
    if (commaIndex !== -1) {
      base64Payload = base64Payload.slice(commaIndex + 1);
    }

    let buffer;
    try {
      buffer = Buffer.from(base64Payload, 'base64');
    } catch (err) {
      console.error('[company-setup] invalid logo base64', err);
      return res.status(400).json({ ok: false, error: 'logo_invalid_data' });
    }

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ ok: false, error: 'logo_invalid_data' });
    }

    if (buffer.length > MAX_LOGO_SIZE_BYTES) {
      return res.status(400).json({ ok: false, error: 'logo_too_large' });
    }

    const extension = inferLogoExtension(contentType);
    const storagePath = buildCompanyLogoPath(extension);

    try {
      const { error: uploadErr } = await supabase.storage
        .from(COMPANY_LOGO_BUCKET)
        .upload(storagePath, buffer, {
          cacheControl: '3600',
          upsert: true,
          contentType,
        });

      if (uploadErr) {
        throw uploadErr;
      }

      const { data: publicData } = supabase.storage.from(COMPANY_LOGO_BUCKET).getPublicUrl(storagePath);
      if (!publicData?.publicUrl) {
        throw new Error('public_url_missing');
      }

      logoUrl = publicData.publicUrl;
      removeLogo = false;
    } catch (err) {
      console.error('[company-setup] logo upload failed', err);
      return res.status(500).json({
        ok: false,
        error: 'logo_upload_failed',
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }

  try {
    let existingLogoUrl = null;
    const { data: existingRow, error: existingErr } = await supabase
      .from('company_settings')
      .select('logo_url')
      .eq('id', 1)
      .maybeSingle();
    if (existingErr) {
      throw existingErr;
    }
    existingLogoUrl = existingRow?.logo_url || null;

    const payload = {
      id: 1,
      name: trimmedName,
      legal_name: sanitizeNullableString(legalName),
      email: normalizedEmail,
      phone: sanitizeNullableString(phone),
      address: sanitizeNullableString(address),
      about: sanitizeNullableString(about),
      logo_url: removeLogo ? null : (logoUrl || existingLogoUrl || null),
    };

    const { data, error } = await supabase
      .from('company_settings')
      .upsert([payload], { onConflict: 'id' })
      .select('name, legal_name, email, phone, address, about, logo_url')
      .single();

    if (error) {
      throw error;
    }

    const response = {
      name: data?.name || '',
      legalName: data?.legal_name || '',
      email: data?.email || '',
      phone: data?.phone || '',
      address: data?.address || '',
      about: data?.about || '',
      logoUrl: data?.logo_url || null,
    };

    return res.json({ ok: true, saved: true, data: response });
  } catch (err) {
    console.error('[company-setup] save error', err);
    return res.status(500).json({
      ok: false,
      error: 'save_failed',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post('/api/system/company-setup/logo-upload', async (req, res) => {
  if (!isSupabaseReady()) {
    return res.status(503).json({ ok: false, error: 'supabase_not_ready' });
  }

  const { data, contentType } = req.body || {};

  if (typeof data !== 'string' || data.trim().length === 0) {
    return res.status(400).json({ ok: false, error: 'logo_invalid_data' });
  }

  const normalizedType = typeof contentType === 'string' && contentType.trim().length > 0
    ? contentType.trim()
    : 'image/png';

  if (!ALLOWED_LOGO_MIME_TYPES.has(normalizedType)) {
    return res.status(400).json({ ok: false, error: 'logo_invalid_type' });
  }

  let base64Payload = data.trim();
  const commaIndex = base64Payload.indexOf(',');
  if (commaIndex !== -1) {
    base64Payload = base64Payload.slice(commaIndex + 1);
  }

  let buffer;
  try {
    buffer = Buffer.from(base64Payload, 'base64');
  } catch (err) {
    console.error('[company-setup] invalid logo payload', err);
    return res.status(400).json({ ok: false, error: 'logo_invalid_data' });
  }

  if (!buffer || buffer.length === 0) {
    return res.status(400).json({ ok: false, error: 'logo_invalid_data' });
  }

  if (buffer.length > MAX_LOGO_SIZE_BYTES) {
    return res.status(400).json({ ok: false, error: 'logo_too_large' });
  }

  try {
    await ensureCompanyLogoBucket();
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'logo_upload_failed', details: err instanceof Error ? err.message : String(err) });
  }

  const extension = inferLogoExtension(normalizedType);
  const storagePath = buildCompanyLogoPath(extension);

  try {
    const { error: uploadErr } = await supabase.storage
      .from(COMPANY_LOGO_BUCKET)
      .upload(storagePath, buffer, {
        cacheControl: '3600',
        upsert: true,
        contentType: normalizedType,
      });

    if (uploadErr) {
      throw uploadErr;
    }

    const { data: publicData } = supabase.storage.from(COMPANY_LOGO_BUCKET).getPublicUrl(storagePath);
    const publicUrl = publicData?.publicUrl || null;

    return res.json({ ok: true, url: publicUrl, path: storagePath });
  } catch (err) {
    console.error('[company-setup] logo upload service failed', err);
    return res.status(500).json({
      ok: false,
      error: 'logo_upload_failed',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get('/api/system/setup-status', async (req, res) => {
  await refreshSupabaseHealthIfStale();
  const supabaseStatus = latestSupabaseHealth.status || 'unknown';
  const supabaseReady = isSupabaseReady() && supabaseStatus === 'ready';
  const verification = readSupabaseVerificationFlag();
  const configState = readSupabaseConfigState();

  const payload = {
    ok: true,
    supabaseReady,
    supabaseStatus,
    verified: Boolean(verification?.verified),
    verificationUpdatedAt: verification?.updatedAt || null,
    supabaseIsConfig: Boolean(configState?.supabaseIsConfig),
    supabaseConfigUpdatedAt: configState?.updatedAt || null,
    adminExists: false,
    companyConfigured: false,
    adminError: null,
    companyError: null,
    bootstrapStatus: supabaseBootstrapState.status,
    bootstrapError: supabaseBootstrapState.lastError,
  };

  if (!supabaseReady) {
    return res.json(payload);
  }

  try {
    const { count, error } = await supabase
      .from('app_users')
      .select('id', { count: 'exact', head: true });
    if (error) {
      payload.ok = false;
      payload.adminError = error.message || 'admin_status_failed';
    } else {
      payload.adminExists = typeof count === 'number' && count > 0;
    }
  } catch (err) {
    payload.ok = false;
    payload.adminError = err instanceof Error ? err.message : String(err);
  }

  try {
    const { data, error } = await supabase
      .from('company_settings')
      .select('name, email')
      .eq('id', 1)
      .maybeSingle();
    if (error) {
      payload.ok = false;
      payload.companyError = error.message || 'company_status_failed';
    } else {
      payload.companyConfigured = Boolean(data?.name && data?.email);
    }
  } catch (err) {
    payload.ok = false;
    payload.companyError = err instanceof Error ? err.message : String(err);
  }

  return res.json(payload);
});

app.get('/api/system/database-health', async (req, res) => {
  await refreshSupabaseHealthIfStale();
  const configState = readSupabaseConfigState();
  res.json({
    status: latestSupabaseHealth.status,
    message: latestSupabaseHealth.message,
    issues: latestSupabaseHealth.issues,
    updatedAt: latestSupabaseHealth.updatedAt,
    supabaseIsConfig: Boolean(configState?.supabaseIsConfig),
    supabaseConfigUpdatedAt: configState?.updatedAt || null,
    bootstrapStatus: supabaseBootstrapState.status,
    bootstrapError: supabaseBootstrapState.lastError,
    bootstrapStartedAt: supabaseBootstrapState.startedAt,
    bootstrapCompletedAt: supabaseBootstrapState.completedAt,
  });
});

/* ===== Application update system =====
 * Compares the local checkout with the GitHub remote (origin) and applies
 * updates with git pull. The app version lives in package.json (YYYY.M.N).
 */
const UPDATE_CHECK_TTL_MS = 5 * 60 * 1000;
let updateStatusCache = null;
let updateApplyLock = false;

const runCommand = (command, args, { cwd = PROJECT_ROOT, timeout = 60 * 1000 } = {}) => new Promise((resolve) => {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  const timer = setTimeout(() => {
    try { child.kill('SIGTERM'); } catch { /* already dead */ }
  }, timeout);
  child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('error', (err) => {
    clearTimeout(timer);
    resolve({ code: 1, stdout, stderr: stderr || String(err?.message || err) });
  });
  child.on('close', (code) => {
    clearTimeout(timer);
    resolve({ code: code ?? 1, stdout, stderr });
  });
});

const readLocalAppVersion = () => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch (err) {
    console.warn('[update] unable to read local version', err);
    return null;
  }
};

// Numeric segment-by-segment comparison so 2026.6.10 > 2026.6.9.
const compareAppVersions = (a, b) => {
  const parse = (value) => String(value || '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
};

const detectGitBranch = async () => {
  const res = await runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = res.code === 0 ? res.stdout.trim() : '';
  return branch && branch !== 'HEAD' ? branch : 'main';
};

const collectUpdateStatus = async ({ refresh = false } = {}) => {
  const now = Date.now();
  if (!refresh && updateStatusCache && now - updateStatusCache.checkedAt < UPDATE_CHECK_TTL_MS) {
    return updateStatusCache;
  }
  const branch = await detectGitBranch();
  const fetchRes = await runCommand('git', ['fetch', 'origin', branch], { timeout: 120 * 1000 });
  if (fetchRes.code !== 0) {
    updateStatusCache = {
      checkedAt: now,
      branch,
      remoteVersion: null,
      commitsBehind: null,
      error: 'fetch_failed',
      errorDetail: (fetchRes.stderr || fetchRes.stdout).trim().slice(-500) || null,
    };
    return updateStatusCache;
  }
  let remoteVersion = null;
  const showRes = await runCommand('git', ['show', `origin/${branch}:package.json`]);
  if (showRes.code === 0) {
    try {
      const parsed = JSON.parse(showRes.stdout);
      remoteVersion = typeof parsed.version === 'string' ? parsed.version : null;
    } catch (err) {
      console.warn('[update] unable to parse remote package.json', err);
    }
  }
  const behindRes = await runCommand('git', ['rev-list', '--count', `HEAD..origin/${branch}`]);
  const commitsBehind = behindRes.code === 0 ? (Number.parseInt(behindRes.stdout.trim(), 10) || 0) : null;
  updateStatusCache = { checkedAt: now, branch, remoteVersion, commitsBehind, error: null, errorDetail: null };
  return updateStatusCache;
};

app.get('/api/system/update/status', async (req, res) => {
  const refresh = ['1', 'true', 'yes'].includes(String(req.query?.refresh || '').toLowerCase());
  const currentVersion = readLocalAppVersion();
  try {
    const status = await collectUpdateStatus({ refresh });
    const newerVersion = Boolean(
      status.remoteVersion && currentVersion && compareAppVersions(status.remoteVersion, currentVersion) > 0,
    );
    const updateAvailable = newerVersion || (status.commitsBehind || 0) > 0;
    return res.json({
      ok: !status.error,
      currentVersion,
      remoteVersion: status.remoteVersion,
      commitsBehind: status.commitsBehind,
      branch: status.branch,
      updateAvailable,
      updating: updateApplyLock,
      lastCheckedAt: new Date(status.checkedAt).toISOString(),
      error: status.error || null,
      errorDetail: status.errorDetail || null,
    });
  } catch (err) {
    console.error('[update/status] error', err);
    return res.status(500).json({
      ok: false,
      currentVersion,
      error: 'update_status_failed',
      errorDetail: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post('/api/system/update/apply', async (req, res) => {
  if (updateApplyLock) {
    return res.status(409).json({ ok: false, error: 'update_in_progress' });
  }
  updateApplyLock = true;
  try {
    const force = Boolean(req.body?.force);
    const branch = await detectGitBranch();

    const dirtyRes = await runCommand('git', ['status', '--porcelain']);
    const dirtyFiles = dirtyRes.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    let stashed = false;
    if (dirtyFiles.length > 0) {
      if (!force) {
        return res.status(409).json({
          ok: false,
          error: 'working_tree_dirty',
          files: dirtyFiles.slice(0, 20).map((line) => line.replace(/^\S+\s+/, '')),
        });
      }
      const stashRes = await runCommand('git', ['stash', 'push', '--include-untracked', '-m', 'openrig-auto-update']);
      if (stashRes.code !== 0) {
        return res.status(500).json({
          ok: false,
          error: 'stash_failed',
          errorDetail: (stashRes.stderr || stashRes.stdout).trim().slice(-500),
        });
      }
      stashed = true;
    }

    const oldVersion = readLocalAppVersion();
    const oldHead = (await runCommand('git', ['rev-parse', 'HEAD'])).stdout.trim();

    const pullRes = await runCommand('git', ['pull', '--ff-only', 'origin', branch], { timeout: 5 * 60 * 1000 });
    if (pullRes.code !== 0) {
      return res.status(500).json({
        ok: false,
        error: 'pull_failed',
        errorDetail: (pullRes.stderr || pullRes.stdout).trim().slice(-800),
        stashed,
      });
    }

    const newHead = (await runCommand('git', ['rev-parse', 'HEAD'])).stdout.trim();
    const updated = Boolean(oldHead && newHead && oldHead !== newHead);
    let npmInstalled = false;
    let changelog = [];

    if (updated) {
      const diffRes = await runCommand('git', ['diff', '--name-only', oldHead, newHead]);
      const changedFiles = diffRes.stdout.split(/\r?\n/).filter(Boolean);
      if (changedFiles.includes('package.json') || changedFiles.includes('package-lock.json')) {
        const installRes = await runCommand('npm', ['install', '--legacy-peer-deps'], { timeout: 10 * 60 * 1000 });
        npmInstalled = installRes.code === 0;
        if (!npmInstalled) {
          return res.status(500).json({
            ok: false,
            error: 'npm_install_failed',
            errorDetail: (installRes.stderr || installRes.stdout).trim().slice(-800),
            updated,
            stashed,
          });
        }
      }
      const logRes = await runCommand('git', ['log', '--oneline', '--no-decorate', `${oldHead}..${newHead}`]);
      changelog = logRes.stdout.split(/\r?\n/).filter(Boolean).slice(0, 30);
    }

    updateStatusCache = null;
    return res.json({
      ok: true,
      updated,
      oldVersion,
      newVersion: readLocalAppVersion(),
      changelog,
      npmInstalled,
      stashed,
      needsRestart: updated,
    });
  } catch (err) {
    console.error('[update/apply] error', err);
    return res.status(500).json({
      ok: false,
      error: 'update_failed',
      errorDetail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    updateApplyLock = false;
  }
});

app.post('/api/system/supabase/control', async (req, res) => {
  const action = typeof req.body?.action === 'string' ? req.body.action.trim().toLowerCase() : '';
  const validActions = new Set(['start', 'stop', 'status']);
  if (!validActions.has(action)) {
    return res.status(400).json({ ok: false, error: 'invalid_action' });
  }
  if (supabaseCliLock) {
    return res.status(409).json({ ok: false, error: 'operation_in_progress' });
  }
  supabaseCliLock = true;
  try {
    if (action === 'start') {
      const { stdout, stderr } = await runSupabaseCli(['start']);
      const startParsed = parseSupabaseInfoOutput(`${stdout}\n${stderr}`);
      let statusInfo = null;
      try {
        statusInfo = await collectSupabaseStatusInfo();
      } catch (statusErr) {
        console.warn('[supabase/control] status collection failed', statusErr);
      }
      const parsed = {
        ...startParsed,
        ...(statusInfo?.parsed || {}),
      };
      let appliedConfig = null;
      if (parsed.apiUrl && parsed.serviceRoleKey) {
        const payload = {
          supabaseUrl: parsed.apiUrl,
          serviceRoleKey: parsed.serviceRoleKey,
          anonKey: parsed.anonKey || '',
          savedAt: new Date().toISOString(),
          source: 'cli',
        };
        applySupabaseConfig(payload);
        writeSupabaseCredentials(payload);
        updateEnvFileWithSupabaseConfig(payload);
        appliedConfig = {
          supabaseUrl: payload.supabaseUrl,
          anonKey: payload.anonKey,
          serviceRoleKey: payload.serviceRoleKey,
        };
      }
      if (parsed.databaseUrl) {
        try {
          const dbUrl = new URL(parsed.databaseUrl);
          writeDatabaseInfo({
            host: dbUrl.hostname || '127.0.0.1',
            port: dbUrl.port || '5432',
            database: dbUrl.pathname ? dbUrl.pathname.replace(/^\//, '') : 'postgres',
            user: decodeURIComponent(dbUrl.username || 'postgres'),
            password: decodeURIComponent(dbUrl.password || ''),
          });
        } catch (err) {
          console.warn('[supabase/control] unable to parse database URL', err);
        }
      }

      const evaluation = await waitForSupabaseStructure();
      if (evaluation && evaluation.ok) {
        supabaseBootstrapState = {
          status: 'ready',
          lastError: null,
          startedAt: supabaseBootstrapState.startedAt || new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
      } else {
        supabaseBootstrapState = {
          status: 'failed',
          lastError: evaluation?.reason || evaluation?.error?.message || 'structure_invalid',
          startedAt: supabaseBootstrapState.startedAt || new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
      }

      return res.json({
        ok: true,
        action,
        output: stdout,
        errorOutput: stderr,
        config: appliedConfig,
        databaseUrl: parsed.databaseUrl || null,
        statusOutput: statusInfo?.stdout || null,
        statusErrorOutput: statusInfo?.stderr || null,
        healthStatus: evaluation && evaluation.ok ? 'ready' : (evaluation?.reason || latestSupabaseHealth.status),
      });
    }

    if (action === 'stop') {
      const { stdout, stderr } = await runSupabaseCli(['stop'], { timeout: 2 * 60 * 1000 });
      return res.json({ ok: true, action, output: stdout, errorOutput: stderr });
    }

    if (action === 'status') {
      const { stdout, stderr } = await runSupabaseCli(['status'], { timeout: 30 * 1000 });
      return res.json({ ok: true, action, output: stdout, errorOutput: stderr });
    }

    return res.status(400).json({ ok: false, error: 'unsupported_action' });
  } catch (err) {
    console.error('[supabase/control] cli error', err);
    return res.status(500).json({
      ok: false,
      error: 'cli_failed',
      message: err instanceof Error ? err.message : String(err),
      stdout: err?.stdout,
      stderr: err?.stderr,
    });
  } finally {
    supabaseCliLock = false;
  }
});

app.get('/api/system/mail-config', (req, res) => {
  try {
    res.json(readMailConfig());
  } catch (err) {
    console.error('[mail-config] get error', err);
    res.status(500).json({ error: 'Unable to read mail config' });
  }
});

app.put('/api/system/mail-config', (req, res) => {
  try {
    const saved = writeMailConfig(req.body || {});
    res.json(sanitizeMailConfig(saved));
  } catch (err) {
    console.error('[mail-config] put error', err);
    res.status(500).json({ error: 'Unable to persist mail config' });
  }
});

app.get('/api/system/full-export', async (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zip = new JSZip();
  const warnings = [];
  const temporaryFiles = [];
  const report = {
    generatedAt: new Date().toISOString(),
    filename: `openrig-full-export-${timestamp}.zip`,
    sections: {
      local: {},
      database: {},
      storage: {},
    },
    warnings,
  };

  try {
    const envFile = path.join(PROJECT_ROOT, '.env');
    const packageFile = path.join(PROJECT_ROOT, 'package.json');
    const serverDataCount = addDirectoryToZip(zip, DATA_DIR, 'server/data');
    const publicCount = addDirectoryToZip(zip, path.join(PROJECT_ROOT, 'public'), 'public');
    const supabaseCount = addDirectoryToZip(zip, path.join(PROJECT_ROOT, 'supabase'), 'supabase');

    if (fs.existsSync(envFile)) {
      zip.file('config/.env', fs.readFileSync(envFile));
    }
    if (fs.existsSync(packageFile)) {
      zip.file('config/package.json', fs.readFileSync(packageFile));
    }

    report.sections.local = {
      serverDataFiles: serverDataCount,
      publicFiles: publicCount,
      supabaseFiles: supabaseCount,
      envIncluded: fs.existsSync(envFile),
      packageIncluded: fs.existsSync(packageFile),
    };

    const exportTmpDir = path.join(DATA_DIR, 'exports');
    fs.mkdirSync(exportTmpDir, { recursive: true });

    const schemaDumpPath = path.join(exportTmpDir, `db-public-schema-${timestamp}.sql`);
    const dataDumpPath = path.join(exportTmpDir, `db-public-data-${timestamp}.sql`);
    temporaryFiles.push(schemaDumpPath, dataDumpPath);

    let dbDumpIncluded = false;
    let dbDumpMode = 'none';

    try {
      await runSupabaseDbDump({ outputFile: schemaDumpPath, dataOnly: false });
      await runSupabaseDbDump({ outputFile: dataDumpPath, dataOnly: true });
      dbDumpIncluded = true;
      dbDumpMode = 'local';
    } catch (localDumpError) {
      const localMessage = localDumpError instanceof Error ? localDumpError.message : String(localDumpError);
      warnings.push(`db_dump_local_failed:${localMessage}`);

      const dbUrl = buildDbUrlFromInfo(readDatabaseInfo());
      if (dbUrl) {
        try {
          await runSupabaseDbDump({ outputFile: schemaDumpPath, dataOnly: false, dbUrl });
          await runSupabaseDbDump({ outputFile: dataDumpPath, dataOnly: true, dbUrl });
          dbDumpIncluded = true;
          dbDumpMode = 'db_url';
        } catch (remoteDumpError) {
          const remoteMessage = remoteDumpError instanceof Error ? remoteDumpError.message : String(remoteDumpError);
          warnings.push(`db_dump_db_url_failed:${remoteMessage}`);
        }
      } else {
        warnings.push('db_dump_db_url_missing_configuration');
      }
    }

    if (dbDumpIncluded && fs.existsSync(schemaDumpPath)) {
      zip.file('database/public-schema.sql', fs.readFileSync(schemaDumpPath));
    }
    if (dbDumpIncluded && fs.existsSync(dataDumpPath)) {
      zip.file('database/public-data.sql', fs.readFileSync(dataDumpPath));
    }

    report.sections.database = {
      dumpIncluded: dbDumpIncluded,
      mode: dbDumpMode,
      schemaFile: dbDumpIncluded && fs.existsSync(schemaDumpPath),
      dataFile: dbDumpIncluded && fs.existsSync(dataDumpPath),
    };

    let storageFileCount = 0;
    let storageBucketCount = 0;

    if (isSupabaseReady()) {
      try {
        const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
        if (bucketsError) {
          throw bucketsError;
        }

        const normalizedBuckets = Array.isArray(buckets) ? buckets : [];
        storageBucketCount = normalizedBuckets.length;

        for (const bucket of normalizedBuckets) {
          const bucketName = bucket?.name;
          if (!bucketName) continue;
          try {
            storageFileCount += await appendStorageBucketToZip({
              zip,
              bucketName,
              warnings,
            });
          } catch (bucketError) {
            const bucketMessage = bucketError instanceof Error ? bucketError.message : String(bucketError);
            warnings.push(`storage_bucket_failed:${bucketName}:${bucketMessage}`);
          }
        }
      } catch (storageError) {
        const storageMessage = storageError instanceof Error ? storageError.message : String(storageError);
        warnings.push(`storage_export_failed:${storageMessage}`);
      }
    } else {
      warnings.push('storage_export_skipped_supabase_not_ready');
    }

    report.sections.storage = {
      bucketCount: storageBucketCount,
      fileCount: storageFileCount,
    };

    zip.file('meta/export-report.json', JSON.stringify(report, null, 2));

    const archiveBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="openrig-full-export-${timestamp}.zip"`);
    return res.status(200).send(archiveBuffer);
  } catch (err) {
    console.error('[full-export] error', err);
    return res.status(500).json({
      error: 'full_export_failed',
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    temporaryFiles.forEach((filePath) => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (cleanupError) {
        console.warn('[full-export] temporary file cleanup failed', cleanupError);
      }
    });
  }
});

app.post(
  '/api/system/full-import',
  bodyParser.raw({ type: ['application/zip', 'application/octet-stream'], limit: '2gb' }),
  async (req, res) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const importReport = {
      importedAt: new Date().toISOString(),
      filename: typeof req.headers['x-backup-filename'] === 'string' ? req.headers['x-backup-filename'] : null,
      sections: {
        local: {
          serverDataFiles: 0,
          publicFiles: 0,
          supabaseFiles: 0,
          envImported: false,
        },
        database: {
          schemaDetected: false,
          dataDetected: false,
          restored: false,
          mode: null,
        },
        storage: {
          filesDetected: 0,
          filesImported: 0,
        },
      },
      warnings: [],
    };

    const temporaryFiles = [];

    try {
      const body = req.body;
      if (!body || !Buffer.isBuffer(body) || body.length === 0) {
        return res.status(400).json({ ok: false, error: 'invalid_backup_payload' });
      }

      const zip = await JSZip.loadAsync(body);
      const storageObjects = [];
      let schemaSqlBuffer = null;
      let dataSqlBuffer = null;

      const entries = Object.values(zip.files);
      for (const entry of entries) {
        if (!entry || entry.dir) continue;
        const zipPath = sanitizeRelativePath(entry.name);
        if (!zipPath) continue;

        const content = await entry.async('nodebuffer');

        if (zipPath.startsWith('server/data/')) {
          const relative = zipPath.slice('server/data/'.length);
          if (!relative) continue;
          const targetPath = resolveSafePath(DATA_DIR, relative);
          ensureParentDir(targetPath);
          fs.writeFileSync(targetPath, content);
          importReport.sections.local.serverDataFiles += 1;
          continue;
        }

        if (zipPath.startsWith('public/')) {
          const relative = zipPath.slice('public/'.length);
          if (!relative) continue;
          const targetPath = resolveSafePath(path.join(PROJECT_ROOT, 'public'), relative);
          ensureParentDir(targetPath);
          fs.writeFileSync(targetPath, content);
          importReport.sections.local.publicFiles += 1;
          continue;
        }

        if (zipPath.startsWith('supabase/')) {
          const relative = zipPath.slice('supabase/'.length);
          if (!relative) continue;
          const targetPath = resolveSafePath(path.join(PROJECT_ROOT, 'supabase'), relative);
          ensureParentDir(targetPath);
          fs.writeFileSync(targetPath, content);
          importReport.sections.local.supabaseFiles += 1;
          continue;
        }

        if (zipPath === 'config/.env') {
          const targetPath = path.join(PROJECT_ROOT, '.env');
          fs.writeFileSync(targetPath, content);
          importReport.sections.local.envImported = true;
          continue;
        }

        if (zipPath === 'database/public-schema.sql') {
          schemaSqlBuffer = Buffer.from(content);
          importReport.sections.database.schemaDetected = true;
          continue;
        }

        if (zipPath === 'database/public-data.sql') {
          dataSqlBuffer = Buffer.from(content);
          importReport.sections.database.dataDetected = true;
          continue;
        }

        if (zipPath.startsWith('storage/')) {
          const relative = zipPath.slice('storage/'.length);
          const segments = relative.split('/').filter(Boolean);
          if (segments.length < 2) {
            importReport.warnings.push(`storage_invalid_path:${zipPath}`);
            continue;
          }
          const bucketName = segments.shift();
          const objectPath = segments.join('/');
          if (!bucketName || !objectPath) {
            importReport.warnings.push(`storage_invalid_path:${zipPath}`);
            continue;
          }
          storageObjects.push({
            bucketName,
            objectPath,
            content: Buffer.from(content),
          });
          importReport.sections.storage.filesDetected += 1;
        }
      }

      try {
        const importedCredentials = readSupabaseCredentials({ includeKey: true });
        if (importedCredentials?.supabaseUrl && importedCredentials?.serviceRoleKey) {
          applySupabaseConfig({
            supabaseUrl: importedCredentials.supabaseUrl,
            serviceRoleKey: importedCredentials.serviceRoleKey,
            anonKey: importedCredentials.anonKey || '',
            savedAt: importedCredentials.savedAt || new Date().toISOString(),
            source: 'file',
          });
          writeSupabaseConfigState(true);
        }
      } catch (credentialsError) {
        importReport.warnings.push(`supabase_credentials_apply_failed:${credentialsError instanceof Error ? credentialsError.message : String(credentialsError)}`);
      }

      if (schemaSqlBuffer || dataSqlBuffer) {
        const importTmpDir = path.join(DATA_DIR, 'imports');
        fs.mkdirSync(importTmpDir, { recursive: true });

        const schemaPath = path.join(importTmpDir, `import-schema-${timestamp}.sql`);
        const dataPath = path.join(importTmpDir, `import-data-${timestamp}.sql`);

        if (schemaSqlBuffer) {
          fs.writeFileSync(schemaPath, schemaSqlBuffer);
          temporaryFiles.push(schemaPath);
        }
        if (dataSqlBuffer) {
          fs.writeFileSync(dataPath, dataSqlBuffer);
          temporaryFiles.push(dataPath);
        }

        const dbInfo = readDatabaseInfo();
        const dbUrlCandidates = Array.from(new Set([
          buildDbUrlFromInfo(dbInfo),
          'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        ].filter(Boolean)));

        for (const candidate of dbUrlCandidates) {
          try {
            if (schemaSqlBuffer) {
              await runPsqlQuery({ dbUrl: candidate, sql: 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' });
              await runPsqlFile({ dbUrl: candidate, filePath: schemaPath });
            }
            if (dataSqlBuffer) {
              await runPsqlFile({ dbUrl: candidate, filePath: dataPath });
            }
            importReport.sections.database.restored = true;
            importReport.sections.database.mode = candidate === dbUrlCandidates[0] ? 'database_info' : 'fallback_local';
            break;
          } catch (dbRestoreError) {
            importReport.warnings.push(`db_restore_failed:${candidate}:${dbRestoreError instanceof Error ? dbRestoreError.message : String(dbRestoreError)}`);
          }
        }
      }

      if (storageObjects.length > 0) {
        if (!isSupabaseReady()) {
          importReport.warnings.push('storage_import_skipped_supabase_not_ready');
        } else {
          const bucketSet = new Set();
          let existingBuckets = new Set();
          try {
            const { data: buckets, error } = await supabase.storage.listBuckets();
            if (error) throw error;
            existingBuckets = new Set((buckets || []).map((bucket) => bucket?.name).filter(Boolean));
          } catch (bucketListError) {
            importReport.warnings.push(`storage_bucket_list_failed:${bucketListError instanceof Error ? bucketListError.message : String(bucketListError)}`);
          }

          for (const file of storageObjects) {
            bucketSet.add(file.bucketName);
            if (!existingBuckets.has(file.bucketName)) {
              try {
                const { error } = await supabase.storage.createBucket(file.bucketName, { public: true });
                if (error && !/already\sexists/i.test(error.message || '')) {
                  throw error;
                }
                existingBuckets.add(file.bucketName);
              } catch (createBucketError) {
                importReport.warnings.push(`storage_bucket_create_failed:${file.bucketName}:${createBucketError instanceof Error ? createBucketError.message : String(createBucketError)}`);
                continue;
              }
            }

            const contentType = guessContentTypeFromPath(file.objectPath);
            try {
              const { error } = await supabase.storage
                .from(file.bucketName)
                .upload(file.objectPath, file.content, { upsert: true, contentType });
              if (error) throw error;
              importReport.sections.storage.filesImported += 1;
            } catch (uploadError) {
              importReport.warnings.push(`storage_upload_failed:${file.bucketName}/${file.objectPath}:${uploadError instanceof Error ? uploadError.message : String(uploadError)}`);
            }
          }
        }
      }

      try {
        await refreshSupabaseHealth();
      } catch (healthRefreshError) {
        importReport.warnings.push(`health_refresh_failed:${healthRefreshError instanceof Error ? healthRefreshError.message : String(healthRefreshError)}`);
      }

      return res.status(200).json({
        ok: true,
        report: importReport,
      });
    } catch (err) {
      console.error('[full-import] error', err);
      return res.status(500).json({
        ok: false,
        error: 'full_import_failed',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      temporaryFiles.forEach((filePath) => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (cleanupError) {
          console.warn('[full-import] temporary file cleanup failed', cleanupError);
        }
      });
    }
  },
);

const DEPOT_UNIT_QR_PREFIX = 'equipment_unit:';
const DEPOT_RENTAL_QR_PREFIX = 'rental:';
const DEPOT_ANY_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEPOT_UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const DEPOT_INVISIBLE_CHARS_PATTERN = /[\u200B-\u200D\uFEFF]/g;

const sanitizeDepotScanCode = (value) => (typeof value === 'string' ? value : '')
  .replace(DEPOT_INVISIBLE_CHARS_PATTERN, '')
  .trim();

const tryDecodeDepotScanCode = (value) => {
  if (!value || !value.includes('%')) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const collectDepotScanCandidates = (rawValue) => {
  const raw = sanitizeDepotScanCode(rawValue);
  const decoded = sanitizeDepotScanCode(tryDecodeDepotScanCode(raw));
  let fromDataParam = '';

  if (raw.includes('data=')) {
    try {
      const parsed = new URL(raw);
      const dataParam = parsed.searchParams.get('data') || '';
      fromDataParam = sanitizeDepotScanCode(tryDecodeDepotScanCode(dataParam));
    } catch (err) {
      fromDataParam = '';
    }
  }

  return Array.from(new Set([raw, decoded, fromDataParam])).filter(Boolean);
};

const extractDepotUnitId = (value) => {
  const normalized = sanitizeDepotScanCode(value);
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  if (lower.startsWith(DEPOT_UNIT_QR_PREFIX)) {
    const id = normalized.slice(DEPOT_UNIT_QR_PREFIX.length).trim();
    return id || null;
  }
  if (DEPOT_ANY_UUID_PATTERN.test(normalized)) return normalized;
  const prefixedMatch = normalized.match(/equipment_unit\s*[:：]\s*([0-9a-fA-F-]{32,40})/i);
  if (prefixedMatch?.[1]) return prefixedMatch[1].trim();
  return null;
};

const extractDepotRentalId = (value) => {
  const normalized = sanitizeDepotScanCode(value);
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  if (lower.startsWith(DEPOT_RENTAL_QR_PREFIX)) {
    const id = normalized.slice(DEPOT_RENTAL_QR_PREFIX.length).trim();
    return id || null;
  }
  const fromPath = normalized.match(/\/rentals\/([0-9a-fA-F-]{36})/);
  if (fromPath?.[1]) return fromPath[1];
  const uuidMatch = normalized.match(DEPOT_UUID_IN_TEXT_PATTERN);
  if (uuidMatch?.[0]) return uuidMatch[0];
  return null;
};

const fetchDepotClientInfo = async (clientId) => {
  if (!clientId) return { name: null, email: null, phone: null };

  const withFull = await supabase
    .from('clients')
    .select('name, email, phone')
    .eq('id', clientId)
    .maybeSingle();

  if (!withFull.error && withFull.data) {
    return {
      name: withFull.data.name || null,
      email: withFull.data.email || null,
      phone: withFull.data.phone || null,
    };
  }

  if (withFull.error) {
    console.warn('[depot/resolve-rental] client full lookup failed, fallback name-only', withFull.error);
  }

  const nameOnly = await supabase
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .maybeSingle();

  if (nameOnly.error) {
    console.warn('[depot/resolve-rental] client name fallback failed', nameOnly.error);
    return { name: null, email: null, phone: null };
  }

  return {
    name: nameOnly.data?.name || null,
    email: null,
    phone: null,
  };
};

const fetchDepotRentalsByIds = async (rentalIds) => {
  if (!Array.isArray(rentalIds) || rentalIds.length === 0) return [];
  const orderMap = new Map(rentalIds.map((id, index) => [id, index]));

  const withClients = await supabase
    .from('rentals')
    .select('id, reference_code, title, status, start_date, end_date, location, clients(name)')
    .in('id', rentalIds);

  let rows = withClients.data || [];
  if (withClients.error) {
    console.warn('[depot/resolve-unit] rentals with clients failed, fallback without clients', withClients.error);
    const fallback = await supabase
      .from('rentals')
      .select('id, reference_code, title, status, start_date, end_date, location')
      .in('id', rentalIds);
    if (fallback.error) {
      console.error('[depot/resolve-unit] rentals fallback failed', fallback.error);
      return [];
    }
    rows = fallback.data || [];
  }

  return rows
    .map((row) => ({
      id: row.id || null,
      reference_code: row.reference_code || null,
      title: row.title || null,
      status: row.status || null,
      start_date: row.start_date || null,
      end_date: row.end_date || null,
      location: row.location || null,
      client_name: row.clients?.name || null,
    }))
    .filter((row) => typeof row.id === 'string' && row.id.length > 0)
    .sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
};

app.get('/api/depot/resolve-unit', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }

    const rawCode = typeof req.query.code === 'string' ? req.query.code : '';
    const codeCandidates = collectDepotScanCandidates(rawCode);
    if (codeCandidates.length === 0) {
      return res.status(400).json({ error: 'Code de scan requis' });
    }

    const unitIdCandidates = Array.from(
      new Set(codeCandidates.map((value) => extractDepotUnitId(value)).filter(Boolean)),
    );

    const selectUnit = 'id, equipment_id, serial_number, qr_code_value, qr_code_url, status, warehouse:warehouse_id(name)';
    let unitRow = null;

    for (const unitId of unitIdCandidates) {
      if (!DEPOT_ANY_UUID_PATTERN.test(unitId)) continue;
      const { data, error } = await supabase
        .from('equipment_units')
        .select(selectUnit)
        .eq('id', unitId)
        .maybeSingle();
      if (error) {
        console.warn('[depot/resolve-unit] unit by id lookup failed', { unitId, error });
        continue;
      }
      if (data?.id) {
        unitRow = data;
        break;
      }
    }

    if (!unitRow) {
      for (const candidate of codeCandidates) {
        const { data, error } = await supabase
          .from('equipment_units')
          .select(selectUnit)
          .eq('qr_code_value', candidate)
          .maybeSingle();
        if (error) {
          console.warn('[depot/resolve-unit] unit by qr exact lookup failed', { candidate, error });
          continue;
        }
        if (data?.id) {
          unitRow = data;
          break;
        }
      }
    }

    if (!unitRow) {
      for (const candidate of codeCandidates) {
        const { data, error } = await supabase
          .from('equipment_units')
          .select(selectUnit)
          .ilike('qr_code_value', candidate)
          .limit(1)
          .maybeSingle();
        if (error) {
          console.warn('[depot/resolve-unit] unit by qr ilike lookup failed', { candidate, error });
          continue;
        }
        if (data?.id) {
          unitRow = data;
          break;
        }
      }
    }

    if (!unitRow) {
      return res.json({ ok: true, found: false });
    }

    const [equipmentRes, historyRes] = await Promise.all([
      supabase
        .from('equipment')
        .select('id, name, type, subtype, description, image_url, status')
        .eq('id', unitRow.equipment_id)
        .maybeSingle(),
      supabase
        .from('equipment_unit_rental_history')
        .select('source_id, event_type, event_at, scan_result, forced, rental_id, reference_code, rental_title, client_name')
        .eq('equipment_unit_id', unitRow.id)
        .order('event_at', { ascending: false })
        .limit(12),
    ]);

    if (equipmentRes.error) {
      console.warn('[depot/resolve-unit] equipment lookup failed', equipmentRes.error);
    }
    if (historyRes.error) {
      console.warn('[depot/resolve-unit] history lookup failed', historyRes.error);
    }

    const history = (historyRes.data || []).map((row) => ({
      source_id: row.source_id || null,
      event_type: row.event_type || null,
      event_at: row.event_at || null,
      scan_result: row.scan_result || null,
      forced: row.forced === true,
      rental_id: row.rental_id || null,
      reference_code: row.reference_code || null,
      rental_title: row.rental_title || null,
      client_name: row.client_name || null,
    }));

    const rentalIds = Array.from(new Set(history.map((event) => event.rental_id).filter(Boolean)));
    const latestRentals = await fetchDepotRentalsByIds(rentalIds.slice(0, 8));

    return res.json({
      ok: true,
      found: true,
      unit: {
        id: unitRow.id || null,
        equipment_id: unitRow.equipment_id || null,
        serial_number: unitRow.serial_number || null,
        qr_code_value: unitRow.qr_code_value || null,
        qr_code_url: unitRow.qr_code_url || null,
        status: unitRow.status || null,
        warehouse_name: unitRow.warehouse?.name || null,
      },
      equipment: equipmentRes.data
        ? {
            id: equipmentRes.data.id || null,
            name: equipmentRes.data.name || null,
            type: equipmentRes.data.type || null,
            subtype: equipmentRes.data.subtype || null,
            description: equipmentRes.data.description || null,
            image_url: equipmentRes.data.image_url || null,
            status: equipmentRes.data.status || null,
          }
        : null,
      history,
      latestRentals,
    });
  } catch (err) {
    console.error('[depot/resolve-unit] unexpected error', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Impossible de résoudre le code',
    });
  }
});

app.get('/api/depot/resolve-rental', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }

    const rawCode = typeof req.query.code === 'string' ? req.query.code : '';
    const codeCandidates = collectDepotScanCandidates(rawCode);
    if (codeCandidates.length === 0) {
      return res.status(400).json({ error: 'Code de scan requis' });
    }

    const rentalIdCandidates = Array.from(
      new Set(codeCandidates.map((value) => extractDepotRentalId(value)).filter(Boolean)),
    );

    let rentalRow = null;
    for (const rentalId of rentalIdCandidates) {
      if (!DEPOT_ANY_UUID_PATTERN.test(rentalId)) continue;
      const { data, error } = await supabase
        .from('rentals')
        .select('id, client_id, reference_code, title, status, start_date, end_date, location, delivery_address, pickup_address, description, notes, total_price')
        .eq('id', rentalId)
        .maybeSingle();
      if (error) {
        console.warn('[depot/resolve-rental] lookup by id failed', { rentalId, error });
        continue;
      }
      if (data?.id) {
        rentalRow = data;
        break;
      }
    }

    if (!rentalRow) {
      const referenceCandidates = Array.from(
        new Set(
          codeCandidates
            .flatMap((candidate) => {
              const lower = candidate.toLowerCase();
              if (lower.startsWith(DEPOT_RENTAL_QR_PREFIX)) {
                return [sanitizeDepotScanCode(candidate.slice(candidate.indexOf(':') + 1)), candidate];
              }
              return [candidate];
            })
            .filter(Boolean),
        ),
      );

      for (const candidate of referenceCandidates) {
        const { data, error } = await supabase
          .from('rentals')
          .select('id, client_id, reference_code, title, status, start_date, end_date, location, delivery_address, pickup_address, description, notes, total_price')
          .ilike('reference_code', candidate)
          .limit(1)
          .maybeSingle();
        if (error) {
          console.warn('[depot/resolve-rental] lookup by reference failed', { candidate, error });
          continue;
        }
        if (data?.id) {
          rentalRow = data;
          break;
        }
      }
    }

    if (!rentalRow) {
      return res.json({ ok: true, found: false });
    }

    const [itemsRes, reservationsRes, clientInfo] = await Promise.all([
      supabase
        .from('rental_items')
        .select('id, equipment_id, quantity, is_external, external_name, external_type, external_subtype, equipment:equipment_id(id, name, type)')
        .eq('rental_id', rentalRow.id),
      supabase
        .from('rental_unit_reservations')
        .select('equipment_id, equipment_unit_id, equipment_unit:equipment_unit_id(id, serial_number, status)')
        .eq('rental_id', rentalRow.id),
      fetchDepotClientInfo(rentalRow.client_id || null),
    ]);

    if (itemsRes.error) {
      console.warn('[depot/resolve-rental] items lookup failed', itemsRes.error);
    }
    if (reservationsRes.error) {
      console.warn('[depot/resolve-rental] reservations lookup failed', reservationsRes.error);
    }

    const serialsByEquipmentId = {};
    (reservationsRes.data || []).forEach((row) => {
      const equipmentIdForRow = row.equipment_id || null;
      if (!equipmentIdForRow) return;
      if (!serialsByEquipmentId[equipmentIdForRow]) serialsByEquipmentId[equipmentIdForRow] = [];
      serialsByEquipmentId[equipmentIdForRow].push({
        id: row.equipment_unit?.id || row.equipment_unit_id || null,
        serial_number: row.equipment_unit?.serial_number || null,
        status: row.equipment_unit?.status || null,
      });
    });

    const items = (itemsRes.data || []).map((row) => {
      const equipmentIdForRow = row.equipment_id || null;
      const isExternal = row.is_external === true;
      const externalLabel = [row.external_type, row.external_subtype].filter(Boolean).join(' / ');
      return {
        key: row.id || `${equipmentIdForRow || 'external'}-${Math.random().toString(36).slice(2, 8)}`,
        label: isExternal
          ? (row.external_name || 'Matériel externe')
          : (row.equipment?.name || 'Matériel'),
        typeLabel: isExternal
          ? (externalLabel || 'Externe')
          : (row.equipment?.type || 'Type —'),
        quantity: Number(row.quantity || 0),
        serials: equipmentIdForRow ? (serialsByEquipmentId[equipmentIdForRow] || []) : [],
      };
    });

    return res.json({
      ok: true,
      found: true,
      rental: {
        id: rentalRow.id || null,
        reference_code: rentalRow.reference_code || null,
        title: rentalRow.title || null,
        status: rentalRow.status || null,
        start_date: rentalRow.start_date || null,
        end_date: rentalRow.end_date || null,
        location: rentalRow.location || null,
        delivery_address: rentalRow.delivery_address || null,
        pickup_address: rentalRow.pickup_address || null,
        description: rentalRow.description || null,
        notes: rentalRow.notes || null,
        total_price: typeof rentalRow.total_price === 'number' ? rentalRow.total_price : null,
        client_name: clientInfo.name,
        client_email: clientInfo.email,
        client_phone: clientInfo.phone,
      },
      items,
    });
  } catch (err) {
    console.error('[depot/resolve-rental] unexpected error', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Impossible de résoudre la prestation',
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: 'Adresse e-mail invalide' });
    }
    if (typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ error: 'Mot de passe requis' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.rpc('login_user', {
      p_email: normalizedEmail,
      p_password: password,
    });

    if (error) {
      console.error('[auth/login] rpc error', error);
      const message = typeof error?.message === 'string' && error.message.includes('fetch failed')
        ? 'Service Supabase indisponible. Vérifiez la connexion réseau ou la configuration des clés.'
        : 'Impossible de se connecter';
      const status = message.startsWith('Service Supabase') ? 503 : 500;
      return res.status(status).json({ error: message });
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    return res.json({ ok: true, user: row });
  } catch (err) {
    console.error('[auth/login] unexpected error', err);
    const message = err instanceof Error ? err.message : 'Impossible de se connecter';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/auth/confirm-two-factor', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    const { challengeId, code } = req.body || {};
    if (typeof challengeId !== 'string' || !challengeId.trim()) {
      return res.status(400).json({ error: 'Challenge 2FA invalide' });
    }
    if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
      return res.status(400).json({ error: 'Code 2FA invalide' });
    }

    const { data, error } = await supabase.rpc('confirm_two_factor_code', {
      p_challenge_id: challengeId.trim(),
      p_code: code.trim(),
    });

    if (error) {
      console.error('[auth/confirm-two-factor] rpc error', error);
      const message = typeof error?.message === 'string' && error.message.includes('fetch failed')
        ? 'Service Supabase indisponible. Vérifiez la connexion réseau ou la configuration des clés.'
        : 'Impossible de vérifier le code 2FA';
      const status = message.startsWith('Service Supabase') ? 503 : 500;
      return res.status(status).json({ error: message });
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row?.user_id) {
      return res.status(400).json({ error: 'Code invalide ou expiré' });
    }

    return res.json({ ok: true, user: row });
  } catch (err) {
    console.error('[auth/confirm-two-factor] unexpected error', err);
    const message = err instanceof Error ? err.message : 'Impossible de vérifier le code 2FA';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/auth/request-reset', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: 'Adresse e-mail invalide' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.rpc('request_password_reset', { p_email: normalizedEmail });
    if (error) {
      console.error('[auth/request-reset] rpc error', error);
      const message = typeof error?.message === 'string' && error.message.includes('fetch failed')
        ? 'Service Supabase indisponible. Vérifiez la connexion réseau ou la configuration des clés.'
        : 'Impossible de générer un code de réinitialisation';
      const status = message.startsWith('Service Supabase') ? 503 : 500;
      return res.status(status).json({ error: message });
    }
    const payload = Array.isArray(data) ? data[0] : data;
    const code = payload?.code;
    const expiresAt = payload?.expires_at;
    if (!code) {
      return res.json({ ok: true });
    }

    const mailConfig = readMailConfig({ includeSecrets: true });
    const transporter = buildTransporter(mailConfig);
    const fromAddress = mailConfig.user || RESET_MAIL_SENDER;
    const expiresDate = expiresAt ? new Date(expiresAt) : null;
    const expiryText = expiresDate ? expiresDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '15 minutes';

    const textBody = [
      'Bonjour,',
      '',
      'Vous avez demandé la réinitialisation de votre mot de passe Open RIG.',
      `Votre code de sécurité est : ${code}`,
      `Ce code expirera à ${expiryText}.`,
      '',
      "Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message.",
      '',
      '--',
      'Open RIG',
    ].join('\n');

    const codeDigits = (`${code || ''}`.padEnd(6, '•')).slice(0, 6).split('');
    const htmlBody = renderBrandEmail({
      headline: 'Code de réinitialisation',
      subtitle: 'Utilisez ce code temporaire pour mettre à jour votre mot de passe Open RIG.',
      boxesHtml: buildBoxesHtml(codeDigits),
      footerLine: `Code valable jusqu'à ${expiryText}`,
      note: "Nous vous recommandons de terminer la procédure dès que possible.<br />Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message.",
    });

    await transporter.sendMail({
      from: `"Open RIG" <${fromAddress}>`,
      to: normalizedEmail,
      subject: RESET_MAIL_SUBJECT,
      text: textBody,
      html: htmlBody,
    });

    res.json({ ok: true, expires_at: expiresAt });
  } catch (err) {
    console.error('[auth/request-reset] send error', err);
    const message = err instanceof Error ? err.message : "Impossible d'envoyer le code";
    res.status(500).json({ error: message });
  }
});

app.post('/api/auth/request-two-factor', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    if (!HAS_SUPABASE_SERVICE_KEY) {
      return res.status(503).json({
        error: 'Clé de service Supabase manquante. Définissez SUPABASE_SERVICE_ROLE_KEY dans le fichier .env du serveur.',
      });
    }
    const { userId } = req.body || {};
    if (typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
      return res.status(400).json({ error: 'Identifiant utilisateur invalide' });
    }

    const { data, error } = await supabase.rpc('request_two_factor_code', { p_user_id: userId });
    if (error) {
      console.error('[auth/request-two-factor] rpc error', error);
      await insertLoginAudit({
        userId,
        success: false,
        method: 'email_2fa',
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      });
      const message = typeof error?.message === 'string' && error.message.includes('fetch failed')
        ? 'Service Supabase indisponible. Vérifiez la connexion réseau ou la configuration des clés.'
        : typeof error?.message === 'string' && /permission denied/i.test(error.message)
          ? 'Accès refusé pour la fonction 2FA. Vérifiez que la clé SUPABASE_SERVICE_ROLE_KEY est correctement définie.'
          : typeof error?.message === 'string' && /request_two_factor_code/i.test(error.message)
            ? 'Fonction request_two_factor_code absente. Exécutez les dernières migrations Supabase.'
            : 'Impossible de générer un code 2FA';
      const status = message.startsWith('Service Supabase') ? 503
        : message.startsWith('Accès refusé') ? 503
          : message.startsWith('Fonction request_two_factor_code') ? 500
            : 500;
      return res.status(status).json({ error: message });
    }

    const payload = Array.isArray(data) ? data[0] : data;
    const challengeId = payload?.challenge_id;
    const code = payload?.code;
    const expiresAt = payload?.expires_at;
    const targetEmail = payload?.email;

    if (!challengeId || !code || !targetEmail) {
      return res.status(400).json({ error: '2FA indisponible pour cet utilisateur' });
    }

    const mailConfig = readMailConfig({ includeSecrets: true });
    const transporter = buildTransporter(mailConfig);
    const fromAddress = mailConfig.user || RESET_MAIL_SENDER;
    const expiresDate = expiresAt ? new Date(expiresAt) : null;
    const expiryText = expiresDate ? expiresDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '10 minutes';

    const textBody = [
      'Bonjour,',
      '',
      'Pour terminer votre connexion à Open RIG, saisissez le code de vérification ci-dessous :',
      '',
      `Code de vérification : ${code}`,
      `Ce code expirera à ${expiryText}.`,
      '',
      "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer ce message.",
      '',
      '--',
      'Open RIG',
    ].join('\n');

    const codeDigits = (`${code || ''}`.padEnd(6, '•')).slice(0, 6).split('');
    const htmlBody = renderBrandEmail({
      headline: 'Code de connexion',
      subtitle: 'Entrez ce code temporaire pour sécuriser votre connexion à Open RIG.',
      boxesHtml: buildBoxesHtml(codeDigits),
      footerLine: `Code valable jusqu'à ${expiryText}`,
      note: "Ne partagez jamais ce code. Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message.",
    });

    await transporter.sendMail({
      from: `"Open RIG" <${fromAddress}>`,
      to: targetEmail,
      subject: TWO_FACTOR_MAIL_SUBJECT,
      text: textBody,
      html: htmlBody,
    });

    await insertLoginAudit({
      userId,
      success: true,
      method: 'email_2fa',
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return res.json({
      ok: true,
      challenge_id: challengeId,
      expires_at: expiresAt,
      email: targetEmail,
    });
  } catch (err) {
    console.error('[auth/request-two-factor] send error', err);
    await insertLoginAudit({
      userId: req.body?.userId,
      success: false,
      method: 'email_2fa',
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    });
    const message = err instanceof Error ? err.message : "Impossible d'envoyer le code 2FA";
    return res.status(500).json({ error: message });
  }
});

app.post('/api/auth/totp/setup', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    if (!HAS_SUPABASE_SERVICE_KEY) {
      return res.status(503).json({ error: 'Clé de service Supabase manquante.' });
    }
    const { userId } = req.body || {};
    if (typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
      return res.status(400).json({ error: 'Identifiant utilisateur invalide' });
    }

    const { data: userRow, error: userErr } = await supabase
      .from('app_users')
      .select('id, email')
      .eq('id', userId)
      .maybeSingle();
    if (userErr) {
      console.error('[auth/totp/setup] fetch error', userErr);
      return res.status(500).json({ error: "Impossible de récupérer l'utilisateur" });
    }
    if (!userRow) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    const secret = generateTotpSecret(20);
    const otpAuthUrl = buildOtpAuthUrl(userRow.email, secret);
    const { error: updateErr } = await supabase
      .from('app_users')
      .update({
        two_factor_totp_secret: secret,
        two_factor_totp_enabled: false,
        two_factor_totp_enabled_at: null,
      })
      .eq('id', userId);
    if (updateErr) {
      console.error('[auth/totp/setup] update error', updateErr);
      return res.status(500).json({ error: "Impossible d'initialiser le secret TOTP" });
    }

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(otpAuthUrl)}`;
    return res.json({
      ok: true,
      secret,
      otpauth_url: otpAuthUrl,
      qr_url: qrUrl,
    });
  } catch (err) {
    console.error('[auth/totp/setup] unexpected error', err);
    const message = err instanceof Error ? err.message : 'Erreur inattendue';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/auth/totp/verify', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    if (!HAS_SUPABASE_SERVICE_KEY) {
      return res.status(503).json({ error: 'Clé de service Supabase manquante.' });
    }
    const { userId, code } = req.body || {};
    if (typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
      return res.status(400).json({ error: 'Identifiant utilisateur invalide' });
    }
    if (typeof code !== 'string' || code.trim().length < 3) {
      return res.status(400).json({ error: 'Code TOTP invalide' });
    }
    const { data: userRow, error: userErr } = await supabase
      .from('app_users')
      .select('id, email, two_factor_totp_secret, two_factor_totp_enabled')
      .eq('id', userId)
      .maybeSingle();
    if (userErr) {
      console.error('[auth/totp/verify] fetch error', userErr);
      return res.status(500).json({ error: 'Impossible de vérifier le secret TOTP' });
    }
    if (!userRow || !userRow.two_factor_totp_secret) {
      return res.status(400).json({ error: 'Aucun secret TOTP en attente' });
    }
    const isValid = verifyTotp(code, userRow.two_factor_totp_secret);
    if (!isValid) {
      await insertLoginAudit({
        userId,
        success: false,
        method: 'totp',
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      });
      return res.status(400).json({ error: 'Code TOTP invalide' });
    }
    const nowIso = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('app_users')
      .update({
        two_factor_totp_enabled: true,
        two_factor_totp_enabled_at: userRow.two_factor_totp_enabled ? userRow.two_factor_totp_enabled_at : nowIso,
      })
      .eq('id', userId);
    if (updateErr) {
      console.error('[auth/totp/verify] update error', updateErr);
      return res.status(500).json({ error: "Impossible d'activer TOTP" });
    }
    await insertLoginAudit({
      userId,
      success: true,
      method: 'totp',
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[auth/totp/verify] unexpected error', err);
    const message = err instanceof Error ? err.message : 'Erreur inattendue';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/auth/totp/disable', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    if (!HAS_SUPABASE_SERVICE_KEY) {
      return res.status(503).json({ error: 'Clé de service Supabase manquante.' });
    }
    const { userId } = req.body || {};
    if (typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
      return res.status(400).json({ error: 'Identifiant utilisateur invalide' });
    }
    const { error: updateErr } = await supabase
      .from('app_users')
      .update({
        two_factor_totp_secret: null,
        two_factor_totp_enabled: false,
        two_factor_totp_enabled_at: null,
      })
      .eq('id', userId);
    if (updateErr) {
      console.error('[auth/totp/disable] update error', updateErr);
      return res.status(500).json({ error: 'Impossible de désactiver TOTP' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[auth/totp/disable] unexpected error', err);
    const message = err instanceof Error ? err.message : 'Erreur inattendue';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/auth/confirm-two-factor-totp', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    if (!HAS_SUPABASE_SERVICE_KEY) {
      return res.status(503).json({ error: 'Clé de service Supabase manquante.' });
    }
    const { userId, code } = req.body || {};
    if (typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
      return res.status(400).json({ error: 'Identifiant utilisateur invalide' });
    }
    if (typeof code !== 'string' || code.trim().length < 3) {
      return res.status(400).json({ error: 'Code TOTP invalide' });
    }

    const { data: userRow, error: userErr } = await supabase
      .from('app_users')
      .select('id, email, two_factor_totp_secret, two_factor_totp_enabled, two_factor_totp_enabled_at')
      .eq('id', userId)
      .maybeSingle();
    if (userErr) {
      console.error('[auth/confirm-two-factor-totp] fetch error', userErr);
      return res.status(500).json({ error: 'Impossible de récupérer TOTP' });
    }
    if (!userRow || !userRow.two_factor_totp_secret || !userRow.two_factor_totp_enabled) {
      await insertLoginAudit({
        userId,
        success: false,
        method: 'totp',
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      });
      return res.status(400).json({ error: 'TOTP non configuré pour cet utilisateur' });
    }
    if (!verifyTotp(code, userRow.two_factor_totp_secret)) {
      await insertLoginAudit({
        userId,
        success: false,
        method: 'totp',
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      });
      return res.status(400).json({ error: 'Code TOTP invalide' });
    }

    if (!userRow.two_factor_totp_enabled_at) {
      await supabase
        .from('app_users')
        .update({ two_factor_totp_enabled_at: new Date().toISOString() })
        .eq('id', userId);
    }

    const payload = await fetchLoginContext(userId);
    if (!payload) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    await insertLoginAudit({
      userId,
      success: true,
      method: 'totp',
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ ok: true, user: payload });
  } catch (err) {
    console.error('[auth/confirm-two-factor-totp] unexpected error', err);
    const message = err instanceof Error ? err.message : 'Erreur inattendue';
    return res.status(500).json({ error: message });
  }
});

app.get('/api/auth/two-factor/:id', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    if (!HAS_SUPABASE_SERVICE_KEY) {
      return res.status(503).json({ error: 'Clé de service Supabase manquante.' });
    }
    const { id } = req.params;
    if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'Identifiant utilisateur invalide' });
    }
    const payload = await fetchLoginContext(id);
    if (!payload) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    return res.json({
      ok: true,
      two_factor_email_enabled: payload.two_factor_email_enabled,
      two_factor_enabled_at: payload.two_factor_enabled_at,
      two_factor_totp_enabled: payload.two_factor_totp_enabled,
      two_factor_totp_enabled_at: payload.two_factor_totp_enabled_at,
    });
  } catch (err) {
    console.error('[auth/two-factor/:id] unexpected error', err);
    const message = err instanceof Error ? err.message : 'Erreur inattendue';
    return res.status(500).json({ error: message });
  }
});

app.get('/api/auth/two-factor/:id/logs', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    if (!HAS_SUPABASE_SERVICE_KEY) {
      return res.status(503).json({ error: 'Clé de service Supabase manquante.' });
    }
    const { id } = req.params;
    if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'Identifiant utilisateur invalide' });
    }
    const { data, error } = await supabase
      .from('auth_login_audit')
      .select('id, user_id, ip_address, user_agent, success, method, location, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(25);
    if (error) {
      console.error('[auth/two-factor/logs] fetch error', error);
      return res.status(500).json({ error: 'Impossible de récupérer les sessions' });
    }
    return res.json({ ok: true, logs: data ?? [] });
  } catch (err) {
    console.error('[auth/two-factor/:id/logs] unexpected error', err);
    const message = err instanceof Error ? err.message : 'Erreur inattendue';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/profile/avatar', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    if (!HAS_SUPABASE_SERVICE_KEY) {
      return res.status(503).json({ error: 'Clé de service Supabase manquante.' });
    }
    const { userId, filename, contentType, data } = req.body || {};
    if (typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
      return res.status(400).json({ error: 'Identifiant utilisateur invalide' });
    }
    if (typeof data !== 'string' || data.length === 0) {
      return res.status(400).json({ error: 'Données de fichier manquantes' });
    }
    const safeExt = typeof filename === 'string' && filename.includes('.') ? filename.split('.').pop() : 'jpg';
    const safeContentType = typeof contentType === 'string' && contentType.includes('/') ? contentType : 'image/jpeg';
    const filePath = `${userId}/${Date.now()}.${safeExt}`;
    const buffer = Buffer.from(data, 'base64');

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, buffer, {
        upsert: true,
        contentType: safeContentType,
        cacheControl: '3600',
      });
    if (uploadError) {
      console.error('[profile/avatar] upload error', uploadError);
      return res.status(500).json({ error: uploadError.message || 'Échec du téléversement' });
    }

    const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
    const publicUrl = publicUrlData?.publicUrl;
    if (!publicUrl) {
      return res.status(500).json({ error: 'URL publique indisponible' });
    }

    await supabase
      .from('app_users')
      .update({ avatar_url: publicUrl })
      .eq('id', userId);

    return res.json({ ok: true, url: publicUrl });
  } catch (err) {
    console.error('[profile/avatar] unexpected error', err);
    const message = err instanceof Error ? err.message : 'Erreur inattendue';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/equipment/image', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    if (!HAS_SUPABASE_SERVICE_KEY) {
      return res.status(503).json({ error: 'Cle de service Supabase manquante.' });
    }

    const { filename, contentType, data, scope } = req.body || {};
    if (typeof data !== 'string' || data.length === 0) {
      return res.status(400).json({ error: 'Donnees de fichier manquantes' });
    }

    const safeScope = scope === 'pack'
      ? 'packs'
      : scope === 'accessory'
        ? 'accessories'
        : 'equipment';
    const rawExt = typeof filename === 'string' && filename.includes('.') ? filename.split('.').pop() : 'jpg';
    const safeExt = String(rawExt || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const safeContentType = typeof contentType === 'string' && contentType.startsWith('image/')
      ? contentType
      : 'image/jpeg';
    const filePath = `${safeScope}/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${crypto.randomUUID()}.${safeExt}`;
    const buffer = Buffer.from(data, 'base64');

    const { error: uploadError } = await supabase.storage
      .from(EQUIPMENT_IMAGE_BUCKET)
      .upload(filePath, buffer, {
        upsert: false,
        contentType: safeContentType,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('[equipment/image] upload error', uploadError);
      return res.status(500).json({ error: uploadError.message || 'Echec du televersement' });
    }

    const { data: publicUrlData } = supabase.storage.from(EQUIPMENT_IMAGE_BUCKET).getPublicUrl(filePath);
    const publicUrl = publicUrlData?.publicUrl;
    if (!publicUrl) {
      return res.status(500).json({ error: 'URL publique indisponible' });
    }

    return res.json({ ok: true, url: publicUrl });
  } catch (err) {
    console.error('[equipment/image] unexpected error', err);
    const message = err instanceof Error ? err.message : 'Erreur inattendue';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/auth/confirm-reset', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body || {};
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: 'Adresse e-mail invalide' });
    }
    if (typeof code !== 'string' || code.trim().length < 4) {
      return res.status(400).json({ error: 'Code invalide' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const sanitizedCode = code.trim();
    const { data, error } = await supabase.rpc('confirm_password_reset', {
      p_email: normalizedEmail,
      p_code: sanitizedCode,
      p_new_password: newPassword,
    });
    if (error) {
      console.error('[auth/confirm-reset] rpc error', error);
      const message = typeof error?.message === 'string' && error.message.includes('fetch failed')
        ? 'Service Supabase indisponible. Vérifiez la connexion réseau ou la configuration des clés.'
        : 'Impossible de valider le code de réinitialisation';
      const status = message.startsWith('Service Supabase') ? 503 : 500;
      return res.status(status).json({ error: message });
    }
    const success = data === true;
    if (!success) {
      return res.status(400).json({ error: 'Code invalide ou expiré' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth/confirm-reset] error', err);
    const message = err instanceof Error ? err.message : 'Impossible de réinitialiser le mot de passe';
    res.status(500).json({ error: message });
  }
});

app.post('/api/personnel/create-user', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client not configured' });
  }
  const payload = req.body || {};
  const legacyFullName = sanitizeNullableString(payload.fullName);
  let safeFirstName = sanitizeNullableString(payload.firstName);
  let safeLastName = sanitizeNullableString(payload.lastName);

  if ((!safeFirstName || !safeLastName) && legacyFullName) {
    const parts = legacyFullName.split(/\s+/).filter(Boolean);
    safeFirstName = safeFirstName || parts.shift() || null;
    safeLastName = safeLastName || parts.join(' ') || null;
  }

  if (!safeFirstName || !safeLastName) {
    return res.status(400).json({ error: 'Le prenom et le nom sont requis' });
  }

  const createAppUser = payload.createAppUser !== false;
  const safeName = `${safeFirstName} ${safeLastName}`.trim();
  const normalizedContactEmail = sanitizeNullableString(payload.contactEmail ?? payload.email, { toLowerCase: true });
  const normalizedLoginEmail = sanitizeNullableString(payload.loginEmail ?? payload.email, { toLowerCase: true });
  const safeRole = sanitizeNullableString(payload.role) || 'manager';
  const safeStatus = sanitizeNullableString(payload.status) || 'active';
  const safePhone = sanitizeNullableString(payload.phone);
  const safeJobTitle = sanitizeNullableString(payload.jobTitle);
  const safeHireDate = sanitizeNullableString(payload.hireDate) || new Date().toISOString().slice(0, 10);
  const safeEmploymentType = sanitizeNullableString(payload.employmentType) || 'employee';
  const safePaymentModel = sanitizeNullableString(payload.paymentModel) || 'salary';
  const safeSalary = sanitizeNullableNumber(payload.salary) ?? 0;
  const safeHourlyRate = sanitizeNullableNumber(payload.hourlyRate);
  const safeDayRate = sanitizeNullableNumber(payload.dayRate);
  const safeCachetRate = sanitizeNullableNumber(payload.cachetRate);
  const safeAddress = sanitizeNullableString(payload.address);
  const safePayrollNotes = sanitizeNullableString(payload.payrollNotes);

  if (normalizedContactEmail && !EMAIL_REGEX.test(normalizedContactEmail)) {
    return res.status(400).json({ error: 'Adresse e-mail de contact invalide' });
  }

  if (createAppUser && (!normalizedLoginEmail || !EMAIL_REGEX.test(normalizedLoginEmail))) {
    return res.status(400).json({ error: 'Adresse e-mail de connexion invalide' });
  }

  const temporaryPassword = createAppUser ? generatePassword(12) : null;

  try {
    if (!createAppUser) {
      const { data, error } = await supabase
        .from('personnel_directory')
        .insert({
          first_name: safeFirstName,
          last_name: safeLastName,
          email: normalizedContactEmail,
          phone: safePhone || '',
          role: safeRole,
          status: safeStatus,
          hire_date: safeHireDate,
          salary: safeSalary,
          address: safeAddress || '',
          employment_type: safeEmploymentType,
          payment_model: safePaymentModel,
          default_hourly_rate: safeHourlyRate,
          default_day_rate: safeDayRate,
          default_cachet_rate: safeCachetRate,
          job_title: safeJobTitle,
          payroll_notes: safePayrollNotes,
        })
        .select('id')
        .single();

      if (error) {
        console.error('[personnel/create-user] standalone insert error', error);
        return res.status(500).json({ error: 'Impossible de creer la fiche crew' });
      }

      return res.status(201).json({
        ok: true,
        personnel_id: data?.id,
        user_id: null,
        has_app_user: false,
      });
    }

    const { data, error } = await supabase.rpc('create_user', {
      p_email: normalizedLoginEmail,
      p_full_name: safeName,
      p_password: temporaryPassword,
      p_role: safeRole,
      p_phone: safePhone,
      p_job_title: safeJobTitle,
    });

    if (error) {
      console.error('[personnel/create-user] rpc error', error);
      const missingFunction = typeof error?.message === 'string' && error.message.includes('create_user');
      const missingTables = typeof error?.message === 'string'
        && /(app_user_profiles|app_user_hr|app_permissions)/i.test(error.message);
      const duplicate = typeof error?.message === 'string' && error.message.includes('duplicate key value');
      const message = duplicate
        ? 'Un utilisateur avec cet email existe deja'
        : missingFunction || missingTables
          ? 'Fonction Supabase create_user absente ou schema non a jour. Executez les migrations Supabase.'
          : 'Impossible de creer l utilisateur';
      const status = duplicate ? 409 : 500;
      return res.status(status).json({
        error: message,
        supabase: {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code,
        },
      });
    }

    const createdId = Array.isArray(data) ? data[0] : data;
    if (!createdId || typeof createdId !== 'string') {
      console.error('[personnel/create-user] unexpected rpc payload', data);
      return res.status(500).json({ error: 'Reponse inattendue du service Supabase' });
    }

    const cleanupUser = async () => {
      try {
        await supabase.from('app_users').delete().eq('id', createdId);
      } catch (cleanupErr) {
        console.error('[personnel/create-user] cleanup failed', cleanupErr);
      }
    };

    const safeLoginUrl = escapeHtml(LOGIN_URL);

    const { error: profileErr } = await supabase.from('app_user_profiles').upsert(
      {
        user_id: createdId,
        phone: safePhone,
        job_title: safeJobTitle,
      },
      { onConflict: 'user_id' },
    );
    if (profileErr) {
      console.error('[personnel/create-user] profile error', profileErr);
      await cleanupUser();
      return res.status(500).json({ error: 'Impossible de finaliser la creation du crew' });
    }

    const { error: hrErr } = await supabase.from('app_user_hr').upsert(
      {
        user_id: createdId,
        role: safeRole,
        status: safeStatus,
        hire_date: safeHireDate,
        salary: safeSalary,
        address: safeAddress,
        employment_type: safeEmploymentType,
        payment_model: safePaymentModel,
        default_hourly_rate: safeHourlyRate,
        default_day_rate: safeDayRate,
        default_cachet_rate: safeCachetRate,
        payroll_notes: safePayrollNotes,
      },
      { onConflict: 'user_id' },
    );
    if (hrErr) {
      console.error('[personnel/create-user] hr error', hrErr);
      await cleanupUser();
      return res.status(500).json({ error: 'Impossible de finaliser la creation du crew' });
    }

    const { error: flagErr } = await supabase
      .from('app_users')
      .update({ must_change_password: true, password_changed_at: null })
      .eq('id', createdId);
    if (flagErr) {
      console.error('[personnel/create-user] flag error', flagErr);
      await cleanupUser();
      return res.status(500).json({ error: 'Impossible de finaliser la creation de l utilisateur' });
    }

    try {
      const mailConfig = readMailConfig({ includeSecrets: true });
      const transporter = buildTransporter(mailConfig);
      const fromAddress = mailConfig.user || RESET_MAIL_SENDER;
      const passwordBoxHtml = buildPasswordBoxHtml(temporaryPassword);
      const htmlBody = renderBrandEmail({
        headline: 'Bienvenue sur Open RIG',
        subtitle: `${escapeHtml(safeName)}, votre acces est pret. Utilisez le mot de passe temporaire ci-dessous pour vous connecter.`,
        boxesHtml: passwordBoxHtml,
        footerLine: `Connectez-vous sur <a href="${safeLoginUrl}" style="color:#bfdbfe;text-decoration:none;">${safeLoginUrl}</a>`,
        note: escapeHtml('Changez votre mot de passe des votre premiere connexion.'),
      });

      const textBody = [
        `Bonjour ${safeName},`,
        '',
        'Votre compte Open RIG vient d etre cree.',
        `Mot de passe temporaire : ${temporaryPassword}`,
        `Connectez-vous : ${LOGIN_URL}`,
        'Changez votre mot de passe des votre premiere connexion.',
        '',
        '--',
        'Open RIG',
      ].join('\n');

      await transporter.sendMail({
        from: `"Open RIG" <${fromAddress}>`,
        to: normalizedLoginEmail,
        subject: ONBOARDING_MAIL_SUBJECT,
        text: textBody,
        html: htmlBody,
      });
    } catch (mailErr) {
      console.error('[personnel/create-user] mail error', mailErr);
      await cleanupUser();
      const rawMessage = mailErr instanceof Error ? mailErr.message : 'Impossible d envoyer le mot de passe temporaire';
      const message = rawMessage.includes('Mail configuration incomplete')
        ? 'Serveur SMTP non configure'
        : rawMessage;
      return res.status(500).json({ error: message });
    }

    return res.status(201).json({
      ok: true,
      personnel_id: createdId,
      user_id: createdId,
      has_app_user: true,
    });
  } catch (err) {
    console.error('[personnel/create-user] unexpected error', err);
    const message = err instanceof Error ? err.message : 'Erreur inattendue';
    return res.status(500).json({ error: message });
  }
});

app.delete('/api/personnel/:id', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client not configured' });
  }
  const { id } = req.params;
  if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'Identifiant invalide' });
  }
  try {
    const { data, error } = await supabase.rpc('delete_user_cascade', { p_user_id: id });
    if (error) {
      console.error('[personnel/delete] rpc error', error);
      const message = typeof error?.message === 'string' && error.message.includes('fetch failed')
        ? 'Service Supabase indisponible. Vérifiez la connexion réseau ou la configuration des clés.'
        : "Impossible de supprimer l'utilisateur";
      const status = message.startsWith('Service Supabase') ? 503 : 500;
      return res.status(status).json({ error: message });
    }
    if (data === true) {
      return res.json({ ok: true });
    }

    const { data: standaloneRow, error: standaloneErr } = await supabase
      .from('personnel_directory')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (standaloneErr) {
      console.error('[personnel/delete] standalone delete error', standaloneErr);
      return res.status(500).json({ error: 'Impossible de supprimer le crew' });
    }

    if (!standaloneRow) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[personnel/delete] unexpected error', err);
    const message = err instanceof Error ? err.message : 'Erreur inattendue';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/personnel/delete-bulk', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client not configured' });
  }
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
  if (!ids || ids.length === 0) {
    return res.status(400).json({ error: "Liste d'identifiants requise" });
  }
  const uniqueIds = [...new Set(ids.filter((value) => typeof value === 'string' && UUID_REGEX.test(value.trim())).map((value) => value.trim()))];
  if (uniqueIds.length === 0) {
    return res.status(400).json({ error: 'Aucun identifiant valide fourni' });
  }
  const failures = [];
  for (const userId of uniqueIds) {
    try {
      const { data, error } = await supabase.rpc('delete_user_cascade', { p_user_id: userId });
      if (error) {
        console.error('[personnel/delete-bulk] rpc error', error);
        failures.push({ id: userId, message: error.message || 'Erreur Supabase' });
      } else if (data !== true) {
        const { data: standaloneRow, error: standaloneErr } = await supabase
          .from('personnel_directory')
          .delete()
          .eq('id', userId)
          .select('id')
          .maybeSingle();

        if (standaloneErr) {
          console.error('[personnel/delete-bulk] standalone delete error', standaloneErr);
          failures.push({ id: userId, message: standaloneErr.message || 'Erreur Supabase' });
        } else if (!standaloneRow) {
          failures.push({ id: userId, message: 'Utilisateur introuvable' });
        }
      }
    } catch (err) {
      console.error('[personnel/delete-bulk] unexpected error', err);
      failures.push({ id: userId, message: err instanceof Error ? err.message : 'Erreur inconnue' });
    }
  }
  if (failures.length > 0) {
    return res.status(207).json({ ok: false, failures });
  }
  return res.json({ ok: true, deleted: uniqueIds.length });
});

app.post('/api/system/mail-test', async (req, res) => {
  try {
    const config = readMailConfig({ includeSecrets: true });
    if (!config.user || !config.pass) {
      return res.status(400).json({ error: 'Credentials are required to test SMTP connectivity' });
    }

    const transporter = buildTransporter(config);
    await transporter.verify();

    let sendInfo = null;
    if (req.body && req.body.send === true) {
      const rawTo = typeof req.body.to === 'string' ? req.body.to.trim() : '';
      const to = rawTo.includes('@') ? rawTo : config.user;
      const fromAddress = config.user || RESET_MAIL_SENDER;
      sendInfo = await transporter.sendMail({
        from: `"Open RIG" <${fromAddress}>`,
        to,
        subject: 'Test SMTP Open RIG',
        text: "Ceci est un test d'envoi automatique depuis Open RIG.",
      });
    }

    res.json({
      ok: true,
      message: sendInfo ? "Connexion SMTP et test d'envoi réussis" : 'Connexion SMTP réussie',
      envelope: sendInfo?.envelope,
      accepted: sendInfo?.accepted,
    });
  } catch (err) {
    console.error('[mail-config] test error', err);
    const errorMessage = err instanceof Error ? err.message : 'Unable to verify SMTP connection';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/rental-documents/send', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    const { documentId, recipientEmail, recipientName, documentTitle } = req.body || {};
    if (typeof documentId !== 'string' || !UUID_REGEX.test(documentId)) {
      return res.status(400).json({ error: 'Identifiant document invalide' });
    }
    const normalizedEmail = sanitizeNullableString(recipientEmail, { toLowerCase: true });
    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Adresse e-mail invalide' });
    }

    const { data: doc, error: docErr } = await supabase
      .from('rental_documents')
      .select('id, title, doc_type, file_url, rental_id')
      .eq('id', documentId)
      .maybeSingle();
    if (docErr) {
      console.error('[rental-documents/send] read error', docErr);
      return res.status(500).json({ error: 'Impossible de charger le document' });
    }
    if (!doc) {
      return res.status(404).json({ error: 'Document introuvable' });
    }

    let rental = null;
    if (doc.rental_id) {
      const { data: rentalRow, error: rentalErr } = await supabase
        .from('rentals')
        .select('id, title, type, start_date, end_date, location, reference_code, total_price, status, description, notes, delivery_address, pickup_address, clients(name)')
        .eq('id', doc.rental_id)
        .maybeSingle();
      if (rentalErr) {
        console.error('[rental-documents/send] rental error', rentalErr);
      } else {
        rental = rentalRow;
      }
    }

    let items = [];
    if (doc.rental_id) {
      const { data: itemRows, error: itemsErr } = await supabase
        .from('rental_items')
        .select('quantity, is_external, external_name, equipment:equipment_id(name)')
        .eq('rental_id', doc.rental_id)
        .order('created_at', { ascending: true });
      if (itemsErr) {
        console.error('[rental-documents/send] items error', itemsErr);
      } else {
        const map = new Map();
        const order = [];
        (itemRows || []).forEach((row) => {
          const rawName = row.is_external ? row.external_name : row.equipment?.name;
          const name = typeof rawName === 'string' ? rawName.trim() : '';
          if (!name) return;
          if (!map.has(name)) {
            map.set(name, { name, quantity: 0 });
            order.push(name);
          }
          const entry = map.get(name);
          entry.quantity += Number(row.quantity || 0);
        });
        items = order.map((name) => map.get(name)).filter(Boolean);
      }
    }

    const mailConfig = readMailConfig({ includeSecrets: true });
    const transporter = buildTransporter(mailConfig);
    const fromAddress = mailConfig.user || RESET_MAIL_SENDER;

    const docTitle = sanitizeNullableString(documentTitle) || doc.title || 'Document Open RIG';
    const docLabel = doc.doc_type === 'devis'
      ? 'Devis'
      : doc.doc_type === 'facture'
        ? 'Facture'
        : doc.doc_type === 'bon_prepa'
          ? 'Bon de préparation'
          : 'Document';

    const attachment = await buildPdfAttachmentFromStoredValue(doc.file_url, docTitle);
    if (!attachment) {
      return res.status(400).json({ error: 'Pièce jointe indisponible' });
    }

    const clientName = sanitizeNullableString(recipientName);
    const greeting = clientName ? `Bonjour ${clientName},` : 'Bonjour,';
    const rentalReference = formatRentalReference(rental) || docTitle;
    let logoAsset = { logoUrl: null, attachment: null, companyName: null };
    try {
      logoAsset = await getCompanyLogoEmailAsset();
    } catch (err) {
      console.warn('[rental-documents/send] logo fetch error', err);
    }
    const companyName = logoAsset.companyName || 'Open RIG';

    const textBody = [
      greeting,
      '',
      `Votre ${docLabel.toLowerCase()}${rentalReference ? ` (${rentalReference})` : ''} est en pièce jointe.`,
      'Si vous avez une question, répondez simplement à cet email.',
      '',
      '--',
      companyName,
    ].filter(Boolean).join('\n');

    const { html: htmlBody } = buildDocumentEmailHtml({
      greeting,
      docLabel,
      docTitle,
      rental,
      logoUrl: logoAsset.logoUrl,
      companyName,
    });

    await transporter.sendMail({
      from: `"${companyName}" <${fromAddress}>`,
      to: normalizedEmail,
      subject: `${docLabel} ${companyName}${rentalReference ? ` • ${rentalReference}` : ''}`,
      text: textBody,
      html: htmlBody,
      attachments: logoAsset.attachment ? [attachment, logoAsset.attachment] : [attachment],
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[rental-documents/send] mail error', err);
    const message = err instanceof Error ? err.message : "Impossible d'envoyer le document";
    res.status(500).json({ error: message });
  }
});

app.post('/api/rental-documents/request-approval', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    const { documentId, rentalId, recipientEmail, recipientName, documentTitle, accessPassword } = req.body || {};
    const normalizedEmail = sanitizeNullableString(recipientEmail, { toLowerCase: true });
    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Adresse e-mail invalide' });
    }

    let doc = null;
    if (typeof documentId === 'string' && UUID_REGEX.test(documentId)) {
      const { data: docRow, error: docErr } = await supabase
        .from('rental_documents')
        .select('id, title, doc_type, file_url, rental_id')
        .eq('id', documentId)
        .maybeSingle();
      if (docErr) {
        console.error('[rental-documents/request-approval] read error', docErr);
        return res.status(500).json({ error: 'Impossible de charger le document' });
      }
      doc = docRow;
    } else if (typeof rentalId === 'string' && UUID_REGEX.test(rentalId)) {
      const { data: docRow, error: docErr } = await supabase
        .from('rental_documents')
        .select('id, title, doc_type, file_url, rental_id')
        .eq('rental_id', rentalId)
        .eq('doc_type', 'devis')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (docErr) {
        console.error('[rental-documents/request-approval] read error', docErr);
        return res.status(500).json({ error: 'Impossible de charger le document' });
      }
      doc = docRow;
    } else {
      return res.status(400).json({ error: 'Identifiant document invalide' });
    }

    if (!doc) {
      return res.status(404).json({ error: 'Document introuvable' });
    }
    if (doc.doc_type !== 'devis') {
      return res.status(400).json({ error: 'Seuls les devis peuvent être envoyés en demande de validation.' });
    }

    const requestRentalId = doc.rental_id || (typeof rentalId === 'string' ? rentalId : null);
    if (!requestRentalId) {
      return res.status(400).json({ error: 'Document sans prestation associée.' });
    }

    const docTitle = sanitizeNullableString(documentTitle) || doc.title || 'Devis Open RIG';
    const attachment = await buildPdfAttachmentFromStoredValue(doc.file_url, docTitle);
    if (!attachment) {
      return res.status(400).json({ error: 'Pièce jointe indisponible.' });
    }

    let rental = null;
    if (requestRentalId) {
      const { data: rentalRow, error: rentalErr } = await supabase
        .from('rentals')
        .select('id, title, type, start_date, end_date, location, reference_code, total_price, status, description, notes, delivery_address, pickup_address, clients(name)')
        .eq('id', requestRentalId)
        .maybeSingle();
      if (rentalErr) {
        console.error('[rental-documents/request-approval] rental error', rentalErr);
      } else {
        rental = rentalRow;
      }
    }

    const token = crypto.randomBytes(24).toString('hex');
    const verificationCode = generateApprovalCode();
    const decisionCodeHash = hashApprovalCode(token, verificationCode);

    const rawPassword = typeof accessPassword === 'string' ? accessPassword.trim() : '';
    const passwordHash = rawPassword.length > 0 ? hashApprovalPassword(token, rawPassword) : null;

    const { data: requestRow, error: requestErr } = await supabase
      .from('rental_document_requests')
      .insert([{
        rental_id: requestRentalId,
        document_id: doc.id,
        doc_type: doc.doc_type,
        recipient_email: normalizedEmail,
        recipient_name: sanitizeNullableString(recipientName),
        token,
        decision_code_hash: decisionCodeHash,
        access_password_hash: passwordHash,
      }])
      .select('id')
      .maybeSingle();
    if (requestErr) {
      console.error('[rental-documents/request-approval] request error', requestErr);
      return res.status(500).json({ error: 'Impossible de créer la demande de validation.' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const approvalUrl = `${baseUrl}/api/rental-documents/approval/${token}`;

    const mailConfig = readMailConfig({ includeSecrets: true });
    const transporter = buildTransporter(mailConfig);
    const fromAddress = mailConfig.user || RESET_MAIL_SENDER;

    const docLabel = 'Devis';
    const clientName = sanitizeNullableString(recipientName);
    const greeting = clientName ? `Bonjour ${clientName},` : 'Bonjour,';
    const rentalReference = formatRentalReference(rental) || docTitle;
    let logoAsset = { logoUrl: null, attachment: null, companyName: null };
    try {
      logoAsset = await getCompanyLogoEmailAsset();
    } catch (err) {
      console.warn('[rental-documents/request-approval] logo fetch error', err);
    }
    const companyName = logoAsset.companyName || 'Open RIG';

    const textBody = [
      greeting,
      '',
      `Votre ${docLabel.toLowerCase()}${rentalReference ? ` (${rentalReference})` : ''} est en piece jointe.`,
      'Merci de confirmer votre choix via le lien sécurisé ci-dessous :',
      approvalUrl,
      '',
      `Code de vérification : ${verificationCode}`,
      '',
      "Ce code est obligatoire pour valider ou refuser le devis depuis la page de confirmation.",
      '',
      '--',
      companyName,
    ].filter(Boolean).join('\n');

    const { html: htmlBody } = buildApprovalRequestEmailHtml({
      greeting,
      docLabel,
      docTitle,
      rental,
      logoUrl: logoAsset.logoUrl,
      companyName,
      approvalUrl,
      verificationCode,
    });

    await transporter.sendMail({
      from: `"${companyName}" <${fromAddress}>`,
      to: normalizedEmail,
      subject: `${docLabel} ${companyName}${rentalReference ? ` • ${rentalReference}` : ''}`,
      text: textBody,
      html: htmlBody,
      attachments: logoAsset.attachment ? [attachment, logoAsset.attachment] : [attachment],
    });

    res.json({ ok: true, requestId: requestRow?.id || null });
  } catch (err) {
    console.error('[rental-documents/request-approval] mail error', err);
    const message = err instanceof Error ? err.message : "Impossible d'envoyer la demande";
    res.status(500).json({ error: message });
  }
});

app.get('/api/rental-documents/share/:token', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).send('Supabase client not configured');
    }
    const rawToken = typeof req.params?.token === 'string' ? req.params.token.trim() : '';
    if (!rawToken) {
      return res.status(404).send('Not found');
    }

    const { data: share, error: shareErr } = await supabase
      .from('rental_document_shares')
      .select('id, document_id, status, expires_at')
      .eq('token', rawToken)
      .maybeSingle();
    if (shareErr) {
      console.error('[rental-documents/share] share error', shareErr);
      return res.status(500).send('Unable to load share');
    }
    if (!share) {
      return res.status(404).send('Not found');
    }
    if (share.status !== 'active') {
      return res.status(410).send('Link inactive');
    }
    if (share.expires_at) {
      const expiresAt = new Date(share.expires_at);
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
        await supabase
          .from('rental_document_shares')
          .update({ status: 'expired' })
          .eq('id', share.id);
        return res.status(410).send('Link expired');
      }
    }

    const { data: doc, error: docErr } = await supabase
      .from('rental_documents')
      .select('id, title, doc_type, file_url')
      .eq('id', share.document_id)
      .maybeSingle();
    if (docErr) {
      console.error('[rental-documents/share] doc error', docErr);
      return res.status(500).send('Unable to load document');
    }
    if (!doc) {
      return res.status(404).send('Document not found');
    }

    const attachment = await buildPdfAttachmentFromStoredValue(doc.file_url, doc.title || 'document');
    if (!attachment) {
      return res.status(500).send('Document indisponible');
    }

    const downloadParam = typeof req.query?.download === 'string' ? req.query.download : '';
    const download = ['1', 'true', 'yes'].includes(String(downloadParam).toLowerCase());
    res.setHeader('Content-Type', attachment.contentType || 'application/pdf');
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${attachment.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(attachment.content);
  } catch (err) {
    console.error('[rental-documents/share] unexpected error', err);
    return res.status(500).send('Unexpected error');
  }
});

app.get('/api/ical/:token', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).send('Supabase client not configured');
    }
    const token = typeof req.params?.token === 'string' ? req.params.token.trim() : '';
    if (!token) {
      return res.status(404).send('Not found');
    }

    const { data: settings, error: settingsErr } = await supabase
      .from('company_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (settingsErr) {
      console.error('[ical] settings error', settingsErr);
      return res.status(500).send('Unable to load settings');
    }
    if (!settings) {
      return res.status(404).send('Not found');
    }
    let featureMap = {};
    if (settings.features) {
      if (typeof settings.features === 'string') {
        try {
          featureMap = JSON.parse(settings.features);
        } catch {
          featureMap = {};
        }
      } else if (typeof settings.features === 'object') {
        featureMap = { ...(settings.features || {}) };
      }
    }
    const featureIcal = featureMap.ical || {};
    const enabled = typeof settings.ical_enabled === 'boolean'
      ? settings.ical_enabled
      : Boolean(featureIcal.enabled ?? featureMap.ical_enabled);
    const storedToken = typeof settings.ical_token === 'string' && settings.ical_token
      ? settings.ical_token
      : (typeof featureIcal.token === 'string' ? featureIcal.token : featureMap.ical_token);
    if (!enabled || storedToken !== token) {
      return res.status(404).send('Not found');
    }

    const { data: rentals, error: rentalsErr } = await supabase
      .from('rentals')
      .select(`
        id,
        title,
        reference_code,
        start_date,
        end_date,
        location,
        status,
        type,
        created_at,
        client:client_id (
          name
        )
      `)
      .neq('status', 'cancelled')
      .neq('status', 'archived')
      .order('start_date', { ascending: true });
    if (rentalsErr) {
      console.error('[ical] rentals error', rentalsErr);
      return res.status(500).send('Unable to load rentals');
    }

    const typeLabels = {
      rental: 'Location',
      service: 'Prestation',
      sale: 'Vente',
    };

    const calendarName = settings.name ? `${settings.name} · Open RIG` : 'Open RIG';
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'PRODID:-//Open RIG//Calendar//FR',
      `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
      'X-WR-TIMEZONE:UTC',
    ];

    (rentals || []).forEach((row) => {
      const start = toIcsDate(row.start_date);
      const end = toIcsDate(row.end_date);
      if (!start || !end) return;
      const typeLabel = typeLabels[row.type] || 'Prestation';
      const summaryParts = [typeLabel];
      if (row.reference_code) summaryParts.push(row.reference_code);
      if (row.title) summaryParts.push(row.title);
      else if (row?.client?.name) summaryParts.push(row.client.name);
      const summary = summaryParts.join(' · ');

      const descriptionParts = [];
      if (row?.client?.name) descriptionParts.push(`Client: ${row.client.name}`);
      if (row.reference_code) descriptionParts.push(`Référence: ${row.reference_code}`);
      if (row.title) descriptionParts.push(`Titre: ${row.title}`);
      if (row.status) descriptionParts.push(`Statut: ${row.status}`);
      if (row.location) descriptionParts.push(`Lieu: ${row.location}`);
      if (APP_BASE_URL) {
        const base = APP_BASE_URL.endsWith('/') ? APP_BASE_URL.slice(0, -1) : APP_BASE_URL;
        descriptionParts.push(`Lien: ${base}/rentals/${row.id}`);
      }

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:rental-${row.id}@openrig`);
      lines.push(`DTSTAMP:${toIcsDate(row.created_at || row.start_date) || start}`);
      lines.push(`DTSTART:${start}`);
      lines.push(`DTEND:${end}`);
      lines.push(`SUMMARY:${escapeIcsText(summary)}`);
      if (row.location) {
        lines.push(`LOCATION:${escapeIcsText(row.location)}`);
      }
      if (descriptionParts.length > 0) {
        lines.push(`DESCRIPTION:${escapeIcsText(descriptionParts.join('\\n'))}`);
      }
      lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', 'inline; filename="openrig.ics"');
    res.send(lines.join('\r\n'));
  } catch (err) {
    console.error('[ical] unexpected error', err);
    res.status(500).send('Unable to build calendar');
  }
});

app.get('/api/rental-documents/approval/:token', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).send(renderApprovalResponsePage({
        title: 'Service indisponible',
        message: 'Le serveur email est indisponible pour le moment.',
        tone: 'red',
      }));
    }
    const rawToken = typeof req.params.token === 'string' ? req.params.token.trim() : '';
    if (!rawToken) {
      return res.status(400).send(renderApprovalResponsePage({
        title: 'Lien invalide',
        message: 'Ce lien de validation est incomplet.',
        tone: 'red',
      }));
    }

    const { data: requestRow, error: requestErr } = await supabase
      .from('rental_document_requests')
      .select('id, rental_id, document_id, status, expires_at, recipient_email, recipient_name, doc_type, decision_code_hash, decision_attempts, access_password_hash')
      .eq('token', rawToken)
      .maybeSingle();
    if (requestErr) {
      console.error('[rental-documents/approval] fetch error', requestErr);
      return res.status(500).send(renderApprovalResponsePage({
        title: 'Erreur',
        message: 'Impossible de charger la demande.',
        tone: 'red',
      }));
    }
    if (!requestRow) {
      return res.status(404).send(renderApprovalResponsePage({
        title: 'Demande introuvable',
        message: 'Ce lien de validation ne correspond à aucune demande active.',
        tone: 'red',
      }));
    }

    const { data: rental, error: rentalErr } = await supabase
      .from('rentals')
      .select('id, reference_code, title, type, start_date, end_date, location, clients(name), color')
      .eq('id', requestRow.rental_id)
      .maybeSingle();
    if (rentalErr) {
      console.error('[rental-documents/approval] rental error', rentalErr);
    }

    let company = null;
    try {
      const { data: companyRow } = await supabase
        .from('company_settings')
        .select('name, logo_url')
        .eq('id', 1)
        .maybeSingle();
      company = companyRow;
    } catch (_) { /* optional */ }

    const now = new Date();
    if (requestRow.expires_at) {
      const expiresAt = new Date(requestRow.expires_at);
      if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < now.getTime()) {
        if (requestRow.status === 'pending') {
          await supabase.from('rental_document_requests')
            .update({ status: 'expired' })
            .eq('id', requestRow.id);
        }
        return res.status(410).send(renderApprovalResponsePage({
          title: 'Demande expirée',
          message: 'Ce lien de validation est arrivé à expiration.',
          tone: 'red',
        }));
      }
    }

    const attempts = Number(requestRow.decision_attempts || 0);
    if (requestRow.status === 'pending' && attempts >= APPROVAL_MAX_ATTEMPTS) {
      await supabase
        .from('rental_document_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestRow.id)
        .eq('status', 'pending');
      return res.status(423).send(renderApprovalResponsePage({
        title: 'Validation verrouillée',
        message: 'Le nombre maximal de tentatives est atteint. Merci de demander un nouveau lien.',
        tone: 'red',
      }));
    }

    if (requestRow.status !== 'pending') {
      if (requestRow.status === 'modification_requested') {
        return res.status(200).send(renderApprovalResponsePage({
          title: 'Modifications demandées',
          message: 'Votre demande de modification a bien été transmise. Un nouveau devis vous sera envoyé après correction.',
          tone: 'blue',
        }));
      }
      const statusLabel = requestRow.status === 'accepted'
        ? 'Devis déjà accepté'
        : requestRow.status === 'refused'
          ? 'Devis déjà refusé'
          : requestRow.status === 'expired'
            ? 'Demande expirée'
            : 'Demande déjà traitée';
      return res.status(200).send(renderApprovalResponsePage({
        title: statusLabel,
        message: 'Merci, votre réponse est déjà enregistrée.',
        tone: requestRow.status === 'accepted' ? 'green' : requestRow.status === 'refused' ? 'red' : 'blue',
        legalText: requestRow.status === 'accepted'
          ? APPROVAL_CONSENT_TEXT
          : null,
      }));
    }

    // Password protection check
    if (requestRow.access_password_hash) {
      const cookies = parseCookies(req);
      const cookieKey = `${UNLOCK_COOKIE_PREFIX}${requestRow.id}`;
      const expectedCookie = buildUnlockCookieValue(requestRow.id, rawToken);
      if (cookies[cookieKey] !== expectedCookie) {
        return res.status(200).send(renderPasswordUnlockPage({
          requestRow, rental, company, token: rawToken,
        }));
      }
    }

    const forcedDecision = normalizeApprovalDecision(req.query?.decision);
    const forcedDecisionWarning = forcedDecision
      ? 'Pour des raisons de sécurité, veuillez confirmer explicitement votre décision sur ce formulaire.'
      : null;

    return res.status(200).send(renderApprovalDecisionFormPage({
      requestRow,
      rental,
      token: rawToken,
      errorMessage: forcedDecisionWarning,
      company,
    }));
  } catch (err) {
    console.error('[rental-documents/approval] unexpected error', err);
    return res.status(500).send(renderApprovalResponsePage({
      title: 'Erreur',
      message: 'Impossible de charger la validation.',
      tone: 'red',
    }));
  }
});

app.post('/api/rental-documents/approval/:token/unlock', async (req, res) => {
  try {
    if (!supabase) return res.status(503).end();
    const rawToken = typeof req.params.token === 'string' ? req.params.token.trim() : '';
    if (!rawToken) return res.status(400).end();

    const { data: requestRow } = await supabase
      .from('rental_document_requests')
      .select('id, rental_id, status, access_password_hash')
      .eq('token', rawToken)
      .maybeSingle();

    if (!requestRow || !requestRow.access_password_hash) {
      return res.redirect(302, `/api/rental-documents/approval/${encodeURIComponent(rawToken)}`);
    }

    const rawPassword = typeof req.body?.access_password === 'string' ? req.body.access_password : '';
    const submittedHash = hashApprovalPassword(rawToken, rawPassword);

    if (submittedHash !== requestRow.access_password_hash) {
      // Fetch extra data for re-rendering the unlock page
      const { data: rental } = await supabase
        .from('rentals')
        .select('id, reference_code, title, type, color')
        .eq('id', requestRow.rental_id)
        .maybeSingle();
      let company = null;
      try {
        const { data: c } = await supabase.from('company_settings').select('name, logo_url').eq('id', 1).maybeSingle();
        company = c;
      } catch (_) { /* optional */ }
      return res.status(401).send(renderPasswordUnlockPage({
        requestRow, rental, company, token: rawToken,
        errorMessage: 'Mot de passe incorrect.',
      }));
    }

    // Password valid — set unlock cookie and redirect
    const cookieKey = `${UNLOCK_COOKIE_PREFIX}${requestRow.id}`;
    const cookieVal = buildUnlockCookieValue(requestRow.id, rawToken);
    res.setHeader('Set-Cookie', `${cookieKey}=${cookieVal}; HttpOnly; SameSite=Lax; Path=/api/rental-documents/approval; Max-Age=86400`);
    return res.redirect(302, `/api/rental-documents/approval/${encodeURIComponent(rawToken)}`);
  } catch (err) {
    console.error('[rental-documents/approval/unlock] error', err);
    return res.status(500).end();
  }
});

app.get('/api/rental-documents/approval/:token/pdf', async (req, res) => {
  try {
    if (!supabase) return res.status(503).end();
    const rawToken = typeof req.params.token === 'string' ? req.params.token.trim() : '';
    if (!rawToken) return res.status(400).end();

    const { data: requestRow } = await supabase
      .from('rental_document_requests')
      .select('id, status, document_id, rental_id')
      .eq('token', rawToken)
      .maybeSingle();

    if (!requestRow) return res.status(404).end();

    let doc = null;
    if (typeof requestRow.document_id === 'string' && UUID_REGEX.test(requestRow.document_id)) {
      const { data: docRow } = await supabase
        .from('rental_documents')
        .select('id, title, doc_type, file_url')
        .eq('id', requestRow.document_id)
        .maybeSingle();
      doc = docRow;
    } else if (typeof requestRow.rental_id === 'string' && UUID_REGEX.test(requestRow.rental_id)) {
      const { data: docRow } = await supabase
        .from('rental_documents')
        .select('id, title, doc_type, file_url')
        .eq('rental_id', requestRow.rental_id)
        .eq('doc_type', 'devis')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      doc = docRow;
    }

    if (!doc?.file_url) return res.status(404).end();

    const attachment = await buildPdfAttachmentFromStoredValue(doc.file_url, doc.title || 'devis');
    if (!attachment?.content) return res.status(404).end();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="devis.pdf"');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(attachment.content);
  } catch (err) {
    console.error('[rental-documents/approval/pdf] error', err);
    res.status(500).end();
  }
});

app.post('/api/rental-documents/approval/:token/decision', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).send(renderApprovalResponsePage({
        title: 'Service indisponible',
        message: 'Le serveur email est indisponible pour le moment.',
        tone: 'red',
      }));
    }
    const rawToken = typeof req.params.token === 'string' ? req.params.token.trim() : '';
    if (!rawToken) {
      return res.status(400).send(renderApprovalResponsePage({
        title: 'Lien invalide',
        message: 'Ce lien de validation est incomplet.',
        tone: 'red',
      }));
    }

    const { data: requestRow, error: requestErr } = await supabase
      .from('rental_document_requests')
      .select('id, rental_id, document_id, status, expires_at, recipient_email, recipient_name, doc_type, decision_code_hash, decision_attempts')
      .eq('token', rawToken)
      .maybeSingle();
    if (requestErr) {
      console.error('[rental-documents/approval/decision] fetch error', requestErr);
      return res.status(500).send(renderApprovalResponsePage({
        title: 'Erreur',
        message: 'Impossible de charger la demande.',
        tone: 'red',
      }));
    }
    if (!requestRow) {
      return res.status(404).send(renderApprovalResponsePage({
        title: 'Demande introuvable',
        message: 'Ce lien de validation ne correspond à aucune demande active.',
        tone: 'red',
      }));
    }

    const { data: rental, error: rentalErr } = await supabase
      .from('rentals')
      .select('id, status, reference_code, title, type, start_date, end_date, location, clients(name), color, client_id, total_price')
      .eq('id', requestRow.rental_id)
      .maybeSingle();
    if (rentalErr) {
      console.error('[rental-documents/approval/decision] rental error', rentalErr);
    }

    let company = null;
    try {
      const { data: companyRow } = await supabase
        .from('company_settings')
        .select('name, logo_url')
        .eq('id', 1)
        .maybeSingle();
      company = companyRow;
    } catch (_) { /* optional */ }

    const now = new Date();
    if (requestRow.expires_at) {
      const expiresAt = new Date(requestRow.expires_at);
      if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < now.getTime()) {
        if (requestRow.status === 'pending') {
          await supabase.from('rental_document_requests')
            .update({ status: 'expired' })
            .eq('id', requestRow.id);
        }
        return res.status(410).send(renderApprovalResponsePage({
          title: 'Demande expirée',
          message: 'Ce lien de validation est arrivé à expiration.',
          tone: 'red',
        }));
      }
    }

    if (requestRow.status !== 'pending') {
      if (requestRow.status === 'modification_requested') {
        return res.status(200).send(renderApprovalResponsePage({
          title: 'Modifications demandées',
          message: 'Votre demande de modification a bien été transmise. Un nouveau devis vous sera envoyé après correction.',
          tone: 'blue',
        }));
      }
      return res.status(200).send(renderApprovalResponsePage({
        title: requestRow.status === 'accepted' ? 'Devis déjà accepté' : requestRow.status === 'refused' ? 'Devis déjà refusé' : 'Demande déjà traitée',
        message: 'Merci, votre réponse est déjà enregistrée.',
        tone: requestRow.status === 'accepted' ? 'green' : requestRow.status === 'refused' ? 'red' : 'blue',
        legalText: requestRow.status === 'accepted'
          ? APPROVAL_CONSENT_TEXT
          : null,
      }));
    }

    const attempts = Number(requestRow.decision_attempts || 0);
    if (attempts >= APPROVAL_MAX_ATTEMPTS) {
      await supabase
        .from('rental_document_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestRow.id)
        .eq('status', 'pending');
      return res.status(423).send(renderApprovalResponsePage({
        title: 'Validation verrouillée',
        message: 'Le nombre maximal de tentatives est atteint. Merci de demander un nouveau lien.',
        tone: 'red',
      }));
    }

    const decision = normalizeApprovalDecision(req.body?.decision ?? req.query?.decision);
    const signerName = sanitizeNullableString(req.body?.signer_name);
    const consentAckRaw = req.body?.consent_ack;
    const consentAck = ['1', 'true', 'on', 'yes'].includes(String(consentAckRaw || '').toLowerCase());
    const verificationCode = String(req.body?.verification_code || '').replace(/\D/g, '');
    const modificationComment = sanitizeNullableString(req.body?.modification_comment);

    if (!decision) {
      return res.status(400).send(renderApprovalDecisionFormPage({
        requestRow, rental, token: rawToken, company,
        errorMessage: 'Veuillez choisir une décision : accepter, refuser ou demander une modification.',
      }));
    }
    if (!signerName || signerName.length < 2 || signerName.length > 120) {
      return res.status(400).send(renderApprovalDecisionFormPage({
        requestRow, rental, token: rawToken, company,
        errorMessage: 'Le nom du signataire est requis (2 à 120 caractères).',
      }));
    }

    // Modification request — no final signature needed
    if (decision === 'modification') {
      await supabase
        .from('rental_document_requests')
        .update({
          status: 'modification_requested',
          modification_comment: modificationComment || null,
          responded_at: now.toISOString(),
          signer_name: signerName,
        })
        .eq('id', requestRow.id)
        .eq('status', 'pending');

      if (rental) {
        await insertRentalActivityLog({
          rentalId: rental.id,
          actorName: signerName,
          action: 'document_modification_requested',
          details: modificationComment
            ? `Demande de modification : ${modificationComment}`
            : 'Demande de modification de devis (sans commentaire).',
          metadata: { request_id: requestRow.id, via: 'email_secure', signer_name: signerName, comment: modificationComment || null },
        });
        await notifyQuoteDecision({ rental, decision: 'modification', actorName: signerName, requestId: requestRow.id, respondedAt: now.toISOString(), modificationComment });
      }
      return res.status(200).send(renderApprovalResponsePage({
        title: 'Demande transmise',
        message: 'Votre demande de modification a bien été transmise. Un nouveau devis vous sera envoyé après correction.',
        tone: 'blue',
      }));
    }

    if (!consentAck) {
      return res.status(400).send(renderApprovalDecisionFormPage({
        requestRow, rental, token: rawToken, company,
        errorMessage: 'Vous devez accepter la mention de signature électronique pour continuer.',
      }));
    }

    if (requestRow.decision_code_hash) {
      const codeValid = verificationCode.length === APPROVAL_CODE_LENGTH
        && approvalCodeMatches(requestRow.decision_code_hash, rawToken, verificationCode);
      if (!codeValid) {
        const nextAttempts = attempts + 1;
        const tooManyAttempts = nextAttempts >= APPROVAL_MAX_ATTEMPTS;
        await supabase
          .from('rental_document_requests')
          .update({
            decision_attempts: nextAttempts,
            decision_last_attempt_at: now.toISOString(),
            ...(tooManyAttempts ? { status: 'cancelled' } : {}),
          })
          .eq('id', requestRow.id)
          .eq('status', 'pending');

        if (tooManyAttempts) {
          return res.status(423).send(renderApprovalResponsePage({
            title: 'Validation verrouillée',
            message: 'Le nombre maximal de tentatives est atteint. Merci de demander un nouveau lien.',
            tone: 'red',
          }));
        }

        return res.status(400).send(renderApprovalDecisionFormPage({
          requestRow: { ...requestRow, decision_attempts: nextAttempts },
          rental, token: rawToken, company,
          errorMessage: 'Code de vérification invalide.',
        }));
      }
    }

    const forwardedFor = req.headers['x-forwarded-for'];
    const responseIp = Array.isArray(forwardedFor)
      ? (forwardedFor[0] || '').trim()
      : typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0].trim()
        : (req.socket.remoteAddress || null);
    const responseUserAgent = req.headers['user-agent'] || null;

    let actionError = null;
    if (decision === 'accept') {
      if (rental && rental.status === 'pending') {
        try {
          const amount_ttc = roundCurrencyValue(Number(rental.total_price || 0));
          await ensureRentalDraftInvoiceForAcceptance({
            rentalId: rental.id,
            clientId: rental.client_id || null,
            referenceCode: rental.reference_code || null,
            amountTTC: amount_ttc,
            note: `Générée après acceptation de la ${rental.type === 'service' ? 'prestation' : 'location'}.`,
          });
          const { error: updErr } = await supabase
            .from('rentals')
            .update({ status: 'confirmed', generate_invoice: true })
            .eq('id', rental.id);
          if (updErr) throw updErr;
        } catch (err) {
          actionError = err;
        }
      }
    } else if (rental && rental.status === 'pending') {
      try {
        await supabase.from('calendar_events').delete().or(`rental_id.eq.${rental.id},service_id.eq.${rental.id}`);
        const { error: updErr } = await supabase.from('rentals').update({
          status: 'cancelled',
          status_before_cancellation: rental.status,
          cancelled_at: null,
          cancellation_reason: 'Rejetée',
          cancellation_payment_policy: null,
          cancellation_refund_amount: null,
        }).eq('id', rental.id);
        if (updErr) throw updErr;
      } catch (err) {
        actionError = err;
      }
    }

    const respondedAtIso = now.toISOString();
    const { error: saveRequestErr } = await supabase
      .from('rental_document_requests')
      .update({
        status: decision === 'accept' ? 'accepted' : 'refused',
        responded_at: respondedAtIso,
        response_ip: typeof responseIp === 'string' ? responseIp : null,
        response_user_agent: typeof responseUserAgent === 'string' ? responseUserAgent : null,
        signer_name: signerName,
        consent_text: APPROVAL_CONSENT_TEXT,
        consented_at: respondedAtIso,
      })
      .eq('id', requestRow.id)
      .eq('status', 'pending');

    if (saveRequestErr) {
      console.error('[rental-documents/approval/decision] request update error', saveRequestErr);
      return res.status(500).send(renderApprovalResponsePage({
        title: 'Erreur',
        message: 'Votre réponse a été reçue, mais son enregistrement a échoué.',
        tone: 'red',
      }));
    }

    if (rental) {
      await insertRentalActivityLog({
        rentalId: rental.id,
        actorName: signerName,
        action: decision === 'accept' ? 'status_confirmed' : 'status_rejected',
        details: decision === 'accept' ? 'Devis accepté par email (validation sécurisée).' : 'Devis refusé par email (validation sécurisée).',
        metadata: { request_id: requestRow.id, via: 'email_secure', signer_name: signerName },
      });
    }

    if (actionError) {
      console.error('[rental-documents/approval/decision] action error', actionError);
      return res.status(500).send(renderApprovalResponsePage({
        title: 'Erreur',
        message: 'Votre réponse a été reçue, mais une erreur est survenue.',
        tone: 'red',
      }));
    }

    if (rental) {
      await notifyQuoteDecision({
        rental,
        decision,
        actorName: signerName,
        requestId: requestRow.id,
        respondedAt: respondedAtIso,
      });
    }

    return res.status(200).send(renderApprovalResponsePage({
      title: decision === 'accept' ? 'Devis accepté' : 'Devis refusé',
      message: decision === 'accept'
        ? 'Merci, votre devis est confirmé.'
        : 'Merci, votre refus a bien été enregistré.',
      tone: decision === 'accept' ? 'green' : 'red',
      legalText: decision === 'accept'
        ? APPROVAL_CONSENT_TEXT
        : null,
    }));
  } catch (err) {
    console.error('[rental-documents/approval/decision] unexpected error', err);
    return res.status(500).send(renderApprovalResponsePage({
      title: 'Erreur',
      message: 'Impossible de traiter votre réponse.',
      tone: 'red',
    }));
  }
});

const collectDossierShareEntries = (entries = [], rootEntryId) => {
  if (!rootEntryId) return entries;
  const childrenMap = new Map();
  entries.forEach((entry) => {
    const parentKey = entry.parent_id || null;
    if (!childrenMap.has(parentKey)) {
      childrenMap.set(parentKey, []);
    }
    childrenMap.get(parentKey).push(entry);
  });

  const allowedIds = new Set();
  const stack = [rootEntryId];
  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || allowedIds.has(currentId)) continue;
    allowedIds.add(currentId);
    const children = childrenMap.get(currentId) || [];
    children.forEach((child) => {
      stack.push(child.id);
    });
  }
  return entries.filter((entry) => allowedIds.has(entry.id));
};

const buildDossierCopyName = (entries = [], name, parentId) => {
  const lastDot = name.lastIndexOf('.');
  const base = lastDot > 0 ? name.slice(0, lastDot) : name;
  const ext = lastDot > 0 ? name.slice(lastDot) : '';
  const existing = new Set(
    entries
      .filter((entry) => (entry.parent_id || null) === parentId)
      .map((entry) => entry.name),
  );
  const baseName = `${base} - Copie`;
  let candidate = `${baseName}${ext}`;
  let index = 2;
  while (existing.has(candidate)) {
    candidate = `${baseName} ${index}${ext}`;
    index += 1;
  }
  return candidate;
};

const isDescendantEntry = (entries = [], targetParentId, entryId) => {
  let current = targetParentId;
  const guard = new Set();
  while (current) {
    if (current === entryId) return true;
    if (guard.has(current)) return false;
    guard.add(current);
    const next = entries.find((entry) => entry.id === current);
    current = next?.parent_id || null;
  }
  return false;
};

const normalizeShareAccessMode = (value) => {
  if (typeof value !== 'string') return 'viewer';
  const trimmed = value.trim().toLowerCase();
  return SHARE_ACCESS_MODES.has(trimmed) ? trimmed : 'viewer';
};

const generateVerificationCode = (digits = 6) => {
  const max = 10 ** digits;
  const value = Math.floor(Math.random() * max);
  return String(value).padStart(digits, '0');
};

const normalizeShareExpiryDays = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const respondSharePasswordError = (res, status, message) => {
  return res.status(status).json({ error: message, requiresPassword: true });
};

const sendVerificationCodeEmail = async ({ to, code, expiresAt, headline, subtitle, note }) => {
  const mailConfig = readMailConfig({ includeSecrets: true });
  const transporter = buildTransporter(mailConfig);
  const fromAddress = mailConfig.user || RESET_MAIL_SENDER;
  const expiresDate = expiresAt ? new Date(expiresAt) : null;
  const expiryText = expiresDate
    ? expiresDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : '10 minutes';
  const textBody = [
    'Bonjour,',
    '',
    subtitle,
    '',
    `Code de vérification : ${code}`,
    `Ce code expirera à ${expiryText}.`,
    '',
    "Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message.",
    '',
    '--',
    'Open RIG',
  ].join('\n');
  const codeDigits = (`${code || ''}`.padEnd(6, '•')).slice(0, 6).split('');
  const htmlBody = renderBrandEmail({
    headline,
    subtitle,
    boxesHtml: buildBoxesHtml(codeDigits),
    footerLine: `Code valable jusqu'à ${expiryText}`,
    note,
  });
  await transporter.sendMail({
    from: `"Open RIG" <${fromAddress}>`,
    to,
    subject: 'Code de vérification Open RIG',
    text: textBody,
    html: htmlBody,
  });
};

const loadDossierShare = async (req, res, { requireEditor = false, skipWhitelist = false, skipPassword = false } = {}) => {
  if (!supabase) {
    res.status(500).json({ error: 'Supabase client not configured' });
    return null;
  }
  const rawToken = typeof req.params.token === 'string' ? req.params.token.trim() : '';
  if (!rawToken) {
    res.status(400).json({ error: 'Lien invalide.' });
    return null;
  }
  const { data: shareRow, error: shareErr } = await supabase
    .from('rental_dossier_shares')
    .select('id, rental_id, root_entry_id, status, expires_at, created_at, password_hash, password_salt, access_mode, whitelist_enabled')
    .eq('token', rawToken)
    .maybeSingle();
  if (shareErr) {
    console.error('[dossier-shares] fetch error', shareErr);
    res.status(500).json({ error: 'Impossible de charger le lien.' });
    return null;
  }
  if (!shareRow) {
    res.status(404).json({ error: 'Lien introuvable.' });
    return null;
  }
  if (shareRow.expires_at) {
    const expiresAt = new Date(shareRow.expires_at);
    if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      if (shareRow.status === 'active') {
        await supabase.from('rental_dossier_shares')
          .update({ status: 'expired' })
          .eq('id', shareRow.id);
      }
      res.status(410).json({ error: 'Lien expiré.' });
      return null;
    }
  }
  if (shareRow.status !== 'active') {
    res.status(410).json({ error: 'Lien inactif.' });
    return null;
  }
  const passwordHash = shareRow.password_hash || null;
  const passwordSalt = shareRow.password_salt || null;
  const requiresPassword = Boolean(passwordHash && passwordSalt);
  const whitelistEnabled = Boolean(shareRow.whitelist_enabled);
  const accessToken = (req.get('x-share-access') || '').trim();
  let accessSession = null;
  let accessTokenExpired = false;
  if (accessToken && (requiresPassword || (whitelistEnabled && !skipWhitelist))) {
    const { data: sessionRow, error: sessionErr } = await supabase
      .from('rental_dossier_share_access_sessions')
      .select('id, expires_at, method')
      .eq('share_id', shareRow.id)
      .eq('token', accessToken)
      .maybeSingle();
    if (sessionErr) {
      console.error('[dossier-shares] access session error', sessionErr);
      res.status(500).json({ error: "Impossible de valider l'accès." });
      return null;
    }
    if (sessionRow?.expires_at) {
      const expiresAt = new Date(sessionRow.expires_at);
      if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
        await supabase.from('rental_dossier_share_access_sessions')
          .delete()
          .eq('id', sessionRow.id);
        accessTokenExpired = true;
      } else {
        accessSession = sessionRow;
      }
    } else if (sessionRow) {
      accessSession = sessionRow;
    }
  }
  if (requiresPassword && !skipPassword) {
    const hasPasswordSession = accessSession?.method === 'password';
    if (!hasPasswordSession) {
      const providedPassword = (req.get('x-share-password') || '').trim();
      if (!providedPassword) {
        respondSharePasswordError(res, 401, 'Mot de passe requis.');
        return null;
      }
      const isValid = verifySharePassword(providedPassword, passwordSalt, passwordHash);
      if (!isValid) {
        respondSharePasswordError(res, 403, 'Mot de passe incorrect.');
        return null;
      }
    }
  }
  if (whitelistEnabled && !skipWhitelist) {
    if (!accessToken) {
      res.status(401).json({ error: 'Accès réservé à la whitelist.', requiresWhitelist: true });
      return null;
    }
    const hasWhitelistSession = accessSession?.method === 'whitelist';
    if (!hasWhitelistSession) {
      res.status(403).json({
        error: accessTokenExpired ? 'Accès expiré.' : 'Accès non autorisé.',
        requiresWhitelist: true,
      });
      return null;
    }
  }
  if (requireEditor && shareRow.access_mode !== 'editor') {
    res.status(403).json({ error: 'Lien en lecture seule.' });
    return null;
  }
  return { shareRow, requiresPassword };
};

const loadShareEntriesForShare = async (shareRow) => {
  const { data: entries, error } = await supabase
    .from('rental_dossier_entries')
    .select('id, rental_id, parent_id, entry_type, name, file_url, file_name, file_type, file_size, color, icon, created_at')
    .eq('rental_id', shareRow.rental_id)
    .order('created_at', { ascending: true });
  if (error) {
    throw error;
  }
  const entriesList = entries || [];
  const allowedEntries = shareRow.root_entry_id
    ? collectDossierShareEntries(entriesList, shareRow.root_entry_id)
    : entriesList;
  const allowedIds = new Set(allowedEntries.map((entry) => entry.id));
  return { entriesList, allowedEntries, allowedIds };
};

const isShareParentAllowed = (shareRow, allowedIds, parentId) => {
  if (shareRow.root_entry_id) {
    return Boolean(parentId && allowedIds.has(parentId));
  }
  if (!parentId) return true;
  return allowedIds.has(parentId);
};

app.post('/api/dossier-shares', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    const rentalId = typeof req.body?.rentalId === 'string' ? req.body.rentalId.trim() : '';
    const rootEntryId = typeof req.body?.rootEntryId === 'string' ? req.body.rootEntryId.trim() : '';
    const rawPassword = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
    const accessMode = normalizeShareAccessMode(req.body?.accessMode);
    const whitelistEnabled = Boolean(req.body?.whitelistEnabled);
    const expiresInDays = normalizeShareExpiryDays(req.body?.expiresInDays);
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
    if (!rentalId || !UUID_REGEX.test(rentalId)) {
      return res.status(400).json({ error: 'Identifiant prestation invalide.' });
    }

    let rootEntry = null;
    if (rootEntryId) {
      if (!UUID_REGEX.test(rootEntryId)) {
        return res.status(400).json({ error: 'Identifiant dossier invalide.' });
      }
      const { data: entryRow, error: entryErr } = await supabase
        .from('rental_dossier_entries')
        .select('id, rental_id, entry_type, name')
        .eq('id', rootEntryId)
        .maybeSingle();
      if (entryErr) {
        console.error('[dossier-shares] root entry error', entryErr);
        return res.status(500).json({ error: 'Impossible de charger le dossier.' });
      }
      if (!entryRow) {
        return res.status(404).json({ error: 'Dossier introuvable.' });
      }
      if (entryRow.rental_id !== rentalId) {
        return res.status(400).json({ error: 'Dossier hors prestation.' });
      }
      if (entryRow.entry_type !== 'folder') {
        return res.status(400).json({ error: 'Seuls les dossiers peuvent être partagés.' });
      }
      rootEntry = entryRow;
    }
    if (whitelistEnabled && rawPassword) {
      return res.status(400).json({ error: 'La whitelist ne peut pas être combinée avec un mot de passe.' });
    }
    if (whitelistEnabled) {
      const { data: whitelistRows, error: whitelistErr } = await supabase
        .from('rental_dossier_whitelist_emails')
        .select('id')
        .eq('rental_id', rentalId)
        .limit(1);
      if (whitelistErr) {
        console.error('[dossier-shares] whitelist check error', whitelistErr);
        return res.status(500).json({ error: 'Impossible de vérifier la whitelist.' });
      }
      if (!whitelistRows || whitelistRows.length === 0) {
        return res.status(400).json({ error: 'Ajoutez au moins une adresse en whitelist.' });
      }
    }

    const token = crypto.randomBytes(24).toString('hex');
    const passwordPayload = rawPassword && !whitelistEnabled ? hashSharePassword(rawPassword) : null;
    const { data: shareRow, error: shareErr } = await supabase
      .from('rental_dossier_shares')
      .insert([{
        rental_id: rentalId,
        root_entry_id: rootEntryId || null,
        token,
        status: 'active',
        expires_at: expiresAt,
        password_hash: passwordPayload?.hash ?? null,
        password_salt: passwordPayload?.salt ?? null,
        access_mode: accessMode,
        whitelist_enabled: whitelistEnabled,
      }])
      .select('id')
      .maybeSingle();
    if (shareErr) {
      console.error('[dossier-shares] insert error', shareErr);
      return res.status(500).json({ error: 'Impossible de créer le lien.' });
    }

    const baseUrl = (APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const shareUrl = `${baseUrl}/share/dossier/${token}`;
    return res.json({
      ok: true,
      shareId: shareRow?.id || null,
      shareUrl,
      token,
      rootEntryId: rootEntryId || null,
      rootEntryName: rootEntry?.name || null,
      accessMode,
      whitelistEnabled,
      expiresAt,
    });
  } catch (err) {
    console.error('[dossier-shares] unexpected error', err);
    return res.status(500).json({ error: 'Impossible de créer le lien.' });
  }
});

app.get('/api/dossier-shares', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    const rentalId = typeof req.query?.rentalId === 'string' ? req.query.rentalId.trim() : '';
    const rootEntryId = typeof req.query?.rootEntryId === 'string' ? req.query.rootEntryId.trim() : '';
    if (!rentalId || !UUID_REGEX.test(rentalId)) {
      return res.status(400).json({ error: 'Identifiant prestation invalide.' });
    }
    if (rootEntryId && !UUID_REGEX.test(rootEntryId)) {
      return res.status(400).json({ error: 'Identifiant dossier invalide.' });
    }

    let query = supabase
      .from('rental_dossier_shares')
      .select('id, rental_id, root_entry_id, token, status, expires_at, created_at, access_mode, password_hash, password_salt, whitelist_enabled')
      .eq('rental_id', rentalId);
    if (rootEntryId) {
      query = query.eq('root_entry_id', rootEntryId);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      console.error('[dossier-shares] list error', error);
      return res.status(500).json({ error: 'Impossible de charger les liens.' });
    }

    const baseUrl = (APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const now = Date.now();
    const expiredIds = [];
    const revokedIds = [];
    const shares = (data || []).flatMap((row) => {
      if (row.status === 'revoked') {
        revokedIds.push(row.id);
        return [];
      }
      let status = row.status;
      if (status === 'active' && row.expires_at) {
        const expiresAt = new Date(row.expires_at);
        if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < now) {
          status = 'expired';
          expiredIds.push(row.id);
        }
      }
      return [{
        id: row.id,
        rentalId: row.rental_id,
        rootEntryId: row.root_entry_id,
        shareUrl: `${baseUrl}/share/dossier/${row.token}`,
        status,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        accessMode: row.access_mode || 'viewer',
        hasPassword: Boolean(row.password_hash && row.password_salt),
        whitelistEnabled: Boolean(row.whitelist_enabled),
      }];
    });

    if (expiredIds.length > 0) {
      const { error: expireErr } = await supabase
        .from('rental_dossier_shares')
        .update({ status: 'expired' })
        .in('id', expiredIds);
      if (expireErr) {
        console.error('[dossier-shares] expire update error', expireErr);
      }
    }
    if (revokedIds.length > 0) {
      const { error: revokeErr } = await supabase
        .from('rental_dossier_shares')
        .delete()
        .in('id', revokedIds);
      if (revokeErr) {
        console.error('[dossier-shares] revoke cleanup error', revokeErr);
      }
    }

    return res.json({ shares });
  } catch (err) {
    console.error('[dossier-shares] list error', err);
    return res.status(500).json({ error: 'Impossible de charger les liens.' });
  }
});

app.get('/api/dossier-whitelist', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    const rentalId = typeof req.query?.rentalId === 'string' ? req.query.rentalId.trim() : '';
    if (!rentalId || !UUID_REGEX.test(rentalId)) {
      return res.status(400).json({ error: 'Identifiant prestation invalide.' });
    }
    const { data, error } = await supabase
      .from('rental_dossier_whitelist_emails')
      .select('id, email, created_at')
      .eq('rental_id', rentalId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[dossier-whitelist] list error', error);
      return res.status(500).json({ error: 'Impossible de charger la whitelist.' });
    }
    return res.json({ entries: data || [] });
  } catch (err) {
    console.error('[dossier-whitelist] list error', err);
    return res.status(500).json({ error: 'Impossible de charger la whitelist.' });
  }
});

const handleWhitelistAdd = async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    const rentalId = typeof req.body?.rentalId === 'string' ? req.body.rentalId.trim() : '';
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!rentalId || !UUID_REGEX.test(rentalId)) {
      return res.status(400).json({ error: 'Identifiant prestation invalide.' });
    }
    if (!rawEmail || !EMAIL_REGEX.test(rawEmail)) {
      return res.status(400).json({ error: 'Adresse e-mail invalide.' });
    }
    const { data, error } = await supabase
      .from('rental_dossier_whitelist_emails')
      .upsert({
        rental_id: rentalId,
        email: rawEmail,
      }, { onConflict: 'rental_id,email' })
      .select('id, email, created_at')
      .maybeSingle();
    if (error) {
      console.error('[dossier-whitelist] add error', error);
      return res.status(500).json({ error: "Impossible d'ajouter la whitelist." });
    }
    return res.json({ ok: true, entry: data });
  } catch (err) {
    console.error('[dossier-whitelist] add error', err);
    const message = err instanceof Error ? err.message : "Impossible d'ajouter la whitelist";
    return res.status(500).json({ error: message });
  }
};

app.post('/api/dossier-whitelist', handleWhitelistAdd);
app.post('/api/dossier-whitelist/request', handleWhitelistAdd);

app.delete('/api/dossier-whitelist/:id', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    const entryId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!entryId || !UUID_REGEX.test(entryId)) {
      return res.status(400).json({ error: 'Identifiant invalide.' });
    }
    const { error } = await supabase
      .from('rental_dossier_whitelist_emails')
      .delete()
      .eq('id', entryId);
    if (error) {
      console.error('[dossier-whitelist] delete error', error);
      return res.status(500).json({ error: 'Impossible de supprimer.' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[dossier-whitelist] delete error', err);
    return res.status(500).json({ error: 'Impossible de supprimer.' });
  }
});

app.post('/api/dossier-shares/:shareId/revoke', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not configured' });
    }
    const shareId = typeof req.params.shareId === 'string' ? req.params.shareId.trim() : '';
    if (!shareId || !UUID_REGEX.test(shareId)) {
      return res.status(400).json({ error: 'Identifiant de lien invalide.' });
    }
    const { error } = await supabase
      .from('rental_dossier_shares')
      .delete()
      .eq('id', shareId);
    if (error) {
      console.error('[dossier-shares] revoke error', error);
      return res.status(500).json({ error: 'Impossible de supprimer le lien.' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[dossier-shares] revoke error', err);
    return res.status(500).json({ error: 'Impossible de supprimer le lien.' });
  }
});

app.post('/api/dossier-shares/:token/whitelist/access/request', async (req, res) => {
  try {
    const shareContext = await loadDossierShare(req, res, { skipWhitelist: true });
    if (!shareContext) return;
    const { shareRow } = shareContext;
    if (!shareRow.whitelist_enabled) {
      return res.status(400).json({ error: 'Whitelist inactive.' });
    }
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!rawEmail || !EMAIL_REGEX.test(rawEmail)) {
      return res.status(400).json({ error: 'Adresse e-mail invalide.' });
    }
    const { data: whitelistRow, error: whitelistErr } = await supabase
      .from('rental_dossier_whitelist_emails')
      .select('id')
      .eq('rental_id', shareRow.rental_id)
      .eq('email', rawEmail)
      .maybeSingle();
    if (whitelistErr) {
      console.error('[dossier-shares] whitelist access error', whitelistErr);
      return res.status(500).json({ error: 'Impossible de vérifier la whitelist.' });
    }
    if (!whitelistRow) {
      return res.status(403).json({ error: 'Adresse non autorisée.' });
    }

    const code = generateVerificationCode(6);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error: upsertErr } = await supabase
      .from('rental_dossier_share_access_codes')
      .upsert({
        share_id: shareRow.id,
        email: rawEmail,
        code,
        expires_at: expiresAt,
      }, { onConflict: 'share_id,email' });
    if (upsertErr) {
      console.error('[dossier-shares] whitelist access code error', upsertErr);
      return res.status(500).json({ error: 'Impossible de générer le code.' });
    }

    await sendVerificationCodeEmail({
      to: rawEmail,
      code,
      expiresAt,
      headline: "Code d'accès",
      subtitle: 'Entrez ce code temporaire pour accéder au dossier partagé.',
      note: "Ne partagez jamais ce code. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
    });

    return res.json({ ok: true, expires_at: expiresAt });
  } catch (err) {
    console.error('[dossier-shares] whitelist access request error', err);
    const message = err instanceof Error ? err.message : "Impossible d'envoyer le code";
    return res.status(500).json({ error: message });
  }
});

app.post('/api/dossier-shares/:token/whitelist/access/verify', async (req, res) => {
  try {
    const shareContext = await loadDossierShare(req, res, { skipWhitelist: true });
    if (!shareContext) return;
    const { shareRow } = shareContext;
    if (!shareRow.whitelist_enabled) {
      return res.status(400).json({ error: 'Whitelist inactive.' });
    }
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!rawEmail || !EMAIL_REGEX.test(rawEmail)) {
      return res.status(400).json({ error: 'Adresse e-mail invalide.' });
    }
    if (!code) {
      return res.status(400).json({ error: 'Code requis.' });
    }
    const { data: accessRow, error: accessErr } = await supabase
      .from('rental_dossier_share_access_codes')
      .select('id, code, expires_at')
      .eq('share_id', shareRow.id)
      .eq('email', rawEmail)
      .maybeSingle();
    if (accessErr) {
      console.error('[dossier-shares] whitelist access verify error', accessErr);
      return res.status(500).json({ error: 'Impossible de vérifier le code.' });
    }
    if (!accessRow) {
      return res.status(404).json({ error: 'Code introuvable.' });
    }
    if (accessRow.code !== code) {
      return res.status(400).json({ error: 'Code incorrect.' });
    }
    const expiresAt = new Date(accessRow.expires_at);
    if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Code expiré.' });
    }

    const sessionToken = crypto.randomBytes(24).toString('hex');
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: sessionErr } = await supabase
      .from('rental_dossier_share_access_sessions')
      .insert({
        share_id: shareRow.id,
        email: rawEmail,
        token: sessionToken,
        expires_at: sessionExpiresAt,
        method: 'whitelist',
      });
    if (sessionErr) {
      console.error('[dossier-shares] whitelist session error', sessionErr);
      return res.status(500).json({ error: "Impossible de valider l'accès." });
    }
    await supabase
      .from('rental_dossier_share_access_codes')
      .delete()
      .eq('id', accessRow.id);

    return res.json({ ok: true, access_token: sessionToken, expires_at: sessionExpiresAt });
  } catch (err) {
    console.error('[dossier-shares] whitelist access verify error', err);
    return res.status(500).json({ error: 'Impossible de vérifier le code.' });
  }
});

app.post('/api/dossier-shares/:token/password/access', async (req, res) => {
  try {
    const shareContext = await loadDossierShare(req, res, { skipWhitelist: true, skipPassword: true });
    if (!shareContext) return;
    const { shareRow, requiresPassword } = shareContext;
    if (shareRow.whitelist_enabled) {
      return res.status(400).json({ error: 'Lien protégé par whitelist.' });
    }
    if (!requiresPassword) {
      return res.status(400).json({ error: 'Ce lien ne nécessite pas de mot de passe.' });
    }
    const rawPassword = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
    if (!rawPassword) {
      return res.status(400).json({ error: 'Mot de passe requis.' });
    }
    const isValid = verifySharePassword(rawPassword, shareRow.password_salt, shareRow.password_hash);
    if (!isValid) {
      return res.status(403).json({ error: 'Mot de passe incorrect.' });
    }
    const sessionToken = crypto.randomBytes(24).toString('hex');
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: sessionErr } = await supabase
      .from('rental_dossier_share_access_sessions')
      .insert({
        share_id: shareRow.id,
        email: 'password',
        token: sessionToken,
        expires_at: sessionExpiresAt,
        method: 'password',
      });
    if (sessionErr) {
      console.error('[dossier-shares] password session error', sessionErr);
      return res.status(500).json({ error: 'Impossible de valider le mot de passe.' });
    }
    return res.json({ ok: true, access_token: sessionToken, expires_at: sessionExpiresAt });
  } catch (err) {
    console.error('[dossier-shares] password access error', err);
    return res.status(500).json({ error: 'Impossible de valider le mot de passe.' });
  }
});

app.get('/api/dossier-shares/:token', async (req, res) => {
  try {
    const shareContext = await loadDossierShare(req, res);
    if (!shareContext) return;
    const { shareRow, requiresPassword } = shareContext;

    const { data: entries, error: entriesErr } = await supabase
      .from('rental_dossier_entries')
      .select('id, parent_id, entry_type, name, file_url, file_name, file_type, file_size, color, icon, created_at')
      .eq('rental_id', shareRow.rental_id)
      .order('created_at', { ascending: true });
    if (entriesErr) {
      console.error('[dossier-shares] entries error', entriesErr);
      return res.status(500).json({ error: 'Impossible de charger les fichiers.' });
    }

    const entriesList = entries || [];
    const rootEntryId = shareRow.root_entry_id || null;
    const rootEntry = rootEntryId ? entriesList.find((entry) => entry.id === rootEntryId) : null;
    if (rootEntryId && !rootEntry) {
      return res.status(404).json({ error: 'Dossier partagé introuvable.' });
    }

    const allowedEntries = collectDossierShareEntries(entriesList, rootEntryId);
    const { data: rentalRow, error: rentalErr } = await supabase
      .from('rentals')
      .select('id, title, reference_code, type')
      .eq('id', shareRow.rental_id)
      .maybeSingle();
    if (rentalErr) {
      console.error('[dossier-shares] rental error', rentalErr);
    }

    return res.json({
      share: {
        id: shareRow.id,
        rentalId: shareRow.rental_id,
        rootEntryId,
        created_at: shareRow.created_at,
        expires_at: shareRow.expires_at,
        requiresPassword,
        accessMode: shareRow.access_mode || 'viewer',
        whitelistEnabled: Boolean(shareRow.whitelist_enabled),
      },
      rental: rentalRow || null,
      rootEntry: rootEntry || null,
      entries: allowedEntries,
    });
  } catch (err) {
    console.error('[dossier-shares] unexpected error', err);
    return res.status(500).json({ error: 'Impossible de charger le lien.' });
  }
});

app.post('/api/dossier-shares/:token/folders', async (req, res) => {
  try {
    const shareContext = await loadDossierShare(req, res, { requireEditor: true });
    if (!shareContext) return;
    const { shareRow } = shareContext;
    const name = sanitizeNullableString(req.body?.name);
    const parentId = typeof req.body?.parentId === 'string' ? req.body.parentId.trim() : null;
    if (!name) {
      return res.status(400).json({ error: 'Nom requis.' });
    }
    if (parentId && !UUID_REGEX.test(parentId)) {
      return res.status(400).json({ error: 'Parent invalide.' });
    }
    const { allowedIds } = await loadShareEntriesForShare(shareRow);
    if (!isShareParentAllowed(shareRow, allowedIds, parentId)) {
      return res.status(403).json({ error: 'Parent hors dossier partagé.' });
    }
    const { data: entryRow, error: entryErr } = await supabase
      .from('rental_dossier_entries')
      .insert([{
        rental_id: shareRow.rental_id,
        parent_id: parentId,
        entry_type: 'folder',
        name,
        color: sanitizeNullableString(req.body?.color),
        icon: sanitizeNullableString(req.body?.icon),
      }])
      .select('id, parent_id, entry_type, name, file_url, file_name, file_type, file_size, color, icon, created_at')
      .maybeSingle();
    if (entryErr) {
      console.error('[dossier-shares] create folder error', entryErr);
      return res.status(500).json({ error: 'Impossible de créer le dossier.' });
    }
    return res.json({ entry: entryRow });
  } catch (err) {
    console.error('[dossier-shares] create folder error', err);
    return res.status(500).json({ error: 'Impossible de créer le dossier.' });
  }
});

app.post('/api/dossier-shares/:token/files', async (req, res) => {
  try {
    const shareContext = await loadDossierShare(req, res, { requireEditor: true });
    if (!shareContext) return;
    const { shareRow } = shareContext;
    const parentId = typeof req.body?.parentId === 'string' ? req.body.parentId.trim() : null;
    if (parentId && !UUID_REGEX.test(parentId)) {
      return res.status(400).json({ error: 'Parent invalide.' });
    }
    const filesInput = Array.isArray(req.body?.files)
      ? req.body.files
      : (req.body?.file ? [req.body.file] : []);
    if (!filesInput.length) {
      return res.status(400).json({ error: 'Aucun fichier.' });
    }
    const { allowedIds } = await loadShareEntriesForShare(shareRow);
    if (!isShareParentAllowed(shareRow, allowedIds, parentId)) {
      return res.status(403).json({ error: 'Parent hors dossier partagé.' });
    }
    const payloads = filesInput.map((file) => {
      const name = sanitizeNullableString(file?.name) || 'Fichier';
      const fileUrl = sanitizeNullableString(file?.file_url);
      if (!fileUrl) return null;
      return {
        rental_id: shareRow.rental_id,
        parent_id: parentId,
        entry_type: 'file',
        name,
        file_url: fileUrl,
        file_name: name,
        file_type: sanitizeNullableString(file?.file_type),
        file_size: typeof file?.file_size === 'number' ? file.file_size : null,
        color: sanitizeNullableString(file?.color),
        icon: null,
      };
    }).filter(Boolean);
    if (!payloads.length) {
      return res.status(400).json({ error: 'Fichiers invalides.' });
    }
    const { error: insertErr } = await supabase
      .from('rental_dossier_entries')
      .insert(payloads);
    if (insertErr) {
      console.error('[dossier-shares] upload error', insertErr);
      return res.status(500).json({ error: "Impossible d'importer les fichiers." });
    }
    return res.json({ ok: true, count: payloads.length });
  } catch (err) {
    console.error('[dossier-shares] upload error', err);
    return res.status(500).json({ error: "Impossible d'importer les fichiers." });
  }
});

app.patch('/api/dossier-shares/:token/entries/:entryId', async (req, res) => {
  try {
    const shareContext = await loadDossierShare(req, res, { requireEditor: true });
    if (!shareContext) return;
    const { shareRow } = shareContext;
    const entryId = typeof req.params.entryId === 'string' ? req.params.entryId.trim() : '';
    if (!entryId || !UUID_REGEX.test(entryId)) {
      return res.status(400).json({ error: 'Entrée invalide.' });
    }
    const { entriesList, allowedIds } = await loadShareEntriesForShare(shareRow);
    if (!allowedIds.has(entryId)) {
      return res.status(404).json({ error: 'Entrée introuvable.' });
    }
    const entry = entriesList.find((item) => item.id === entryId);
    if (!entry) {
      return res.status(404).json({ error: 'Entrée introuvable.' });
    }
    if (shareRow.root_entry_id && entryId === shareRow.root_entry_id && req.body?.parentId) {
      return res.status(400).json({ error: 'Impossible de déplacer la racine partagée.' });
    }
    const updates = {};
    const nameInput = typeof req.body?.name === 'string' ? req.body.name.trim() : null;
    if (nameInput) {
      updates.name = nameInput;
      if (entry.entry_type === 'file') {
        updates.file_name = nameInput;
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'color')) {
      updates.color = sanitizeNullableString(req.body?.color);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'icon')) {
      updates.icon = entry.entry_type === 'folder' ? sanitizeNullableString(req.body?.icon) : null;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'parentId')) {
      const parentId = typeof req.body.parentId === 'string' ? req.body.parentId.trim() : null;
      if (parentId && !UUID_REGEX.test(parentId)) {
        return res.status(400).json({ error: 'Parent invalide.' });
      }
      if (!isShareParentAllowed(shareRow, allowedIds, parentId)) {
        return res.status(403).json({ error: 'Parent hors dossier partagé.' });
      }
      if (parentId && isDescendantEntry(entriesList, parentId, entryId)) {
        return res.status(400).json({ error: 'Déplacement impossible.' });
      }
      updates.parent_id = parentId;
    }
    if (Object.keys(updates).length === 0) {
      return res.json({ ok: true });
    }
    const { error: updateErr } = await supabase
      .from('rental_dossier_entries')
      .update(updates)
      .eq('id', entryId);
    if (updateErr) {
      console.error('[dossier-shares] update error', updateErr);
      return res.status(500).json({ error: 'Impossible de mettre à jour.' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[dossier-shares] update error', err);
    return res.status(500).json({ error: 'Impossible de mettre à jour.' });
  }
});

app.delete('/api/dossier-shares/:token/entries/:entryId', async (req, res) => {
  try {
    const shareContext = await loadDossierShare(req, res, { requireEditor: true });
    if (!shareContext) return;
    const { shareRow } = shareContext;
    const entryId = typeof req.params.entryId === 'string' ? req.params.entryId.trim() : '';
    if (!entryId || !UUID_REGEX.test(entryId)) {
      return res.status(400).json({ error: 'Entrée invalide.' });
    }
    if (shareRow.root_entry_id && entryId === shareRow.root_entry_id) {
      return res.status(400).json({ error: 'Impossible de supprimer la racine partagée.' });
    }
    const { allowedIds } = await loadShareEntriesForShare(shareRow);
    if (!allowedIds.has(entryId)) {
      return res.status(404).json({ error: 'Entrée introuvable.' });
    }
    const { error: deleteErr } = await supabase
      .from('rental_dossier_entries')
      .delete()
      .eq('id', entryId);
    if (deleteErr) {
      console.error('[dossier-shares] delete error', deleteErr);
      return res.status(500).json({ error: 'Impossible de supprimer.' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[dossier-shares] delete error', err);
    return res.status(500).json({ error: 'Impossible de supprimer.' });
  }
});

app.post('/api/dossier-shares/:token/entries/:entryId/duplicate', async (req, res) => {
  try {
    const shareContext = await loadDossierShare(req, res, { requireEditor: true });
    if (!shareContext) return;
    const { shareRow } = shareContext;
    const entryId = typeof req.params.entryId === 'string' ? req.params.entryId.trim() : '';
    if (!entryId || !UUID_REGEX.test(entryId)) {
      return res.status(400).json({ error: 'Entrée invalide.' });
    }
    const destinationParentId = typeof req.body?.destinationParentId === 'string' ? req.body.destinationParentId.trim() : null;
    if (destinationParentId && !UUID_REGEX.test(destinationParentId)) {
      return res.status(400).json({ error: 'Parent invalide.' });
    }
    const { entriesList, allowedIds } = await loadShareEntriesForShare(shareRow);
    if (!allowedIds.has(entryId)) {
      return res.status(404).json({ error: 'Entrée introuvable.' });
    }
    const entry = entriesList.find((item) => item.id === entryId);
    if (!entry) {
      return res.status(404).json({ error: 'Entrée introuvable.' });
    }
    const targetParentId = destinationParentId ?? entry.parent_id ?? null;
    if (!isShareParentAllowed(shareRow, allowedIds, targetParentId)) {
      return res.status(403).json({ error: 'Parent hors dossier partagé.' });
    }
    const sourceEntries = entriesList.slice();
    const duplicateEntryRecursive = async (sourceEntry, parentId) => {
      const name = buildDossierCopyName(entriesList, sourceEntry.name, parentId);
      const payload = {
        rental_id: sourceEntry.rental_id,
        parent_id: parentId,
        entry_type: sourceEntry.entry_type,
        name,
        file_url: sourceEntry.entry_type === 'file' ? sourceEntry.file_url : null,
        file_name: sourceEntry.entry_type === 'file' ? name : null,
        file_type: sourceEntry.entry_type === 'file' ? sourceEntry.file_type : null,
        file_size: sourceEntry.entry_type === 'file' ? sourceEntry.file_size : null,
        color: sourceEntry.color ?? null,
        icon: sourceEntry.entry_type === 'folder' ? sourceEntry.icon ?? null : null,
      };
      const { data: inserted, error: insertErr } = await supabase
        .from('rental_dossier_entries')
        .insert(payload)
        .select('id, parent_id, entry_type, name, file_url, file_name, file_type, file_size, color, icon, created_at')
        .maybeSingle();
      if (insertErr) {
        throw insertErr;
      }
      const nextEntry = {
        ...sourceEntry,
        id: inserted.id,
        parent_id: parentId,
        name,
      };
      entriesList.push(nextEntry);
      if (sourceEntry.entry_type === 'folder') {
        const children = sourceEntries.filter((item) => item.parent_id === sourceEntry.id);
        for (const child of children) {
          await duplicateEntryRecursive(child, inserted.id);
        }
      }
      return inserted;
    };
    await duplicateEntryRecursive(entry, targetParentId);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[dossier-shares] duplicate error', err);
    return res.status(500).json({ error: 'Impossible de dupliquer.' });
  }
});

const normalizeRentalDocumentType = (value) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'devis' || normalized === 'quote' || normalized === 'quotation' || normalized === 'estimate') return 'devis';
  if (normalized === 'facture' || normalized === 'invoice') return 'facture';
  if (
    normalized === 'bon_prepa'
    || normalized === 'bon-prepa'
    || normalized === 'bonprepa'
    || normalized === 'prep'
    || normalized === 'preparation'
    || normalized === 'bon'
  ) return 'bon_prepa';
  return null;
};

const storeRentalDocumentHandler = async (req, res) => {
  try {
    const payload = req.body || {};
    const rentalIdRaw = payload.rentalId ?? payload.rental_id;
    const rentalId = typeof rentalIdRaw === 'string' ? rentalIdRaw.trim() : '';
    const docType = normalizeRentalDocumentType(payload.docType ?? payload.doc_type);
    const rawPdfValue = payload.pdfBase64 ?? payload.pdf_base64 ?? payload.file_url;
    const titleInput = sanitizeNullableString(payload.title);

    if (!UUID_REGEX.test(rentalId)) {
      return res.status(400).json({ error: 'Identifiant prestation invalide' });
    }
    if (!docType) {
      return res.status(400).json({ error: 'Type de document invalide' });
    }

    let parsedPdf = parsePdfDataPayload(rawPdfValue);
    if (!parsedPdf) {
      const fromStored = await buildPdfAttachmentFromStoredValue(rawPdfValue, titleInput || 'document');
      if (fromStored?.dataUrl) {
        parsedPdf = parsePdfDataPayload(fromStored.dataUrl);
      }
    }
    if (!parsedPdf) {
      return res.status(400).json({ error: 'PDF invalide ou manquant' });
    }

    const defaultTitle = docType === 'devis'
      ? 'Devis'
      : docType === 'facture'
        ? 'Facture'
        : 'Bon de préparation';
    const title = titleInput || `${defaultTitle} ${new Date().toLocaleDateString('fr-FR')}`;

    if (supabase) {
      const { data: inserted, error: insertErr } = await supabase
        .from('rental_documents')
        .insert({
          rental_id: rentalId,
          doc_type: docType,
          title,
          file_url: parsedPdf.dataUrl,
        })
        .select('id, rental_id, doc_type, title, file_url, created_at')
        .maybeSingle();
      if (insertErr) {
        console.error('[rental-documents] insert error', insertErr);
        return res.status(500).json({
          error: insertErr?.message || "Impossible d'enregistrer le document",
          code: insertErr?.code || null,
          details: insertErr?.details || null,
          hint: insertErr?.hint || null,
        });
      }
      return res.json({
        ok: true,
        storage: 'supabase',
        document: inserted,
      });
    }

    const safeTypeFolder = docType === 'devis' ? 'devis' : (docType === 'facture' ? 'factures' : 'bons');
    const dir = path.join(__dirname, '..', 'public', 'cms', 'rentals', rentalId);
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${safeTypeFolder}-${Date.now()}.pdf`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, parsedPdf.content);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const relativeUrl = `/cms/rentals/${rentalId}/${filename}`;
    return res.json({
      ok: true,
      storage: 'local',
      url: `${baseUrl}${relativeUrl}`,
      relativeUrl,
      rentalId,
      docType,
      title,
    });
  } catch (e) {
    console.error('[rental-documents] unexpected error', e);
    return res.status(500).json({ error: 'PDF write failed' });
  }
};

const generateRentalDocumentHandler = async (req, res) => {
  try {
    const payload = req.body || {};
    const rental = payload.rental || null;
    const rentalId = typeof payload.rentalId === 'string'
      ? payload.rentalId
      : (typeof rental?.id === 'string' ? rental.id : '');
    const docType = normalizeRentalDocumentType(payload.docType ?? payload.doc_type);
    const titleInput = sanitizeNullableString(payload.title);
    if (!rental || !rentalId || !UUID_REGEX.test(rentalId)) {
      return res.status(400).json({ error: 'Identifiant prestation invalide' });
    }
    if (!docType) {
      return res.status(400).json({ error: 'Type de document invalide' });
    }

    const docLabel = docType === 'devis'
      ? 'Devis'
      : docType === 'facture'
        ? 'Facture'
        : 'Bon de préparation';
    const title = titleInput || `${docLabel} ${new Date().toLocaleDateString('fr-FR')}`;

    const editorHtml = typeof payload.editorHtml === 'string'
      ? payload.editorHtml
      : (typeof payload.editor_html === 'string' ? payload.editor_html : '');
    const documentDesign = payload.documentDesign || payload.document_design || null;
    const studioTemplatePayload = payload.studioTemplate || payload.studio_template || null;
    const studioHasBlocks = Array.isArray(studioTemplatePayload?.blocks) && studioTemplatePayload.blocks.length > 0;
    const customCss = studioHasBlocks
      ? ''
      : (typeof payload.customCss === 'string'
          ? payload.customCss
          : (typeof studioTemplatePayload?.customCss === 'string' ? studioTemplatePayload.customCss : ''));

    const fallbackHtml = `[[ACCENT:#111827]]<h1>${docLabel}</h1><p>Réf: {{reference}}</p><p>Client: {{client_name}}</p>[[TABLE:equipment,qty,pricePerDay,days,total]]<p>Total: {{total_ttc}}</p>`;
    const templateHtml = editorHtml && editorHtml.trim().length > 0 ? editorHtml : fallbackHtml;

    const buildResult = buildRentalDocumentHtml({
      rental,
      docType,
      documentDesign,
      editorHtml: templateHtml,
      payments: Array.isArray(payload.payments) ? payload.payments : [],
      company: payload.company || null,
      client: payload.client || null,
      deliveryDate: payload.deliveryDate || payload.delivery_date || null,
      packItemsByEquipmentId: payload.packItemsByEquipmentId || payload.pack_items_by_equipment_id || {},
      equipmentCoefficient: payload.equipmentCoefficient ?? payload.equipment_coefficient ?? null,
      customCss,
      baseUrl: APP_BASE_URL,
      studioTemplate: studioTemplatePayload,
    });
    const html = typeof buildResult === 'string' ? buildResult : (buildResult?.html || '');
    const dynamicPdfOptions = (buildResult && typeof buildResult === 'object' && buildResult.pdfOptions)
      ? buildResult.pdfOptions
      : {};
    const pdfBuffer = await renderPdfFromHtml(html, {
      format: 'A4',
      media: 'print',
      ...dynamicPdfOptions,
    });
    const base64 = Buffer.from(pdfBuffer).toString('base64');
    const dataUrl = `data:application/pdf;base64,${base64}`;

    if (!supabase) {
      return res.status(500).json({ error: 'Supabase indisponible' });
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('rental_documents')
      .insert({
        rental_id: rentalId,
        doc_type: docType,
        title,
        file_url: dataUrl,
      })
      .select('id, rental_id, doc_type, title, file_url, created_at')
      .maybeSingle();
    if (insertErr) {
      console.error('[rental-documents/generate] insert error', insertErr);
      return res.status(500).json({
        error: insertErr?.message || "Impossible d'enregistrer le document",
        code: insertErr?.code || null,
        details: insertErr?.details || null,
        hint: insertErr?.hint || null,
      });
    }

    return res.json({
      ok: true,
      storage: 'supabase',
      document: inserted,
    });
  } catch (err) {
    console.error('[rental-documents/generate] error', err);
    return res.status(500).json({ error: 'PDF generation failed' });
  }
};

// Create/store a generated PDF document payload.
app.post('/api/rental-documents', storeRentalDocumentHandler);
app.post('/api/rental-documents/generate', generateRentalDocumentHandler);

// Template Studio — live PDF preview (no DB save)
// Mock data mirrors the placeholder values shown in the live preview (A mode).
app.post('/api/template-studio/preview', async (req, res) => {
  try {
    const payload = req.body || {};
    const snapshot = payload.snapshot || null;
    const docType = normalizeRentalDocumentType(payload.docType ?? 'devis');
    const documentDesign = payload.documentDesign || null;

    // Rental mock — mirrors A-preview placeholder values exactly
    const mockRental = {
      id: '00000000-0000-0000-0000-000000000000',
      reference_code: 'DEV-2026-0042',
      title: 'Festival Printemps',
      status: 'confirmed',
      type: 'location',
      start_date: '2026-03-12T09:00:00',
      end_date: '2026-03-14T23:00:00',
      location: 'Palais des Congrès, Paris',
      rental_coefficient_override: 1.25,
      discount_type: 'percentage',
      discount_value: 5,
      delivery_total_amount: 220,
      delivery_quantity: 1,
      delivery_offer_name: 'Forfait livraison',
      delivery_round_trip: true,
      return_delivery_at: '2026-03-15T08:00:00',
      returned_at: '2026-03-15T14:30:00',
      quote_expired_at: '2026-03-20',
      client_name: 'Jean Dupont',
      item_groups: [],
      // items: sum(qty*price) = 2360 → ×1.25 = 2 950,00 €
      items: [
        { id: 'i1', equipment_name: 'Système son L-Acoustics', quantity: 2, price_per_day: 480, position: 0 },
        { id: 'i2', equipment_name: 'Éclairage scène LED', quantity: 1, price_per_day: 900, position: 1 },
        { id: 'i3', equipment_name: 'LED Wash 200W', quantity: 4, price_per_day: 100, position: 2 },
        { id: 'i4', equipment_name: 'Câblage & multicoeur', quantity: 1, price_per_day: 100, position: 3 },
      ],
      // personnel: 320×1×2 = 640
      personnel_services: [
        { id: 'ps1', title: 'Technicien son', cost_per_person: 320, quantity: 1, days: 2, discount_percent: 0 },
      ],
      // insurance: 60×3 = 180
      insurance_services: [
        { id: 'is1', title: 'Assurance matériel', amount_per_day: 60, days: 3 },
      ],
      // other: 40×1×3 = 120
      other_services: [
        { id: 'os1', title: 'Consommables scène', price: 40, quantity: 1, days: 3 },
      ],
      // maintenance: 450 → total_services = 450+180+220+640+120 = 1 610
      maintenance_charges: [
        { id: 'mc1', label: 'Maintenance préventive', amount: 450 },
      ],
    };

    // Client mock
    const mockClient = {
      name: 'Jean Dupont',
      company: 'Acme Events',
      email: 'contact@acme-events.fr',
      phone: '+33 1 23 45 67 89',
      address: '25 Rue de la Paix, 75002 Paris, France',
    };

    // Payments mock — deposit 1 500 €
    const mockPayments = [
      { id: 'pay1', payment_type: 'deposit', status: 'completed', amount: 1500 },
    ];

    // Company mock — mirrors company placeholder values
    const mockCompany = {
      name: payload.company?.name || 'OpenRig',
      legalName: payload.company?.legalName || payload.company?.legal_name || 'OpenRig SAS',
      address: payload.company?.address || '10 Avenue des Sons, 69000 Lyon',
      email: payload.company?.email || 'contact@openrig.io',
      phone: payload.company?.phone || '+33 1 02 03 04 05',
      siren: payload.company?.siren || '123 456 789',
      siret: payload.company?.siret || '123 456 789 00012',
      vat: payload.company?.vat || 'FR00123456789',
      rib_iban: payload.company?.rib_iban || 'FR76 3000 4000 5000 6000 7000 890',
      rib_bic: payload.company?.rib_bic || 'BNPAFRPPXXX',
      logo_url: payload.company?.logo_url || '',
    };

    const buildResult = buildRentalDocumentHtml({
      rental: mockRental,
      docType,
      documentDesign,
      editorHtml: '',
      payments: mockPayments,
      company: mockCompany,
      client: mockClient,
      deliveryDate: '2026-03-12T06:00:00',
      packItemsByEquipmentId: {},
      equipmentCoefficient: null,
      customCss: '',
      baseUrl: APP_BASE_URL,
      studioTemplate: snapshot,
    });

    const html = typeof buildResult === 'string' ? buildResult : (buildResult?.html || '');
    const dynamicPdfOptions = (buildResult && typeof buildResult === 'object' && buildResult.pdfOptions)
      ? buildResult.pdfOptions
      : {};

    const pdfBuffer = await renderPdfFromHtml(html, {
      format: 'A4',
      media: 'print',
      ...dynamicPdfOptions,
    });

    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');
    return res.json({ ok: true, pdfBase64 });
  } catch (err) {
    console.error('[template-studio/preview] error', err);
    return res.status(500).json({ error: 'PDF preview failed' });
  }
});

ensureSupabaseOnBoot();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`PDF API listening on :${PORT}`));
