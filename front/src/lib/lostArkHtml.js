// emoticon_sign_greenDot -> class "greenDot" is confirmed from the live
// game-tooltip-item DOM; the rest are best-effort text-glyph stand-ins.
const emoticonSpanClasses = {
  emoticon_sign_greenDot: 'greenDot',
}
const emoticonGlyphs = {
  emoticon_tooltip_bracelet_locked: '🔒 ',
  emoticon_tooltip_bracelet_changeable: '◆ ',
  emoticon_tooltip_ability_stone_symbol: '● ',
}

function parseAttrs(attrString = '') {
  const attrs = {}
  const re = /([\w-]+)\s*=\s*(['"])(.*?)\2/g
  let match
  while ((match = re.exec(attrString))) attrs[match[1].toLowerCase()] = match[3]
  return attrs
}

// Converts Lost Ark's tooltip pseudo-HTML into safe, renderable HTML.
// <FONT color/size> is kept as a real (if obsolete) <font> tag rather than
// converted to inline styles — the live site does the same, then sizes it
// via CSS attribute selectors like `font[size="12"]`, which lets context
// (e.g. .leftStr0 font[size="12"]) override the base size. Color already
// renders natively through the browser's legacy color-attribute parsing.
// Everything else not explicitly whitelisted is stripped.
export function toSafeHtml(raw) {
  if (typeof raw !== 'string' || !raw) return ''
  let html = raw

  html = html.replace(/<img\s+([^>]*)>/gi, (_, attrs) => {
    const { src = '' } = parseAttrs(attrs)
    if (emoticonSpanClasses[src]) return `<span class="${emoticonSpanClasses[src]}"></span>`
    return emoticonGlyphs[src] || ''
  })
  html = html.replace(/<\/img>/gi, '')

  html = html.replace(/<(?!\/?(span|br|p|b|i|font)\b)[^>]*>/gi, '')
  return html
}
