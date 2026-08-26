import { describe, it, expect } from 'vitest'
import { stripDimensions } from '../stripDimensions.js'

describe('stripDimensions', () => {
  // The two the client gave.
  it('drops a trailing size, and the comma that introduced it', () => {
    expect(stripDimensions('Antenne satellite - 1998, Elément n°1, Ø 120 cm'))
      .toBe('Antenne satellite - 1998, Elément n°1')
    expect(stripDimensions("Verso n°27, Mains et Gants, par Yves Tanguy, collection du musée du musée d'art moderne de Saint Etienne - 2009, 104 x 83 cm"))
      .toBe("Verso n°27, Mains et Gants, par Yves Tanguy, collection du musée du musée d'art moderne de Saint Etienne - 2009")
  })

  // The element number is content, not a measurement -- it identifies which
  // of a set this photograph is, and cutting at the last separator loses it.
  it('keeps an element number attached to its size by a dash', () => {
    expect(stripDimensions('Chariots de composition, Le Paradis perdu, Milton, Imprimerie nationale, Paris - 2000, Elément n°1 - 100 x 50 cm'))
      .toBe('Chariots de composition, Le Paradis perdu, Milton, Imprimerie nationale, Paris - 2000, Elément n°1')
  })

  it('keeps a technique note that follows the size', () => {
    expect(stripDimensions('Cuvette de développement n°1, laboratoire La Chambre noire, Paris - 2001, 97 x 84 cm - Photogramme'))
      .toBe('Cuvette de développement n°1, laboratoire La Chambre noire, Paris - 2001 - Photogramme')
  })

  // "chaque élément" only exists to qualify the measurement, so it goes with
  // it -- but "Diptyque" describes the work and stays.
  it('keeps the work description but drops the size’s own qualifier', () => {
    expect(stripDimensions('Antennes satellite - 1998, Diptyque, chaque élément Ø 120 cm'))
      .toBe('Antennes satellite - 1998, Diptyque')
  })

  it('drops a parenthetical that is itself a measurement', () => {
    expect(stripDimensions('Tas de fumier, Ury - 2000, 60 x 80 cm (image hors dispositif 10,5 x 16 cm)'))
      .toBe('Tas de fumier, Ury - 2000')
  })

  it('drops an imperial conversion along with the metric size', () => {
    expect(stripDimensions('Châssis-Presse n°2 - 2018, 36 x 41 cm / 14,2 x 16,1 in.'))
      .toBe('Châssis-Presse n°2 - 2018')
  })

  it('drops a framed-size pair entirely, introducers and all', () => {
    expect(stripDimensions("Grattoir, boite d'allumettes n° 1, 2007, Image 3,5 x 7 cm / Encadré 19 x 30 cm"))
      .toBe("Grattoir, boite d'allumettes n° 1, 2007")
  })

  it('handles a decimal comma inside the numbers', () => {
    expect(stripDimensions('Martyr 3, 55,5 x 70,5 cm')).toBe('Martyr 3')
    expect(stripDimensions('Cuvette de développement n°3, Paris - 2016, 81 x 65,5 cm'))
      .toBe('Cuvette de développement n°3, Paris - 2016')
  })

  /*
    The bug the first sweep over the real library shipped with. French uses a
    decimal comma, so "22,4 x 27,5 in." contains a comma indistinguishable
    from the one that introduces a measurement -- the matcher started at the
    "4", removed ",4 x 27,5 in.", and left the legend ending "... : / 22".
    Both Diptyque spellings must now land on the same result.
  */
  it('does not mistake a decimal comma for a separator', () => {
    expect(stripDimensions('Grand Châssis-Presse Part 1 - 2020, Diptyque chaque élément : 57 x 70 cm / 22,4 x 27,5 in.'))
      .toBe('Grand Châssis-Presse Part 1 - 2020, Diptyque')
    expect(stripDimensions('Antennes satellite - 1998, Diptyque, chaque élément Ø 120 cm'))
      .toBe('Antennes satellite - 1998, Diptyque')
  })

  // A colon belongs to the measurement it introduces, not to the sentence.
  it('swallows a colon that introduces the size', () => {
    expect(stripDimensions('X, chaque élément : 57 x 70 cm')).toBe('X')
  })

  it('handles the “Dimension :” spelling', () => {
    expect(stripDimensions('Verso n°3, Etude pour chevaux, collection particulière, Paris - 2005, Dimension : 55 x 65 cm'))
      .toBe('Verso n°3, Etude pour chevaux, collection particulière, Paris - 2005')
  })

  it('keeps an “ensemble” description while dropping its size', () => {
    expect(stripDimensions('Ensemble de cinq éléments - 42 x 36 cm')).toBe('Ensemble de cinq éléments')
  })

  // A legend with no measurement must come back byte-identical, or this
  // migration would quietly rewrite 229 legends it has no business touching.
  it('leaves a legend with no measurement exactly as it was', () => {
    const untouched = 'Portrait, Anonyme, collection particulière, Malakoff - 2005'
    expect(stripDimensions(untouched)).toBe(untouched)
    expect(stripDimensions('Philippe Gronon, plaque n°51')).toBe('Philippe Gronon, plaque n°51')
  })

  // A year is not a size: "2009" must never be mistaken for a measurement.
  it('never touches a bare year', () => {
    expect(stripDimensions('Scialytique n°2, Hopital Saint Louis, Paris, 2013')).toBe('Scialytique n°2, Hopital Saint Louis, Paris, 2013')
  })

  it('survives empty and missing input', () => {
    expect(stripDimensions('')).toBe('')
    expect(stripDimensions(null)).toBe('')
    expect(stripDimensions(undefined)).toBe('')
  })
})
