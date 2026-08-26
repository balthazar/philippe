/**
 * Removes the physical dimensions from a photograph's legend, leaving
 * everything that is not a measurement.
 *
 * The archive's legends were written as a single sentence ending in the
 * print's size: "Verso n°27, Mains et Gants, par Yves Tanguy, collection du
 * musée d'art moderne de Saint Etienne - 2009, 104 x 83 cm". The size is
 * being dropped from the public legend, so this strips it wherever it sits.
 *
 * It cannot be "cut at the last comma": across 315 real legends the
 * measurement turns up in eight shapes, and several of them carry content
 * that has to survive.
 *
 *   "..., Elément n°1 - 100 x 50 cm"          -> keeps "Elément n°1"
 *   "..., Diptyque, chaque élément Ø 120 cm"  -> keeps "Diptyque"
 *   "..., 97 x 84 cm - Photogramme"           -> keeps "Photogramme"
 *   "..., 60 x 80 cm (image hors dispositif 10,5 x 16 cm)"  -> both go
 *   "..., Image 3,5 x 7 cm / Encadré 19 x 30 cm"            -> all of it goes
 *   "..., 36 x 41 cm / 14,2 x 16,1 in."                     -> all of it goes
 *
 * So: drop any parenthetical that is itself a measurement, then drop each
 * measurement together with the words that only exist to introduce it
 * ("Image", "Encadré", "chaque élément", "Dimension :"), then repair the
 * punctuation left behind.
 */

// 12 / 12,5 / 12.5
const NUM = String.raw`\d+(?:[.,]\d+)?`
// The same, but forbidden from starting inside another number. French
// legends use a decimal comma, so "22,4 x 27,5 in." contains a comma that
// looks exactly like the separator introducing a measurement -- without this
// guard the matcher started at the "4" and left "/ 22" behind in the legend.
const FIRST_NUM = String.raw`(?<![\d.,])\d+(?:[.,]\d+)?`
// 104 x 83 cm, 30 × 40 × 5 cm, 14,2 x 16,1 in.
const PRODUCT = String.raw`${FIRST_NUM}(?:\s*[x×X]\s*${NUM}){1,2}\s*(?:cm|mm|m|in\b\.?)`
// Ø 120 cm
const DIAMETER = String.raw`Ø\s*${NUM}\s*(?:cm|mm|m)`
const MEASURE = String.raw`(?:${PRODUCT}|${DIAMETER})`

// Words that exist only to introduce a measurement, so they go with it.
// Each may be followed by a colon ("Diptyque chaque élément : 57 x 70 cm"),
// which belongs to the measurement, not to the sentence before it.
const LEAD = String.raw`(?:(?:dimensions?|dim\.|encadr[ée]{1,2}|image(?=\s*${NUM})|hors\s+dispositif|vue\s+avec\s+le\s+dispositif\s+d['’]encadrement|chaque\s+[ée]l[ée]ment)\s*:?\s*)`

// One measurement, any introducers before it, and any "/ 19 x 30 cm" or
// "/ 14,2 x 16,1 in." continuation after it.
const RUN = String.raw`${LEAD}*${MEASURE}(?:\s*[/-]\s*${LEAD}*${MEASURE})*`

const re = (body, flags = 'gi') => new RegExp(body, flags)

export function stripDimensions(text) {
  let out = String(text || '')

  // A parenthetical holding a measurement is a measurement note in full
  // ("(image hors dispositif 10,5 x 16 cm)"), so the brackets go too --
  // stripping only the numbers inside would leave "(image hors dispositif)".
  out = out.replace(re(String.raw`\s*\([^()]*${MEASURE}[^()]*\)`), '')

  // The measurement itself, with whatever separator introduced it. The
  // separator is consumed so "- 2000, Elément n°1 - 100 x 50 cm" does not
  // become "- 2000, Elément n°1 -".
  out = out.replace(re(String.raw`\s*[,;]?\s*[-–]\s*${RUN}`), '')
  out = out.replace(re(String.raw`\s*[,;]\s*${RUN}`), '')
  out = out.replace(re(RUN), '')

  return tidyPunctuation(out)
}

/**
 * Repairs what removal leaves behind: a doubled separator where a
 * measurement sat between two kept parts, and any dangling separator at
 * either end.
 */
function tidyPunctuation(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*(?=[,;])/g, '')          // ", ," -> ","
    .replace(/,\s*-\s*/g, ' - ')              // ", - Photogramme" -> " - Photogramme"
    .replace(/\(\s*\)/g, '')                  // an emptied bracket
    .replace(/\s*([,;])\s*/g, '$1 ')
    .replace(/[\s,;:.\-–]+$/g, '')            // dangling separator at the end
    .replace(/^[\s,;:\-–]+/g, '')
    .trim()
}
