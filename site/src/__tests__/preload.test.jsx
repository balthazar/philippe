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

// Renders whatever key it is given, so a rerender can change the key the way
// a client-side navigation between two articles does, and records what each
// render actually SAW. Asserting on the final DOM cannot catch the bug this
// pins: rerender() wraps in act(), which flushes effects before any assertion
// runs, so an effect-only reset has already corrected the DOM by then. The
// bad frame is only visible from inside render.
function KeyedProbe({ pageKey, fetcher, seen }) {
  const { data } = usePageData(pageKey, fetcher)
  seen.push([pageKey, data ? data.title : 'none'])
  return <span data-testid="out">{data ? data.title : 'none'}</span>
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

  // React commits the render following a key change before effects run, so
  // resetting only in an effect hands the caller the PREVIOUS key's data for
  // one extra render. That briefly painted one article's language-toggle href
  // onto the next article's page during client-side navigation.
  it('never returns the previous key\'s data after the key changes', async () => {
    const fetcher = vi.fn(async () => ({ title: 'fetched-b' }))
    const seen = []
    const tree = (pageKey) => (
      <PreloadProvider value={{ 'article:a': { title: 'A' } }}>
        <KeyedProbe pageKey={pageKey} fetcher={fetcher} seen={seen} />
      </PreloadProvider>
    )
    const { rerender } = render(tree('article:a'))
    expect(seen).toContainEqual(['article:a', 'A'])

    rerender(tree('article:b'))
    await waitFor(() => expect(screen.getByTestId('out')).toHaveTextContent('fetched-b'))

    // No render under key b ever saw key a's data, not even for one frame.
    expect(seen.filter(([k]) => k === 'article:b').map(([, title]) => title)).not.toContain('A')
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

  // Every navigation used to drop the page's data to null, paint the empty
  // aria-busy placeholder and fetch the same thing again, so returning to a
  // page you had just left was as blank and as slow as arriving at it for the
  // first time. The chrome around it was mounted the whole time; it was the
  // data that kept being thrown away.
  describe('session cache', () => {
    it('renders an already-fetched key on the first commit, with no placeholder frame', async () => {
      const fetcher = vi.fn(async () => ({ title: 'A' }))
      const seen = []
      const tree = (pageKey) => (
        <PreloadProvider value={{}}>
          <KeyedProbe pageKey={pageKey} fetcher={fetcher} seen={seen} />
        </PreloadProvider>
      )
      const { rerender } = render(tree('article:a'))
      await waitFor(() => expect(screen.getByTestId('out')).toHaveTextContent('A'))

      // Away and back, the way a visitor moves between two exhibitions.
      rerender(tree('article:b'))
      await waitFor(() => expect(screen.getByTestId('out')).toHaveTextContent('A'))
      seen.length = 0
      rerender(tree('article:a'))

      // Not one render under key a saw 'none': the cached value was there
      // synchronously, so there was never a blank frame to fade back in from.
      expect(seen.filter(([k]) => k === 'article:a').map(([, title]) => title)).not.toContain('none')
    })

    it('does not fetch a key twice', async () => {
      const fetcher = vi.fn(async () => ({ title: 'once' }))
      const tree = (pageKey) => (
        <PreloadProvider value={{}}>
          <KeyedProbe pageKey={pageKey} fetcher={fetcher} seen={[]} />
        </PreloadProvider>
      )
      const { rerender } = render(tree('page:x'))
      await waitFor(() => expect(screen.getByTestId('out')).toHaveTextContent('once'))
      rerender(tree('page:y'))
      await waitFor(() => expect(screen.getByTestId('out')).toHaveTextContent('once'))
      rerender(tree('page:x'))
      await waitFor(() => expect(screen.getByTestId('out')).toHaveTextContent('once'))

      // page:x fetched once, page:y once. Never a third call.
      expect(fetcher).toHaveBeenCalledTimes(2)
    })

    // A network failure has to stay retryable; caching it would strand the
    // page on an error for the rest of the session.
    it('does not cache a rejection', async () => {
      let attempts = 0
      // Fails the first time this key is asked for, succeeds after. A plain
      // mockRejectedValueOnce would be consumed by the intervening key.
      const fetcher = vi.fn(async () => {
        attempts += 1
        if (attempts === 1) throw new Error('offline')
        return { title: 'second try' }
      })
      const tree = (pageKey) => (
        <PreloadProvider value={{}}>
          <KeyedProbe pageKey={pageKey} fetcher={fetcher} seen={[]} />
        </PreloadProvider>
      )
      const { rerender } = render(tree('page:flaky'))
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
      rerender(tree('page:other'))
      await waitFor(() => expect(screen.getByTestId('out')).toHaveTextContent('second try'))

      // Back to the key that failed: it is asked for again rather than being
      // stranded on its error for the rest of the session.
      rerender(tree('page:flaky'))
      await waitFor(() => expect(screen.getByTestId('out')).toHaveTextContent('second try'))
      expect(fetcher).toHaveBeenCalledTimes(3)
    })

    // The prerender's own injected data is the server's answer for this exact
    // render; it must not be shadowed by anything the client happened to fetch.
    it('lets preloaded data win over the cache', async () => {
      const fetcher = vi.fn(async () => ({ title: 'fetched' }))
      render(
        <PreloadProvider value={{}}>
          <KeyedProbe pageKey="page:z" fetcher={fetcher} seen={[]} />
        </PreloadProvider>
      )
      await waitFor(() => expect(screen.getByTestId('out')).toHaveTextContent('fetched'))

      render(
        <PreloadProvider value={{ 'page:z': { title: 'preloaded' } }}>
          <KeyedProbe pageKey="page:z" fetcher={fetcher} seen={[]} />
        </PreloadProvider>
      )
      expect(screen.getAllByTestId('out').at(-1)).toHaveTextContent('preloaded')
    })
  })
})
