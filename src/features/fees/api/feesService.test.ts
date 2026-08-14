import { mapMonthlyFeeDetails } from './feesService'

describe('fee query mapping', () => {
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
