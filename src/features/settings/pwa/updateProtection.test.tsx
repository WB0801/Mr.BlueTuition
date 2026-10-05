import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { acceptPwaFormChanges, preparePwaFormSave, createFormProtection, updateProtection, usePwaUpdateGuard } from './updateProtection'
afterEach(cleanup)
it('protects dirty forms, restores safety when reverted or removed, and does not treat focus as an edit', () => {
  const { container, unmount } = render(<form><input defaultValue="旧值" /><select defaultValue="A"><option>A</option><option>B</option></select></form>)
  const protection = createFormProtection(document)
  const input = container.querySelector('input')!, select = container.querySelector('select')!
  fireEvent.focusIn(input); expect(protection.reason()).toBe('')
  fireEvent.input(input, { target: { value: '新值' } }); expect(protection.reason()).toContain('未保存')
  fireEvent.input(input, { target: { value: '旧值' } }); expect(protection.reason()).toBe('')
  fireEvent.focusIn(select); fireEvent.change(select, { target: { value: 'B' } }); expect(protection.reason()).toContain('未保存')
  unmount(); expect(protection.reason()).toBe(''); protection.dispose()
})
it('does not clear dirty work on failed submission, but honors explicit form reset', async () => {
  const { container } = render(<form onSubmit={e => e.preventDefault()}><input defaultValue="" /></form>)
  const protection = createFormProtection(document), input = container.querySelector('input')!, form = input.form!
  fireEvent.focusIn(input); fireEvent.change(input, { target: { value: '未保存' } }); fireEvent.submit(form); expect(protection.reason()).not.toBe('')
  form.reset(); await act(async () => {}); expect(protection.reason()).toBe(''); protection.dispose()
})
it('bridges signature, synchronization, scores and batch progress without a required provider', () => {
  function Probe({ busy }: { busy: boolean }) { usePwaUpdateGuard(busy, '请先完成签名同步'); return null }
  const { rerender, unmount } = render(<Probe busy />); expect(updateProtection.reason()).toContain('签名')
  rerender(<Probe busy={false} />); expect(updateProtection.reason()).toBe('')
  rerender(<Probe busy />); unmount(); expect(updateProtection.reason()).toBe('')
})
it('clears a retained form only after an explicit successful save acknowledgement', () => {
  const { container } = render(<form><input defaultValue="60" /></form>), protection = createFormProtection(document)
  const input = container.querySelector('input')!
  fireEvent.change(input, { target: { value: '80' } }); expect(protection.reason()).not.toBe('')
  acceptPwaFormChanges(input.form!); expect(protection.reason()).toBe('')
  fireEvent.change(input, { target: { value: '90' } }); expect(protection.reason()).not.toBe(''); protection.dispose()
})
it('preserves an additional edit made while the earlier form value is being saved', () => {
  const { container } = render(<form><input defaultValue="60" /></form>), protection = createFormProtection(document)
  const input = container.querySelector('input')!; fireEvent.change(input, { target: { value: '80' } }); const saved = preparePwaFormSave(input.form!)
  fireEvent.change(input, { target: { value: '90' } }); saved(); expect(protection.reason()).not.toBe('')
  fireEvent.change(input, { target: { value: '80' } }); expect(protection.reason()).toBe(''); protection.dispose()
})
it('acknowledges an intentional reset without accepting other edits made during submission', () => {
  const { container } = render(<form><select defaultValue=""><option value="">请选择</option><option>A</option><option>B</option></select><input defaultValue="2026-10-05" /></form>)
  const protection = createFormProtection(document), select = container.querySelector('select')!, input = container.querySelector('input')!
  fireEvent.change(select, { target: { value: 'A' } }); fireEvent.change(input, { target: { value: '2027-01-20' } })
  const saved = preparePwaFormSave(input.form!)
  fireEvent.change(select, { target: { value: '' } }); saved(new Map([[select, '']]))
  expect(protection.reason()).toBe('')
  fireEvent.change(select, { target: { value: 'A' } }); const next = preparePwaFormSave(input.form!)
  fireEvent.change(select, { target: { value: 'B' } }); fireEvent.change(input, { target: { value: '2027-02-21' } })
  next(new Map([[select, '']]))
  expect(protection.reason()).toContain('未保存')
  fireEvent.change(input, { target: { value: '2027-01-20' } }); expect(protection.reason()).toContain('未保存')
  fireEvent.change(select, { target: { value: '' } }); expect(protection.reason()).toBe(''); protection.dispose()
})
