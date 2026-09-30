import { countPendingReceipts, listReceiptQueue, mapMonthlyFeeDetails } from './feesService'

const query = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn() }))
vi.mock('../../../lib/requireSupabase', () => ({ requireSupabase: () => ({ from: query.from }) }))

describe('fee query mapping', () => {
  it('counts and lists the same pending receipt queue including temporary-class payments', async () => {
    const rows = [{ receipt_key: 'monthly_fee:a', amount: '120' }, { receipt_key: 'temporary_class_payment:b', amount: '50' }]
    const builder = { select: query.select, eq: query.eq, order: query.order, then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: rows, count: 2, error: null })) }
    Object.values(query).forEach((mock) => mock.mockReset().mockReturnValue(builder))
    expect(await countPendingReceipts()).toBe(2)
    expect(await listReceiptQueue('pending')).toMatchObject([{ receipt_key: 'monthly_fee:a', amount: 120 }, { receipt_key: 'temporary_class_payment:b', amount: 50 }])
    expect(query.from.mock.calls).toEqual([['receipt_queue'], ['receipt_queue']])
    expect(query.eq.mock.calls).toEqual([['receipt_status', 'pending'], ['receipt_status', 'pending']])
    expect(query.select).toHaveBeenCalledWith('receipt_key', { count: 'exact', head: true })
  })
  it('reads the student through the enrollment relationship', () => {
    const result = mapMonthlyFeeDetails({
      id: 'fee-1',
      owner_id: 'owner-1',
      student_id: 'student-1',
      enrollment_id: 'enrollment-1',
      fee_month: '2026-08-01',
      normal_amount: '100.00',
      actual_amount: '50.00',
      payment_status: 'unpaid',
      paid_at: null,
      receipt_status: 'not_applicable',
      receipt_completed_at: null,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
      enrollment: {
        id: 'enrollment-1',
        class_id: 'class-1',
        join_date: '2026-08-20',
        end_date: null,
        status: 'active',
        student: { id: 'student-1', name: '插班学生', school_class: null, phone: null },
        class: { id: 'class-1', name: '高一会计学（1）', status: 'active' },
      },
    } as never)

    expect(result.student?.name).toBe('插班学生')
    expect(result.enrollment?.class?.name).toBe('高一会计学（1）')
    expect(result.normal_amount).toBe(100)
    expect(result.actual_amount).toBe(50)
  })
})
