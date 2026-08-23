import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BlockEditor } from '../BlockEditor.jsx'

const blocks = [
  { type: 'heading', value: { fr: 'Un', en: '' }, level: 2 },
  { type: 'specs', items: [{ term: { fr: 'Tirage', en: '' }, value: { fr: '3', en: '' } }] },
]

describe('BlockEditor', () => {
  it('renders one editor per block', () => {
    render(<BlockEditor blocks={blocks} lang="fr" onChange={() => {}} />)
    expect(screen.getAllByTestId('block')).toHaveLength(2)
  })

  it('appends a block of the chosen type', async () => {
    const onChange = vi.fn()
    render(<BlockEditor blocks={blocks} lang="fr" onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText(/ajouter/i), 'text')
    expect(onChange).toHaveBeenLastCalledWith([...blocks, { type: 'text', value: { fr: '', en: '' } }])
  })

  it('moves a block up', async () => {
    const onChange = vi.fn()
    render(<BlockEditor blocks={blocks} lang="fr" onChange={onChange} />)
    await userEvent.click(screen.getAllByRole('button', { name: /monter/i })[1])
    expect(onChange).toHaveBeenLastCalledWith([blocks[1], blocks[0]])
  })

  it('deletes a block', async () => {
    const onChange = vi.fn()
    render(<BlockEditor blocks={blocks} lang="fr" onChange={onChange} />)
    await userEvent.click(screen.getAllByRole('button', { name: /supprimer/i })[0])
    expect(onChange).toHaveBeenLastCalledWith([blocks[1]])
  })

  // Task 25, section 3: the move/delete controls became icon-only buttons in
  // the block header. An icon with no aria-label is invisible to a screen
  // reader, so this asserts the accessible name and the native title (for a
  // sighted hover) explicitly, rather than relying only on the other tests'
  // regex queries (which would happily match visible text too, and so
  // wouldn't by themselves prove the icon-only buttons still have names).
  it('gives every icon-only block control both an aria-label and a title', () => {
    render(<BlockEditor blocks={blocks} lang="fr" onChange={() => {}} />)
    for (const name of ['Monter le bloc', 'Descendre le bloc', 'Supprimer le bloc']) {
      const buttons = screen.getAllByRole('button', { name })
      expect(buttons).toHaveLength(blocks.length)
      for (const button of buttons) {
        // Checked as explicit attributes, not just the resolved accessible
        // name above: a `title`-only button (no aria-label) would still
        // resolve to the same accessible name via the browser's title
        // fallback, so that query alone can't tell the two apart.
        expect(button).toHaveAttribute('aria-label', name)
        expect(button).toHaveAttribute('title', name)
      }
    }
  })

  it('keeps the first block\'s move-up and the last block\'s move-down disabled', () => {
    render(<BlockEditor blocks={blocks} lang="fr" onChange={() => {}} />)
    expect(screen.getAllByRole('button', { name: 'Monter le bloc' })[0]).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Descendre le bloc' }).at(-1)).toBeDisabled()
  })

  // Task 25, client feedback item 5: inserting only at the end (append, then
  // "Monter" repeatedly) took a dozen clicks on a long article. An insert
  // point sits before every block, including the very first one.
  it('inserts a block at the very top via the first insert point', async () => {
    const onChange = vi.fn()
    render(<BlockEditor blocks={blocks} lang="fr" onChange={onChange} />)
    const insertPoints = screen.getAllByLabelText(/insérer un bloc/i)
    await userEvent.selectOptions(insertPoints[0], 'text')
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'text', value: { fr: '', en: '' } }, ...blocks])
  })

  it('inserts a block between two existing blocks via that gap\'s insert point', async () => {
    const onChange = vi.fn()
    render(<BlockEditor blocks={blocks} lang="fr" onChange={onChange} />)
    const insertPoints = screen.getAllByLabelText(/insérer un bloc/i)
    expect(insertPoints).toHaveLength(blocks.length)
    await userEvent.selectOptions(insertPoints[1], 'text')
    expect(onChange).toHaveBeenLastCalledWith([blocks[0], { type: 'text', value: { fr: '', en: '' } }, blocks[1]])
  })

  // Task 25, client feedback item 6: drag reorder via an explicit handle in
  // the block header, reusing ArticleList.jsx's splice-out/splice-in
  // algorithm. The up/down buttons (tested above) remain the
  // keyboard-reachable path; this only proves the drag path also works.
  it('reorders blocks by dragging the block header\'s drag handle onto another block', () => {
    const onChange = vi.fn()
    render(<BlockEditor blocks={blocks} lang="fr" onChange={onChange} />)
    const handles = screen.getAllByText('⠿')
    const targets = screen.getAllByTestId('block')
    const dataTransfer = { setData: vi.fn(), getData: vi.fn() }

    fireEvent.dragStart(handles[0], { dataTransfer })
    fireEvent.dragOver(targets[1], { dataTransfer })
    fireEvent.drop(targets[1], { dataTransfer })

    expect(onChange).toHaveBeenLastCalledWith([blocks[1], blocks[0]])
  })

  // Task 25, client feedback item 1: dragging gave no sign of where a block
  // would land. Same lifted-row / edge-indicator treatment as ArticleList.jsx.
  it('shows a lifted state on the dragged block and a drop-indicator on the hovered block', () => {
    render(<BlockEditor blocks={blocks} lang="fr" onChange={() => {}} />)
    const handles = screen.getAllByText('⠿')
    const targets = screen.getAllByTestId('block')
    const dataTransfer = { setData: vi.fn(), getData: vi.fn() }

    fireEvent.dragStart(handles[0], { dataTransfer })
    expect(targets[0]).toHaveClass('is-dragging')

    // Dragging block 0 down onto block 1: it lands after block 1 (same
    // splice-out/splice-in as the reorder test above), so the indicator
    // shows on block 1's trailing edge.
    fireEvent.dragOver(targets[1], { dataTransfer })
    expect(targets[1]).toHaveClass('drop-indicator-after')

    fireEvent.dragEnd(handles[0], { dataTransfer })
    expect(targets[0]).not.toHaveClass('is-dragging')
    expect(targets[1]).not.toHaveClass('drop-indicator-after')
  })
})
