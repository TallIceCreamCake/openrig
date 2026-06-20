/**
 * OpenRig Public REST API — v1
 *
 * Mount with: import { mountPublicApi } from './publicApi.js';
 *             mountPublicApi(app, supabase);
 *
 * Base path : /api/v1/
 * Auth      : Authorization: Bearer <key>  OR  X-API-Key: <key>
 * Keys      : generated via POST /api/admin/api-keys, stored hashed (SHA-256)
 *
 * Available scopes (permissions):
 *   catalog:read       — GET /v1/catalog
 *   availability:read  — GET /v1/availability
 *   rentals:read       — GET /v1/rentals, GET /v1/rentals/:id
 *   clients:read       — GET /v1/clients, GET /v1/clients/:id
 *   equipment:read     — GET /v1/equipment, GET /v1/equipment/:id
 *   invoices:read      — GET /v1/invoices
 *   stats:read         — GET /v1/stats
 *   requests:write     — POST /v1/requests  (website contact/quote form)
 *   *                  — all scopes
 */

import crypto from 'crypto';

// ─── In-memory rate limit store (resets on server restart) ──────────────────
// Structure: Map<keyHash, { count: number, reset: number (ms timestamp) }>
const rlStore = new Map();

function checkRateLimit(keyHash, limitPerMinute) {
  const now = Date.now();
  const windowMs = 60_000;
  let slot = rlStore.get(keyHash) ?? { count: 0, reset: now + windowMs };
  if (now > slot.reset) slot = { count: 0, reset: now + windowMs };
  slot.count++;
  rlStore.set(keyHash, slot);
  return {
    ok: slot.count <= limitPerMinute,
    count: slot.count,
    limit: limitPerMinute,
    remaining: Math.max(0, limitPerMinute - slot.count),
    reset: slot.reset,
  };
}

// ─── API key validation middleware ───────────────────────────────────────────
async function resolveApiKey(req, res, supabase) {
  const authHeader = req.headers['authorization'] ?? '';
  const xKey = req.headers['x-api-key'] ?? '';
  const raw = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : xKey.trim();

  if (!raw) {
    res.status(401).json({
      error: 'API key required.',
      hint: 'Pass Authorization: Bearer <key> or X-API-Key: <key> header.',
    });
    return null;
  }

  const hash = crypto.createHash('sha256').update(raw).digest('hex');

  const { data: key, error } = await supabase
    .from('public_api_keys')
    .select('id, name, permissions, rate_limit_per_minute, expires_at')
    .eq('key_hash', hash)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !key) {
    res.status(401).json({ error: 'Invalid or revoked API key.' });
    return null;
  }

  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    res.status(401).json({ error: 'API key expired.', expired_at: key.expires_at });
    return null;
  }

  const rl = checkRateLimit(hash, key.rate_limit_per_minute ?? 60);

  res.set('X-RateLimit-Limit', String(rl.limit));
  res.set('X-RateLimit-Remaining', String(rl.remaining));
  res.set('X-RateLimit-Reset', String(Math.ceil(rl.reset / 1000)));

  if (!rl.ok) {
    res.status(429).json({
      error: 'Rate limit exceeded.',
      retry_after: Math.ceil((rl.reset - Date.now()) / 1000),
    });
    return null;
  }

  // Fire-and-forget last_used_at update
  supabase.from('public_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', key.id)
    .then(() => {});

  return key;
}

function can(key, scope) {
  const perms = key.permissions ?? [];
  return perms.includes('*') || perms.includes(scope);
}

// ─── Pagination helpers ──────────────────────────────────────────────────────
function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
  return { page, limit, from: (page - 1) * limit, to: page * limit - 1 };
}

function paginated(data, count, page, limit) {
  return {
    data: data ?? [],
    meta: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
  };
}

