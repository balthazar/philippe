import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as api from '@/api.js'
import { ImageLegend } from '../ImageLegend.jsx'

const image = { _id: 'i1', alt: { fr: 'Verso n°27', en: 'Verso no. 27' } }
const field = () => screen.getByRole('textbox')

beforeEach(() => vi.restoreAllMocks())

describe('ImageLegend', () => {
  it('shows the current language’s legend', () => {
    render(<ImageLegend image={image} lang="fr" />)
    expect(field()).toHaveValue('Verso n°27')
  })

  it('saves on blur, and only the edited language changes', async () => {
    const send = vi.spyOn(api, 'apiSend').mockResolvedValue({ ...image, alt: { fr: 'Verso n°28', en: 'Verso no. 27' } })
    render(<ImageLegend image={image} lang="fr" />)
    await userEvent.clear(field())
    await userEvent.type(field(), 'Verso n°28')
    await userEvent.tab()

    // The whole alt is sent, because PATCH overwrites it wholesale -- sending
    // only `fr` would blank the English legend.
    await waitFor(() => expect(send).toHaveBeenCalledWith('PATCH', '/admin/images/i1', {
      alt: { fr: 'Verso n°28', en: 'Verso no. 27' },
    }))
  })

  // A PATCH per keystroke would be several hundred writes for one sentence.
  it('does not save while typing', async () => {
    const send = vi.spyOn(api, 'apiSend').mockResolvedValue(image)
    render(<ImageLegend image={image} lang="fr" />)
    await userEvent.type(field(), ' bis')
    expect(send).not.toHaveBeenCalled()
  })

  it('saves nothing when the text was not changed', async () => {
    const send = vi.spyOn(api, 'apiSend').mockResolvedValue(image)
    render(<ImageLegend image={image} lang="fr" />)
    await userEvent.click(field())
    await userEvent.tab()
    expect(send).not.toHaveBeenCalled()
  })

  it('confirms the save', async () => {
    vi.spyOn(api, 'apiSend').mockResolvedValue(image)
    render(<ImageLegend image={image} lang="fr" />)
    await userEvent.type(field(), '!')
    await userEvent.tab()
    expect(await screen.findByText('enregistré')).toBeInTheDocument()
  })

  it('reports a failed save instead of pretending it worked', async () => {
    vi.spyOn(api, 'apiSend').mockRejectedValue(Object.assign(new Error('x'), { status: 500 }))
    render(<ImageLegend image={image} lang="fr" />)
    await userEvent.type(field(), '!')
    await userEvent.tab()
    expect(await screen.findByText('échec')).toBeInTheDocument()
  })

  it('abandons the edit on Escape', async () => {
    const send = vi.spyOn(api, 'apiSend').mockResolvedValue(image)
    render(<ImageLegend image={image} lang="fr" />)
    await userEvent.type(field(), ' bis')
    await userEvent.keyboard('{Escape}')
    expect(field()).toHaveValue('Verso n°27')
    await userEvent.tab()
    expect(send).not.toHaveBeenCalled()
  })

  it('saves on Enter without needing a blur', async () => {
    const send = vi.spyOn(api, 'apiSend').mockResolvedValue(image)
    render(<ImageLegend image={image} lang="fr" />)
    await userEvent.type(field(), '!')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(send).toHaveBeenCalled())
  })

  // Reordering a gallery hands this same component a different image; the
  // field must follow it rather than keep the previous tile's text.
  it('follows the image when the tile is given a different one', () => {
    const { rerender } = render(<ImageLegend image={image} lang="fr" />)
    rerender(<ImageLegend image={{ _id: 'i2', alt: { fr: 'Martyr 3', en: '' } }} lang="fr" />)
    expect(field()).toHaveValue('Martyr 3')
  })

  it('switches to the English legend with the language', () => {
    const { rerender } = render(<ImageLegend image={image} lang="fr" />)
    rerender(<ImageLegend image={image} lang="en" />)
    expect(field()).toHaveValue('Verso no. 27')
  })

  it('falls back to an empty field, showing the French as a placeholder', () => {
    render(<ImageLegend image={{ _id: 'i3', alt: { fr: 'Porte', en: '' } }} lang="en" />)
    expect(field()).toHaveValue('')
    expect(field()).toHaveAttribute('placeholder', 'Porte')
  })
})
