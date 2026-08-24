import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCrossfade } from '../useCrossfade.js'

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
afterEach(() => { vi.useRealTimers() })

describe('useCrossfade', () => {
  it('displays the initial target immediately, visible, no fade', () => {
    const { result } = renderHook(() => useCrossfade('a'))
    expect(result.current.displayed).toBe('a')
    expect(result.current.visible).toBe(true)
  })

  it('fades out first (displayed stays the old value, visible turns false) when the target changes', () => {
    const { result, rerender } = renderHook(({ target }) => useCrossfade(target), { initialProps: { target: 'a' } })
    rerender({ target: 'b' })
    expect(result.current.displayed).toBe('a')
    expect(result.current.visible).toBe(false)
  })

  it('swaps to the new target and fades back in once fadeOutMs elapses', () => {
    const { result, rerender } = renderHook(({ target }) => useCrossfade(target), { initialProps: { target: 'a' } })
    rerender({ target: 'b' })
    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current.displayed).toBe('b')
    expect(result.current.visible).toBe(true)
  })

  it('does not restart the fade-out when the target changes again mid-transition', () => {
    const { result, rerender } = renderHook(({ target }) => useCrossfade(target), { initialProps: { target: 'a' } })
    rerender({ target: 'b' })
    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current.visible).toBe(false)

    rerender({ target: 'c' }) // interrupts before the b-swap ever happened
    // Still fading out the SAME element (still displaying 'a'), not reset.
    expect(result.current.displayed).toBe('a')
    expect(result.current.visible).toBe(false)

    // Only 300ms total from the FIRST change, not a fresh 300ms from the
    // interruption, is enough to land on the latest target.
    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current.displayed).toBe('c')
    expect(result.current.visible).toBe(true)
  })

  it('keeps fading (never snaps) when a burst nets back to the already-displayed value mid-transition', () => {
    const { result, rerender } = renderHook(({ target }) => useCrossfade(target), { initialProps: { target: 'a' } })
    rerender({ target: 'b' })
    act(() => { vi.advanceTimersByTime(100) })

    rerender({ target: 'a' }) // net target is back at the settled value
    // Still mid fade-out -- not an instant snap back to visible:true.
    expect(result.current.displayed).toBe('a')
    expect(result.current.visible).toBe(false)

    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current.displayed).toBe('a')
    expect(result.current.visible).toBe(true)
  })

  it('swaps instantly with no fade when reduced motion is set', () => {
    const { result, rerender } = renderHook(({ target }) => useCrossfade(target, { reduced: true }), { initialProps: { target: 'a' } })
    rerender({ target: 'b' })
    expect(result.current.displayed).toBe('b')
    expect(result.current.visible).toBe(true)
  })

  it('cancels an in-flight fade and swaps instantly the moment reduced motion turns on', () => {
    const { result, rerender } = renderHook(
      ({ target, reduced }) => useCrossfade(target, { reduced }),
      { initialProps: { target: 'a', reduced: false } }
    )
    rerender({ target: 'b', reduced: false })
    expect(result.current.visible).toBe(false) // mid fade-out

    rerender({ target: 'b', reduced: true })
    expect(result.current.displayed).toBe('b')
    expect(result.current.visible).toBe(true)

    // The old timeout must not fire later and clobber anything.
    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current.displayed).toBe('b')
    expect(result.current.visible).toBe(true)
  })

  it('a subsequent fade after settling still transitions normally', () => {
    const { result, rerender } = renderHook(({ target }) => useCrossfade(target), { initialProps: { target: 'a' } })
    rerender({ target: 'b' })
    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current.displayed).toBe('b')

    rerender({ target: 'c' })
    expect(result.current.displayed).toBe('b')
    expect(result.current.visible).toBe(false)
    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current.displayed).toBe('c')
    expect(result.current.visible).toBe(true)
  })
})
