import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
