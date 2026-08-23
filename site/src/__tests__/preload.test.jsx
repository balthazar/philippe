// Task 22: usePageData returns preloaded data (present when the prerender
// injected it) without fetching, and falls back to fetching on mount when
// nothing was preloaded for that key.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PreloadProvider, usePageData } from '../preload.jsx'

function Probe({ fetcher }) {
  const { data } = usePageData('page:biography', fetcher)
  return <span>{data ? data.title : 'loading'}</span>
}

describe('usePageData', () => {
  it('uses preloaded data without fetching', async () => {
    const fetcher = vi.fn()
    render(
      <PreloadProvider value={{ 'page:biography': { title: 'preloaded' } }}>
        <Probe fetcher={fetcher} />
      </PreloadProvider>
    )
    expect(screen.getByText('preloaded')).toBeInTheDocument()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fetches when nothing is preloaded', async () => {
    const fetcher = vi.fn(async () => ({ title: 'fetched' }))
    render(
      <PreloadProvider value={{}}>
        <Probe fetcher={fetcher} />
      </PreloadProvider>
    )
    expect(screen.getByText('loading')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('fetched')).toBeInTheDocument())
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