// ─── Mount all routes ────────────────────────────────────────────────────────
export function mountPublicApi(app, supabase) {

  // CORS for external websites — v1 routes only
  app.use('/api/v1', (req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, X-API-Key, Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });

  // ── Discovery ──────────────────────────────────────────────────────────────
  app.get('/api/v1', (_req, res) => {
    res.json({
      api: 'OpenRig Integration API',
      version: '1.0.0',
      docs: 'https://github.com/your-org/openrig/wiki/api',
      endpoints: [
        { method: 'GET',  path: '/api/v1/catalog',           scope: 'catalog:read',      description: 'Equipment catalog for website display' },
        { method: 'GET',  path: '/api/v1/availability',      scope: 'availability:read', description: 'Check equipment availability for a date range' },
        { method: 'GET',  path: '/api/v1/equipment',         scope: 'equipment:read',    description: 'Full equipment list with filters' },
        { method: 'GET',  path: '/api/v1/equipment/:id',     scope: 'equipment:read',    description: 'Single equipment detail' },
        { method: 'GET',  path: '/api/v1/rentals',           scope: 'rentals:read',      description: 'Rental list with status/date filters' },
        { method: 'GET',  path: '/api/v1/rentals/:id',       scope: 'rentals:read',      description: 'Single rental with line items' },
        { method: 'GET',  path: '/api/v1/clients',           scope: 'clients:read',      description: 'Client list with search' },
        { method: 'GET',  path: '/api/v1/clients/:id',       scope: 'clients:read',      description: 'Single client detail' },
        { method: 'GET',  path: '/api/v1/invoices',          scope: 'invoices:read',     description: 'Invoice list with filters' },
        { method: 'GET',  path: '/api/v1/stats',             scope: 'stats:read',        description: 'Activity summary for a period' },
        { method: 'POST', path: '/api/v1/requests',          scope: 'requests:write',    description: 'Create a rental request from a website form' },
      ],
    });
  });

  // ── Catalog — lightweight endpoint for public website display ──────────────
  // Returns equipment with primary image only. No pricing details unless included in scope.
  app.get('/api/v1/catalog', async (req, res) => {
    const key = await resolveApiKey(req, res, supabase);
    if (!key) return;
    if (!can(key, 'catalog:read')) return res.status(403).json({ error: 'Scope catalog:read required.' });

    try {
      const { category, search } = req.query;
      const { page, limit, from, to } = parsePagination(req.query);

      let q = supabase
        .from('equipment')
        .select(
          'id, name, reference, description, price_per_day, inventory_category,' +
          'category:equipment_categories(name),' +
          'images:equipment_images(url, is_primary)',
          { count: 'exact' }
        )
        .eq('archived', false)
        .order('name')
        .range(from, to);

      if (category) q = q.eq('equipment_category_id', category);
      if (search) q = q.ilike('name', `%${search}%`);

      const { data, error, count } = await q;
      if (error) throw error;

      // Flatten: keep only primary image url
      const items = (data ?? []).map((eq) => {
        const primary = (eq.images ?? []).find((img) => img.is_primary) ?? (eq.images ?? [])[0];
        return { ...eq, images: undefined, image_url: primary?.url ?? null };
      });

      res.json(paginated(items, count, page, limit));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Availability check ─────────────────────────────────────────────────────
  // GET /api/v1/availability?equipment_id=uuid&start=YYYY-MM-DD&end=YYYY-MM-DD[&quantity=1]
  app.get('/api/v1/availability', async (req, res) => {
    const key = await resolveApiKey(req, res, supabase);
    if (!key) return;
    if (!can(key, 'availability:read')) return res.status(403).json({ error: 'Scope availability:read required.' });

    try {
      const { equipment_id, start, end, quantity = '1' } = req.query;
      if (!equipment_id || !start || !end) {
        return res.status(400).json({ error: 'equipment_id, start, end are required.' });
      }

      const wantQty = Math.max(1, parseInt(quantity, 10));

      const { data: equip, error: eErr } = await supabase
        .from('equipment')
        .select('id, name, stock_quantity')
        .eq('id', equipment_id)
        .maybeSingle();

      if (eErr || !equip) return res.status(404).json({ error: 'Equipment not found.' });

      const { data: conflicts, error: cErr } = await supabase
        .from('rental_items')
        .select('quantity, rental:rentals!inner(start_date, end_date, status)')
        .eq('equipment_id', equipment_id)
        .not('rental.status', 'in', '("cancelled","archived","draft")')
        .lte('rental.start_date', end)
        .gte('rental.end_date', start);

      if (cErr) throw cErr;

      const booked = (conflicts ?? []).reduce((s, i) => s + (i.quantity || 1), 0);
      const stock = equip.stock_quantity || 1;
      const available = Math.max(0, stock - booked);

      res.json({
        data: {
          equipment_id,
          equipment_name: equip.name,
          start,
          end,
          requested_quantity: wantQty,
          total_stock: stock,
          booked_quantity: booked,
          available_quantity: available,
          is_available: available >= wantQty,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Equipment ──────────────────────────────────────────────────────────────
  app.get('/api/v1/equipment', async (req, res) => {
    const key = await resolveApiKey(req, res, supabase);
    if (!key) return;
    if (!can(key, 'equipment:read')) return res.status(403).json({ error: 'Scope equipment:read required.' });

    try {
      const { search, category } = req.query;
      const { page, limit, from, to } = parsePagination(req.query);

      let q = supabase
        .from('equipment')
        .select('id, name, reference, description, price_per_day, stock_quantity, inventory_category, equipment_category_id', { count: 'exact' })
        .eq('archived', false)
        .order('name')
        .range(from, to);

      if (search) q = q.ilike('name', `%${search}%`);
      if (category) q = q.eq('equipment_category_id', category);

      const { data, error, count } = await q;
      if (error) throw error;

      res.json(paginated(data, count, page, limit));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v1/equipment/:id', async (req, res) => {
    const key = await resolveApiKey(req, res, supabase);
    if (!key) return;
    if (!can(key, 'equipment:read')) return res.status(403).json({ error: 'Scope equipment:read required.' });

    try {
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('id', req.params.id)
        .maybeSingle();

      if (error || !data) return res.status(404).json({ error: 'Equipment not found.' });
      res.json({ data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Rentals ────────────────────────────────────────────────────────────────
  app.get('/api/v1/rentals', async (req, res) => {
    const key = await resolveApiKey(req, res, supabase);
    if (!key) return;
    if (!can(key, 'rentals:read')) return res.status(403).json({ error: 'Scope rentals:read required.' });

    try {
      const { status, type, client_id, from, to } = req.query;
      const { page, limit, from: rangeFrom, to: rangeTo } = parsePagination(req.query);

      let q = supabase
        .from('rentals')
        .select('id, reference_code, type, status, start_date, end_date, location, total_price, client_id, client_name, created_at', { count: 'exact' })
        .order('start_date', { ascending: false })
        .range(rangeFrom, rangeTo);

      if (status) q = q.eq('status', status);
      if (type) q = q.eq('type', type);
      if (client_id) q = q.eq('client_id', client_id);
      if (from) q = q.gte('start_date', from);
      if (to) q = q.lte('end_date', to);

      const { data, error, count } = await q;
      if (error) throw error;

      res.json(paginated(data, count, page, limit));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v1/rentals/:id', async (req, res) => {
    const key = await resolveApiKey(req, res, supabase);
    if (!key) return;
    if (!can(key, 'rentals:read')) return res.status(403).json({ error: 'Scope rentals:read required.' });

    try {
      const { data, error } = await supabase
        .from('rentals')
        .select('*, items:rental_items(id, equipment_id, equipment_name, equipment_type, quantity, price_per_day)')
        .eq('id', req.params.id)
        .maybeSingle();

      if (error || !data) return res.status(404).json({ error: 'Rental not found.' });
      res.json({ data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Clients ────────────────────────────────────────────────────────────────
  app.get('/api/v1/clients', async (req, res) => {
    const key = await resolveApiKey(req, res, supabase);
    if (!key) return;
    if (!can(key, 'clients:read')) return res.status(403).json({ error: 'Scope clients:read required.' });

    try {
      const { search, client_type } = req.query;
      const { page, limit, from, to } = parsePagination(req.query);

      let q = supabase
        .from('clients')
        .select('id, name, company, email, phone, client_type, created_at', { count: 'exact' })
        .order('name')
        .range(from, to);

      if (search) q = q.or(`name.ilike.%${search}%,company.ilike.%${search}%,email.ilike.%${search}%`);
      if (client_type) q = q.eq('client_type', client_type);

      const { data, error, count } = await q;
      if (error) throw error;

      res.json(paginated(data, count, page, limit));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v1/clients/:id', async (req, res) => {
    const key = await resolveApiKey(req, res, supabase);
    if (!key) return;
    if (!can(key, 'clients:read')) return res.status(403).json({ error: 'Scope clients:read required.' });

    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', req.params.id)
        .maybeSingle();

      if (error || !data) return res.status(404).json({ error: 'Client not found.' });
      res.json({ data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Invoices ───────────────────────────────────────────────────────────────
  app.get('/api/v1/invoices', async (req, res) => {
    const key = await resolveApiKey(req, res, supabase);
    if (!key) return;
    if (!can(key, 'invoices:read')) return res.status(403).json({ error: 'Scope invoices:read required.' });

    try {
      const { status, client_id, from, to } = req.query;
      const { page, limit, from: rangeFrom, to: rangeTo } = parsePagination(req.query);

      let q = supabase
        .from('invoices')
        .select('id, invoice_number, amount_ht, amount_ttc, vat_amount, status, due_date, paid_date, created_at, client:clients(name, email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(rangeFrom, rangeTo);

      if (status) q = q.eq('status', status);
      if (client_id) q = q.eq('client_id', client_id);
      if (from) q = q.gte('created_at', from);
      if (to) q = q.lte('created_at', to);

      const { data, error, count } = await q;
      if (error) throw error;

      res.json(paginated(data, count, page, limit));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  // GET /api/v1/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get('/api/v1/stats', async (req, res) => {
    const key = await resolveApiKey(req, res, supabase);
    if (!key) return;
    if (!can(key, 'stats:read')) return res.status(403).json({ error: 'Scope stats:read required.' });

    try {
      const now = new Date();
      const from = req.query.from || new Date(now.getFullYear(), 0, 1).toISOString();
      const to = req.query.to || now.toISOString();

      const [rentalsRes, invoicesRes, equipmentRes, clientsRes] = await Promise.all([
        supabase.from('rentals').select('id, status, total_price', { count: 'exact' }).gte('created_at', from).lte('created_at', to),
        supabase.from('invoices').select('id, amount_ttc, status', { count: 'exact' }).gte('created_at', from).lte('created_at', to),
        supabase.from('equipment').select('id', { count: 'exact' }).eq('archived', false),
        supabase.from('clients').select('id', { count: 'exact' }),
      ]);

      const rentals = rentalsRes.data ?? [];
      const invoices = invoicesRes.data ?? [];

      const revenue = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + (i.amount_ttc || 0), 0);
      const outstanding = invoices.filter((i) => ['sent', 'overdue'].includes(i.status)).reduce((s, i) => s + (i.amount_ttc || 0), 0);

      res.json({
        data: {
          period: { from, to },
          rentals: {
            total: rentalsRes.count ?? 0,
            by_status: Object.fromEntries(
              ['draft', 'confirmed', 'in_progress', 'completed', 'cancelled'].map((s) => [
                s,
                rentals.filter((r) => r.status === s).length,
              ])
            ),
          },
          revenue: {
            collected: revenue,
            outstanding,
          },
          equipment: { total: equipmentRes.count ?? 0 },
          clients: { total: clientsRes.count ?? 0 },
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Rental request (from website contact/quote forms) ──────────────────────
  // POST /api/v1/requests
  // Body: { client_name, client_email, client_phone?, start_date?, end_date?, location?, description?, items?: [{equipment_id?, equipment_name, quantity}] }
  app.post('/api/v1/requests', async (req, res) => {
    const key = await resolveApiKey(req, res, supabase);
    if (!key) return;
    if (!can(key, 'requests:write')) return res.status(403).json({ error: 'Scope requests:write required.' });

    try {
      const { client_name, client_email, client_phone, start_date, end_date, location, description, items } = req.body ?? {};

      if (!client_name?.trim()) return res.status(400).json({ error: 'client_name is required.' });
      if (!client_email?.trim()) return res.status(400).json({ error: 'client_email is required.' });

      const notes = [
        `[Demande via API]`,
        `Contact : ${client_email}${client_phone ? ' / ' + client_phone : ''}`,
        description ? `\n${description}` : '',
      ].filter(Boolean).join('\n');

      const { data: rental, error: rErr } = await supabase
        .from('rentals')
        .insert([{
          type: 'rental',
          status: 'draft',
          client_name: client_name.trim(),
          start_date: start_date || null,
          end_date: end_date || null,
          location: location || null,
          notes,
          origin: 'api',
        }])
        .select('id, reference_code')
        .single();

      if (rErr) throw rErr;

      if (Array.isArray(items) && items.length > 0) {
        const rows = items.map((item) => ({
          rental_id: rental.id,
          equipment_id: item.equipment_id || null,
          equipment_name: item.equipment_name || 'Non précisé',
          quantity: Math.max(1, item.quantity || 1),
          price_per_day: 0,
        }));
        await supabase.from('rental_items').insert(rows);
      }

      res.status(201).json({
        data: {
          id: rental.id,
          reference_code: rental.reference_code,
          status: 'draft',
          message: 'Request created. An operator will review and contact you.',
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Admin endpoints — manage API keys from the OpenRig settings UI
  // No API key auth needed (internal, protected by the app's own session layer)
  // ────────────────────────────────────────────────────────────────────────────

  app.get('/api/admin/api-keys', async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from('public_api_keys')
        .select('id, name, key_prefix, permissions, rate_limit_per_minute, expires_at, last_used_at, is_active, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json(data ?? []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/api-keys', async (req, res) => {
    try {
      const { name, permissions, rate_limit_per_minute, expires_at } = req.body ?? {};
      if (!name?.trim()) return res.status(400).json({ error: 'name is required.' });

      // or_live_ + 24 random bytes (48 hex chars) = 56 char key
      const rawKey = 'or_live_' + crypto.randomBytes(24).toString('hex');
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      const keyPrefix = rawKey.slice(0, 16); // "or_live_xxxxxxxx"

      const { data, error } = await supabase
        .from('public_api_keys')
        .insert([{
          name: name.trim(),
          key_hash: keyHash,
          key_prefix: keyPrefix,
          permissions: Array.isArray(permissions) && permissions.length > 0
            ? permissions
            : ['catalog:read', 'availability:read'],
          rate_limit_per_minute: rate_limit_per_minute || 60,
          expires_at: expires_at || null,
          is_active: true,
        }])
        .select('id, name, key_prefix, permissions, rate_limit_per_minute, expires_at, is_active, created_at')
        .single();

      if (error) throw error;

      res.status(201).json({
        ...data,
        key: rawKey, // plaintext — shown ONCE, never stored
        _warning: 'Copy this key now. It will not be shown again.',
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/admin/api-keys/:id', async (req, res) => {
    try {
      const allowed = ['name', 'permissions', 'rate_limit_per_minute', 'expires_at', 'is_active'];
      const updates = {};
      for (const k of allowed) {
        if (k in (req.body ?? {})) updates[k] = req.body[k];
      }
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No updatable fields provided.' });

      const { data, error } = await supabase
        .from('public_api_keys')
        .update(updates)
        .eq('id', req.params.id)
        .select('id, name, key_prefix, permissions, rate_limit_per_minute, expires_at, is_active, last_used_at')
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/admin/api-keys/:id', async (req, res) => {
    try {
      const { error } = await supabase.from('public_api_keys').delete().eq('id', req.params.id);
      if (error) throw error;
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
