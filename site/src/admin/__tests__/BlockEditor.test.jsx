import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BlockEditor } from '../BlockEditor.jsx'

// Task 30, part 5: `heading` is retired as a block type -- these generic
// "any two blocks" fixtures use `text` and `specs` rather than a heading.
const blocks = [
  { type: 'text', value: { fr: '<h2>Un</h2>', en: '' } },
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

  // Client feedback: "Ajouter un bloc" (append) and "Insérer un bloc"
  // (per-gap insert) do nearly the same thing and must look the same.
  it('gives the append control the same design as the per-gap insert control', () => {
    render(<BlockEditor blocks={blocks} lang="fr" onChange={() => {}} />)
    const appendSelect = screen.getByLabelText(/ajouter un bloc/i)
    const insertSelects = screen.getAllByLabelText(/insérer un bloc/i)
    expect(appendSelect).toHaveClass('block-insert-select')
    expect(appendSelect.closest('.block-insert-point')).toBeInTheDocument()
    for (const select of insertSelects) {
      expect(select).toHaveClass('block-insert-select')
    }
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

// Client feedback (task 27), replacing the original plan of keeping a
// separate cover picker: each gallery image gets two toggles, "Cover" and
// "Hidden from grid", so an image that only exists to serve as the cover can
// live in the gallery without appearing in the public grid. Only rendered
// when `onSetCover` is passed (ArticleEditor) -- PageEditor's pages have no
// `cover` field at all, so its BlockEditor usage omits it.
// Client feedback (task 27, item 5): replaced with icon buttons -- Star
// (cover), Eye (hidden), Width (span, cycling), Trash (remove) -- each with
// its own aria-label/title, consistent with the block header icons.
describe('BlockEditor gallery item icon controls', () => {
  const galleryBlocks = [
    {
      type: 'gallery',
      columns: 3,
      items: [
        { image: { _id: 'img1' }, caption: { fr: '', en: '' }, span: 1 },
        { image: { _id: 'img2' }, caption: { fr: '', en: '' }, span: 1, hidden: true },
      ],
    },
  ]

  // Task 30, part 3: the star is a real toggle now -- pressing it on the
  // current cover clears `article.cover` rather than being a dead end once
  // set. The accessible name says what the press WILL do, not only the
  // current state, matching the Eye control's own convention just below.
  it('marks the item matching coverId as the pressed cover button, with a label describing what pressing it will do', () => {
    render(<BlockEditor blocks={galleryBlocks} lang="fr" onChange={() => {}} onSetCover={() => {}} coverId="img2" />)
    expect(screen.getByRole('button', { name: 'Définir comme couverture' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Retirer la couverture' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls onSetCover with the item image when its cover button is clicked', async () => {
    const onSetCover = vi.fn()
    render(<BlockEditor blocks={galleryBlocks} lang="fr" onChange={() => {}} onSetCover={onSetCover} coverId={null} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Définir comme couverture' })[0])
    expect(onSetCover).toHaveBeenCalledWith({ _id: 'img1' })
  })

  it('calls onSetCover with null when the current cover button is clicked, clearing the cover', async () => {
    const onSetCover = vi.fn()
    render(<BlockEditor blocks={galleryBlocks} lang="fr" onChange={() => {}} onSetCover={onSetCover} coverId="img2" />)
    await userEvent.click(screen.getByRole('button', { name: 'Retirer la couverture' }))
    expect(onSetCover).toHaveBeenCalledWith(null)
  })

  it("reflects each item's hidden state in its own eye button", () => {
    render(<BlockEditor blocks={galleryBlocks} lang="fr" onChange={() => {}} onSetCover={() => {}} coverId={null} />)
    expect(screen.getByRole('button', { name: 'Masquer de la grille' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Afficher dans la grille' })).toHaveAttribute('aria-pressed', 'true')
  })

  it("toggles an item's hidden flag via onChange, leaving the rest of the item untouched", async () => {
    const onChange = vi.fn()
    render(<BlockEditor blocks={galleryBlocks} lang="fr" onChange={onChange} onSetCover={() => {}} coverId={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Masquer de la grille' }))
    expect(onChange).toHaveBeenLastCalledWith([
      {
        ...galleryBlocks[0],
        items: [{ ...galleryBlocks[0].items[0], hidden: true }, galleryBlocks[0].items[1]],
      },
    ])
  })

  it('does not render the cover button when onSetCover is not provided (e.g. PageEditor)', () => {
    render(<BlockEditor blocks={galleryBlocks} lang="fr" onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /couverture/i })).not.toBeInTheDocument()
    // Hidden and width stay available even without a cover concept.
    expect(screen.getAllByRole('button', { name: /masquer|afficher/i })).toHaveLength(2)
  })

  it("cycles an item's width (span) on click, wrapping back to 1 past the column count", async () => {
    const onChange = vi.fn()
    render(<BlockEditor blocks={galleryBlocks} lang="fr" onChange={onChange} />)
    const widthButtons = screen.getAllByRole('button', { name: /largeur/i })
    expect(widthButtons[0]).toHaveAttribute('aria-label', 'Largeur : 1 colonne')

    await userEvent.click(widthButtons[0])
    expect(onChange).toHaveBeenLastCalledWith([
      { ...galleryBlocks[0], items: [{ ...galleryBlocks[0].items[0], span: 2 }, galleryBlocks[0].items[1]] },
    ])
  })

  it('clamps a span wider than the column count instead of offering it', () => {
    const wideSpan = [{ type: 'gallery', columns: 2, items: [{ image: { _id: 'img1' }, span: 5 }] }]
    render(<BlockEditor blocks={wideSpan} lang="fr" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /largeur/i })).toHaveAttribute('aria-label', 'Largeur : 2 colonnes')
  })

  it('removes an item via its trash button', async () => {
    const onChange = vi.fn()
    render(<BlockEditor blocks={galleryBlocks} lang="fr" onChange={onChange} />)
    await userEvent.click(screen.getAllByRole('button', { name: /retirer/i })[0])
    expect(onChange).toHaveBeenLastCalledWith([{ ...galleryBlocks[0], items: [galleryBlocks[0].items[1]] }])
  })

  it('renders an empty "+" tile as the last cell to add an image, opening the library', async () => {
    render(<BlockEditor blocks={galleryBlocks} lang="fr" onChange={() => {}} />)
    const addTile = screen.getByRole('button', { name: 'Ajouter une image' })
    expect(addTile.closest('.gallery-editor-add')).toBeInTheDocument()
    await userEvent.click(addTile)
    expect(screen.getByRole('button', { name: 'Fermer la médiathèque' })).toBeInTheDocument()
  })

  // Client feedback (task 27, item 5): out of the block body and into the
  // header, beside the move arrows.
  it('puts the column-count select in the block header, beside the move arrows', () => {
    const { container } = render(<BlockEditor blocks={galleryBlocks} lang="fr" onChange={() => {}} />)
    const legend = container.querySelector('.block-editor-legend')
    const columnsControl = legend.querySelector('.gallery-columns-control')
    expect(columnsControl).toBeInTheDocument()
    expect(container.querySelector('.gallery-columns')).not.toBeInTheDocument()
  })

  // Task 30, part 4: a gallery block gets a display mode, toggled beside the
  // column count in the block header.
  describe('gallery mode toggle', () => {
    it('shows a mode select beside the column count, defaulting to grid', () => {
      render(<BlockEditor blocks={galleryBlocks} lang="fr" onChange={() => {}} />)
      expect(screen.getByLabelText("Mode d'affichage")).toHaveValue('grid')
      expect(screen.getByLabelText('Colonnes')).toBeInTheDocument()
    })

    it('hides the column-count select once the block is in slider mode, since it does nothing there', () => {
      const sliderBlocks = [{ ...galleryBlocks[0], mode: 'slider' }]
      render(<BlockEditor blocks={sliderBlocks} lang="fr" onChange={() => {}} />)
      expect(screen.getByLabelText("Mode d'affichage")).toHaveValue('slider')
      expect(screen.queryByLabelText('Colonnes')).not.toBeInTheDocument()
    })

    it('switches a gallery block to slider mode via the select', async () => {
      const onChange = vi.fn()
      render(<BlockEditor blocks={galleryBlocks} lang="fr" onChange={onChange} />)
      await userEvent.selectOptions(screen.getByLabelText("Mode d'affichage"), 'slider')
      expect(onChange).toHaveBeenLastCalledWith([{ ...galleryBlocks[0], mode: 'slider' }])
    })
  })
})
