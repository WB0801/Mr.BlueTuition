import { render, screen } from '@testing-library/react'
import { RestoreUnavailableSection } from './RestoreUnavailableSection'

describe('RestoreUnavailableSection', () => {
  it('isolates restore as dangerous and never presents a working or fake action', () => {
    render(<RestoreUnavailableSection />)

    expect(screen.getByText('尚未开放')).toBeInTheDocument()
    expect(screen.getByText(/恢复会改写现有业务资料/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '恢复备份' })).toBeDisabled()
  })
})
