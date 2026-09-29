import { describe, it, expect } from 'vitest'
import {
  rawToHtml,
  htmlToRaw,
  htmlToRawSingleLine,
  insertVariablePill,
} from './variableUtils'

// ── rawToHtml ─────────────────────────────────────────────────────────────────

describe('rawToHtml – bare mode (default)', () => {
  it('wraps a known variable in a var-pill span', () => {
    const result = rawToHtml('Hi {{Name}}', ['Name'])
    expect(result).toContain('class="var-pill"')
    expect(result).toContain('data-var="Name"')
    // pill text is just the name, no braces
    expect(result).toContain('>Name<')
    // original token is gone
    expect(result).not.toMatch(/\{\{Name\}\}/)
  })

  it('preserves surrounding literal text', () => {
    const result = rawToHtml('Hello {{Name}}, welcome!', ['Name'])
    expect(result).toContain('Hello ')
    expect(result).toContain(', welcome!')
    expect(result).toContain('data-var="Name"')
  })

  it('leaves an unknown {{X}} as escaped literal, no pill', () => {
    const result = rawToHtml('{{X}}', [])
    expect(result).not.toContain('var-pill')
    expect(result).not.toContain('<span')
    // still present as plain text (no HTML chars to escape in {{X}})
    expect(result).toContain('{{X}}')
  })

  it('HTML-escapes XSS in literal text', () => {
    const result = rawToHtml('<script>alert(1)</script>', [])
    expect(result).not.toContain('<script>')
    expect(result).toContain('&lt;script&gt;')
    expect(result).toContain('&lt;/script&gt;')
  })

  it('HTML-escapes & in literal text', () => {
    const result = rawToHtml('Tom & Jerry', [])
    expect(result).toContain('Tom &amp; Jerry')
  })
})

describe('rawToHtml – dotted mode', () => {
  it('with dotted:true, parses {{.Name}} and emits the same var-pill span', () => {
    const result = rawToHtml('Hi {{.Name}}', ['Name'], { dotted: true })
    expect(result).toContain('class="var-pill"')
    expect(result).toContain('data-var="Name"')
    expect(result).toContain('>Name<')
    expect(result).not.toMatch(/\{\{\.Name\}\}/)
  })

  it('dotted mode does NOT match bare {{Name}} tokens', () => {
    const result = rawToHtml('Hi {{Name}}', ['Name'], { dotted: true })
    // bare token not matched — treated as literal (unescaped since no special chars)
    expect(result).not.toContain('var-pill')
    expect(result).toContain('{{Name}}')
  })
})

// ── htmlToRaw ─────────────────────────────────────────────────────────────────

describe('htmlToRaw – round-trip', () => {
  it('bare round-trip: htmlToRaw(rawToHtml(x, vars)) === x', () => {
    const input = 'Hi {{Name}}, welcome!'
    const html = rawToHtml(input, ['Name'])
    expect(htmlToRaw(html)).toBe(input)
  })

  it('dotted round-trip: htmlToRaw(rawToHtml(x, vars, {dotted}), {dotted}) === x', () => {
    const input = 'Subject: {{.Title}} update'
    const html = rawToHtml(input, ['Title'], { dotted: true })
    expect(htmlToRaw(html, { dotted: true })).toBe(input)
  })

  it('preserves non-pill HTML markup', () => {
    const html = '<b>Hello</b> <span class="var-pill" data-var="Name">Name</span>'
    expect(htmlToRaw(html)).toBe('<b>Hello</b> {{Name}}')
  })
})

// ── htmlToRawSingleLine ───────────────────────────────────────────────────────

describe('htmlToRawSingleLine', () => {
  it('converts pills to bare tokens and strips all other HTML', () => {
    const html = '<b>Hello</b> <span class="var-pill" data-var="Name">Name</span>'
    const result = htmlToRawSingleLine(html)
    expect(result).toBe('Hello {{Name}}')
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
  })

  it('uses dotted token form when dotted:true', () => {
    const html = '<span class="var-pill" data-var="Title">Title</span>'
    expect(htmlToRawSingleLine(html, { dotted: true })).toBe('{{.Title}}')
  })

  it('collapses br tags and trims whitespace', () => {
    const html = '  Hello<br/><span class="var-pill" data-var="Name">Name</span>  '
    const result = htmlToRawSingleLine(html)
    expect(result).not.toContain('<br')
    expect(result).toBe('Hello{{Name}}')
  })

  it('unescapes HTML entities in literal text', () => {
    expect(htmlToRawSingleLine('Tom &amp; Jerry')).toBe('Tom & Jerry')
  })

  it('round-trips text containing & through subject/preheader', () => {
    const input = 'Order & payment for {{.Name}}'
    const html = rawToHtml(input, ['Name'], { dotted: true })
    expect(htmlToRawSingleLine(html, { dotted: true })).toBe(input)
  })
})

// ── insertVariablePill ────────────────────────────────────────────────────────

describe('insertVariablePill', () => {
  it('returns false when no DOM selection is present (jsdom has no active range)', () => {
    // In jsdom there is no focused contentEditable with an active range,
    // so the function must return false without throwing.
    expect(() => insertVariablePill('Name')).not.toThrow()
    expect(insertVariablePill('Name')).toBe(false)
  })
})
