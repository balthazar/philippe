import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocalizedInput } from '../LocalizedInput.jsx'

describe('LocalizedInput', () => {
  it('edits the French base directly', async () => {
    const onChange = vi.fn()
    render(<LocalizedInput label="Titre" lang="fr" value={{ fr: 'Porte', en: '' }} onChange={onChange} />)
    expect(screen.getByLabelText('Titre')).toHaveValue('Porte')
    await userEvent.type(screen.getByLabelText('Titre'), '!')
    expect(onChange).toHaveBeenLastCalledWith({ fr: 'Porte!', en: '' })
  })

  it('shows the French value as placeholder when editing English with no override', () => {
    render(<LocalizedInput label="Titre" lang="en" value={{ fr: 'Porte', en: '' }} onChange={() => {}} />)
    const input = screen.getByLabelText('Titre')
    expect(input).toHaveValue('')
    expect(input).toHaveAttribute('placeholder', 'Porte')
  })

  it('marks the field as overridden once English differs', () => {
    render(<LocalizedInput label="Titre" lang="en" value={{ fr: 'Porte', en: 'Door' }} onChange={() => {}} />)
    expect(screen.getByLabelText('Titre')).toHaveValue('Door')
    expect(screen.getByRole('button', { name: /français/i })).toBeInTheDocument()
  })

  it('clears the English override when reverting', async () => {
    const onChange = vi.fn()
    render(<LocalizedInput label="Titre" lang="en" value={{ fr: 'Porte', en: 'Door' }} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /français/i }))
    expect(onChange).toHaveBeenCalledWith({ fr: 'Porte', en: '' })
  })

  it('offers no revert control while editing French', () => {
    render(<LocalizedInput label="Titre" lang="fr" value={{ fr: 'Porte', en: 'Door' }} onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /français/i })).not.toBeInTheDocument()
  })
})
