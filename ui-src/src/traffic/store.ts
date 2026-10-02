import { create } from 'zustand'

export type TrafficFilter = 'all' | 'errors' | 'redirects' | 'generated'

interface TrafficUI {
  selectedId: string | null
  filter: TrafficFilter
  search: string
  select(id: string | null): void
  setFilter(filter: TrafficFilter): void
  setSearch(search: string): void
}

/** What the traffic inspector shows: the selected request, the filter and the search. */
export const useTrafficUI = create<TrafficUI>()(set => ({
  selectedId: null,
  filter: 'all',
  search: '',
  select: selectedId => set({ selectedId }),
  setFilter: filter => set({ filter }),
  setSearch: search => set({ search }),
}))
