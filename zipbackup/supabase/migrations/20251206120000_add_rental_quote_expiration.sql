alter table rentals
  add column if not exists quote_expired_at timestamptz null,
  add column if not exists quote_expired_notice_at timestamptz null;
