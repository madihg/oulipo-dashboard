-- 0002_network_depth.sql
-- Widen network_category enum + add columns for tier cadence, Gmail/Drive enrichment,
-- aliases for dedup across spreadsheet imports, and vault section provenance.
-- Per /Users/halim/.claude/plans/plan-mode-let-s-say-shiny-bee.md.

-- Widen the enum (additive only - existing values preserved)
alter type hmart.network_category add value if not exists 'fan_mail';
alter type hmart.network_category add value if not exists 'fellow_artist';
alter type hmart.network_category add value if not exists 'art_institution';
alter type hmart.network_category add value if not exists 'residency';
alter type hmart.network_category add value if not exists 'conference';
alter type hmart.network_category add value if not exists 'ally';
alter type hmart.network_category add value if not exists 'gather';
alter type hmart.network_category add value if not exists 'marketing_partner';
alter type hmart.network_category add value if not exists 'dialog';
alter type hmart.network_category add value if not exists 'shows_stages';
alter type hmart.network_category add value if not exists 'wikitongues';
alter type hmart.network_category add value if not exists 'pm_corporate_workshop';
alter type hmart.network_category add value if not exists 'money';
alter type hmart.network_category add value if not exists 'cohort';
alter type hmart.network_category add value if not exists 'tbd';

-- Add new columns to network_contacts
alter table hmart.network_contacts
  add column if not exists category_label text,
  add column if not exists tier_cadence_label text,
  add column if not exists last_thread_summary text,
  add column if not exists last_thread_url text,
  add column if not exists drive_refs jsonb not null default '[]'::jsonb,
  add column if not exists social jsonb not null default '{}'::jsonb,
  add column if not exists intro_source text,
  add column if not exists aliases text[] not null default '{}',
  add column if not exists vault_section text;

-- Idempotent-upsert unique index on (user_id, lower(name)).
-- Allows the importer to re-run safely without duplicating rows.
create unique index if not exists network_contacts_user_name
  on hmart.network_contacts (user_id, lower(name));
