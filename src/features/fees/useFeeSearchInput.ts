import { useLayoutEffect, useRef, useState, type ChangeEvent, type CompositionEvent, type KeyboardEvent } from 'react'

// Keep the native IME draft local; only completed searches belong in the URL.
export function useFeeSearchInput(value: string, location: { key: string; search: string }, commit: (value: string) => string | undefined) {
  const [draft, setDraft] = useState(value)
  const session = useRef({ composing: false, obsolete: false, submitted: value, expectedSearch: undefined as string | undefined, ignoredTail: null as string | null })

  useLayoutEffect(() => {
    const current = session.current
    if (current.expectedSearch === location.search && current.submitted === value) {
      current.expectedSearch = undefined
      return
    }
    // Navigation/filter changes win over a composition started in an older scope.
    if (current.composing) current.obsolete = true
    current.expectedSearch = undefined
    current.submitted = value
    current.ignoredTail = null
    setDraft(value)
  }, [location.key, location.search, value])

  const submit = (text: string) => {
    const current = session.current
    if (current.submitted === text) return
    const nextSearch = commit(text)
    if (nextSearch === undefined) return
    current.submitted = text
    current.expectedSearch = nextSearch
  }
  const clearTail = () => { session.current.ignoredTail = null }

  return {
    value: draft,
    onCompositionStart: () => {
      session.current.composing = true
      session.current.obsolete = false
      clearTail()
    },
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const text = event.currentTarget.value, current = session.current
      if (current.ignoredTail === text) { clearTail(); return }
      clearTail()
      if ((event.nativeEvent as InputEvent).isComposing && text !== current.submitted) current.composing = true
      if (current.obsolete) return
      setDraft(text)
      if (!current.composing) submit(text)
    },
    onCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => {
      const text = event.currentTarget.value, current = session.current
      current.composing = false
      if (current.obsolete) {
        current.obsolete = false
        current.ignoredTail = text
        setDraft(value)
        return
      }
      setDraft(text)
      submit(text)
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (!session.current.composing && !event.nativeEvent.isComposing && event.key !== 'Process') clearTail()
    },
    onPaste: clearTail,
    onCut: clearTail,
  }
}
