import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/202608140006_phase5_monthly_fees_receipts.sql'),
  'utf8',
)
const transferCheck = readFileSync(
  resolve(process.cwd(), 'supabase/checks/phase5_existing_transfer_candidates.sql'),
  'utf8',
)

describe('Phase 5 migration', () => {
  it('stores one fee snapshot per enrollment and month', () => {
    expect(migration).toContain('create table public.monthly_fees')
    expect(migration).toContain('normal_amount numeric(10, 2) not null')
    expect(migration).toContain('actual_amount numeric(10, 2) not null')
    expect(migration).toContain('on public.monthly_fees (enrollment_id, fee_month)')
    expect(migration).toContain("fee_month = date_trunc('month', fee_month)::date")
  })

  it('keeps payment and receipt states internally consistent', () => {
    expect(migration).toContain("payment_status in ('unpaid', 'paid', 'waived')")
    expect(migration).toContain("receipt_status in ('not_applicable', 'pending', 'completed')")
    expect(migration).toContain("payment_status = 'paid',")
    expect(migration).toContain('paid_at = now()')
    expect(migration).toContain("receipt_status = 'pending'")
    expect(migration).toContain("payment_status = 'unpaid',")
    expect(migration).toContain('paid_at = null')
    expect(migration).toContain("receipt_status = 'not_applicable'")
  })

  it('creates fees idempotently and snapshots the old price before a class price change', () => {
    expect(migration).toContain('function public.ensure_monthly_fees')
    expect(migration).toContain('on conflict (enrollment_id, fee_month) do nothing')
    expect(migration).toContain('classes_snapshot_fees_before_price_change')
    expect(migration).toContain('old.monthly_fee')
  })

  it('tracks transfers, bills the old enrollment mid-month, and bills the new enrollment on day 1', () => {
    expect(migration).toContain('transferred_from_enrollment_id uuid')
    expect(migration).toContain('e.transferred_from_enrollment_id is not null')
    expect(migration).toContain("date_trunc('month', previous.end_date)::date")
    expect(migration).toContain('extract(day from p_transfer_date) = 1')
    expect(migration).toContain("raise exception 'Transfer month already has a processed old enrollment fee'")
    expect(migration).not.toContain('transfer_pending_count')
  })

  it('only permits same-subject transfers and refuses to guess historical links', () => {
    expect(migration).toContain("raise exception 'Transfer classes must have the same subject'")
    expect(migration).toContain("raise exception 'PHASE5_HISTORICAL_TRANSFER_REVIEW_REQUIRED'")
    expect(migration).toContain("raise exception 'Future monthly fees cannot be generated'")
    expect(transferCheck).toContain('successor.join_date = previous.end_date + 1')
    expect(transferCheck).toContain('successor_class.subject_id = previous_class.subject_id')
    expect(transferCheck).not.toMatch(/\b(update|delete|insert)\b/i)
  })

  it('backfills only the confirmed Phase 2 production transfer', () => {
    expect(migration).toContain("previous.id = '45f8a1a9-6e10-42f2-9bc8-1a36936eafd8'::uuid")
    expect(migration).toContain("successor.id = 'f60ec161-54bd-4959-b99a-32e6c946dd90'::uuid")
    expect(migration).toContain("previous.end_date = '2026-09-14'::date")
    expect(migration).toContain("successor.join_date = '2026-09-15'::date")
    expect(migration).toContain("raise exception 'PHASE5_CONFIRMED_TRANSFER_BACKFILL_FAILED'")
  })

  it('supports final-month waiver, atomic receipt batches, RLS, and activity records', () => {
    expect(migration).toContain('function public.end_enrollment_with_fee')
    expect(migration).toContain('p_waive_final_month boolean default false')
    expect(migration).toContain('function public.complete_monthly_fee_receipts')
    expect(migration).toContain('create table public.activity_logs')
    expect(migration).toContain('alter table public.monthly_fees enable row level security')
    expect(migration).toContain('alter table public.activity_logs enable row level security')
    expect(migration).not.toContain('payment_method')
    expect(migration).not.toContain('receipt_number')
  })
})
