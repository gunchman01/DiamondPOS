/**
 * Minimal XML reader/writer for the QuickBooks Web Connector (SOAP) and qbXML.
 * Both are simple, well-formed XML, so a small parser is enough and avoids
 * another dependency.
 */

export interface XmlNode {
  name: string // local name (namespace prefix removed)
  attrs: Record<string, string>
  children: XmlNode[]
  text: string // text directly inside this element (entities decoded)
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e] ?? m
  })
}

/** Escape text for use inside an XML element or attribute */
export function esc(s: string | number): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const localName = (n: string) => (n.includes(':') ? n.slice(n.indexOf(':') + 1) : n)

/** Parse an XML document and return its root element. Throws on badly formed input. */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: '#document', attrs: {}, children: [], text: '' }
  const stack: XmlNode[] = [root]
  let i = 0
  const n = xml.length
  while (i < n) {
    const lt = xml.indexOf('<', i)
    if (lt === -1) {
      stack[stack.length - 1].text += decodeEntities(xml.slice(i))
      break
    }
    if (lt > i) stack[stack.length - 1].text += decodeEntities(xml.slice(i, lt))
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt)
      if (end === -1) throw new Error('Unclosed processing instruction')
      i = end + 2
    } else if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt)
      if (end === -1) throw new Error('Unclosed comment')
      i = end + 3
    } else if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt)
      if (end === -1) throw new Error('Unclosed CDATA')
      stack[stack.length - 1].text += xml.slice(lt + 9, end)
      i = end + 3
    } else if (xml.startsWith('<!', lt)) {
      const end = xml.indexOf('>', lt)
      i = end === -1 ? n : end + 1
    } else if (xml[lt + 1] === '/') {
      const end = xml.indexOf('>', lt)
      if (end === -1) throw new Error('Unclosed end tag')
      const name = localName(xml.slice(lt + 2, end).trim())
      const node = stack.pop()
      if (!node || node.name !== name) throw new Error(`Mismatched </${name}>`)
      i = end + 1
    } else {
      // start tag: find its end, respecting quoted attribute values
      let j = lt + 1
      let quote = ''
      while (j < n) {
        const c = xml[j]
        if (quote) {
          if (c === quote) quote = ''
        } else if (c === '"' || c === "'") quote = c
        else if (c === '>') break
        j++
      }
      if (j >= n) throw new Error('Unclosed start tag')
      let inner = xml.slice(lt + 1, j)
      const selfClosing = inner.endsWith('/')
      if (selfClosing) inner = inner.slice(0, -1)
      const m = inner.match(/^\s*([^\s/>]+)/)
      if (!m) throw new Error('Bad start tag')
      const node: XmlNode = { name: localName(m[1]), attrs: {}, children: [], text: '' }
      const attrRe = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g
      let a: RegExpExecArray | null
      const rest = inner.slice(m[0].length)
      while ((a = attrRe.exec(rest))) node.attrs[localName(a[1])] = decodeEntities(a[3] ?? a[4] ?? '')
      stack[stack.length - 1].children.push(node)
      if (!selfClosing) stack.push(node)
      i = j + 1
    }
  }
  if (stack.length !== 1) throw new Error(`Unclosed <${stack[stack.length - 1].name}>`)
  const top = root.children[0]
  if (!top) throw new Error('Empty XML document')
  return top
}

/** First child with this name */
export function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((c) => c.name === name)
}

/** All children with this name */
export function childrenNamed(node: XmlNode | undefined, name: string): XmlNode[] {
  return node?.children.filter((c) => c.name === name) ?? []
}

/** Text of a nested path, e.g. text(node, 'ParentRef', 'FullName') */
export function text(node: XmlNode | undefined, ...path: string[]): string {
  let cur = node
  for (const p of path) cur = child(cur, p)
  return cur ? cur.text.trim() : ''
}

/** Depth-first search for the first element with this name */
export function find(node: XmlNode | undefined, name: string): XmlNode | undefined {
  if (!node) return undefined
  if (node.name === name) return node
  for (const c of node.children) {
    const f = find(c, name)
    if (f) return f
  }
  return undefined
}
