import { QueryClient } from '@tanstack/react-query'
import { installContextDataInvalidation } from '../components/contextual/contextDataInvalidation'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
})

installContextDataInvalidation(queryClient)
