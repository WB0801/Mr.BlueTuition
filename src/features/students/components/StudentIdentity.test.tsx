import { render, screen } from '@testing-library/react'
import { StudentIdentity } from './StudentIdentity'

describe('StudentIdentity', () => {
  it('distinguishes students with the same name without displaying internal IDs', () => {
    const { rerender } = render(
      <StudentIdentity student={{ name: '陈欣怡', school_class: '高一商仁', phone: '012-1111111' }} />,
    )

    expect(screen.getByText('陈欣怡')).toBeInTheDocument()
    expect(screen.getByText('高一商仁 · 012-1111111')).toBeInTheDocument()

    rerender(<StudentIdentity student={{ name: '陈欣怡', school_class: '高一商孝', phone: '017-2222222' }} />)

    expect(screen.getByText('高一商孝 · 017-2222222')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('student_id')
  })
})
