import { describe, it, expect, vi, onTestFinished } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { $getHtmlContent, $getLexicalContent } from '@lexical/clipboard'
import { TaskRichTextView } from '../exercises/TaskRichTextView'
import { createEditor, $createNodeSelection, $createParagraphNode, $createRangeSelection, $createTextNode, $getRoot, $getSelection, $isRangeSelection, $setSelection } from 'lexical'
import {
  RichTextEditor,
  CopyBlockNode,
  $createCopyBlockNode,
  $normalizeCopyBlock,
  VariableNode,
  $createVariableNode,
  $isVariableNode,
  replaceVariableQueryWithNode,
  insertVariableAtSavedSelection,
  $toggleSelectedVariableFormat,
} from './RichTextEditor'

// Lexical + jsdom: smoke / structural tests only.
// Full editor interactions (typing, selection, typeahead) require a real browser.
//
// jsdom limitation: LexicalNode constructor calls $setNodeKey which requires an
// active editor context. Tests that directly instantiate nodes must use
// createEditor() + editor.update() to provide that context.

describe('RichTextEditor', () => {
  it('mounts without throwing given null state', () => {
    const onChange = vi.fn()
    expect(() => render(<RichTextEditor value={null} onChange={onChange} />)).not.toThrow()
  })

  it('renders a contenteditable element', () => {
    const onChange = vi.fn()
    render(<RichTextEditor value={null} onChange={onChange} />)
    expect(document.querySelector('[contenteditable]')).toBeInTheDocument()
  })

  it('toolbar buttons render when editor is active (not disabled)', () => {
    const onChange = vi.fn()
    render(<RichTextEditor value={null} onChange={onChange} />)
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('does not render toolbar when disabled=true', () => {
    const onChange = vi.fn()
    const { container } = render(
      <RichTextEditor value={null} onChange={onChange} disabled />
    )
    expect(container.querySelectorAll('button').length).toBe(0)
  })

  it('onChange callback is accepted without throwing', () => {
    const onChange = vi.fn()
    expect(() =>
      render(<RichTextEditor value={null} onChange={onChange} />)
    ).not.toThrow()
  })

  it('accepts variables prop without throwing', () => {
    const onChange = vi.fn()
    expect(() =>
      render(
        <RichTextEditor
          value={null}
          onChange={onChange}
          variables={[{ name: 'Name', description: 'User name' }]}
        />
      )
    ).not.toThrow()
  })

  it('accepts a placeholder prop without throwing', () => {
    const onChange = vi.fn()
    expect(() =>
      render(
        <RichTextEditor
          value={null}
          onChange={onChange}
          placeholder="Start typing…"
        />
      )
    ).not.toThrow()
  })

  it('does not clip toolbar tooltips or dropdowns at the editor border', () => {
    const { container } = render(<RichTextEditor value={null} onChange={vi.fn()} />)
    const editor = container.firstElementChild
    expect(editor).not.toHaveClass('overflow-hidden')
    expect(editor).toHaveClass('overflow-visible')
  })

  it('keeps the same editable element when its parent rerenders while typing', () => {
    const onChange = vi.fn()
    const { rerender, container } = render(<RichTextEditor value={null} onChange={onChange} />)
    const editable = container.querySelector('[contenteditable]')
    rerender(<RichTextEditor value={{ root: { children: [] } }} onChange={onChange} />)
    expect(container.querySelector('[contenteditable]')).toBe(editable)
  })

  it('shows an illustrative value for a known inline token and a warning for a removed one', async () => {
    const editor = createEditor({ nodes: [VariableNode] })
    editor.update(() => {
      const paragraph = $createParagraphNode()
      paragraph.append($createVariableNode('ph_known'), $createTextNode(' then '), $createVariableNode('ph_removed'))
      $getRoot().append(paragraph)
    }, { discrete: true })
    render(<RichTextEditor value={editor.getEditorState().toJSON() as unknown as Record<string, unknown>}
      onChange={vi.fn()} variables={[{ name: 'ph_known', description: 'IP address', example: '10.0.0.5' }]} />)
    await waitFor(() => expect(screen.getByText('10.0.0.5')).toBeInTheDocument())
    expect(screen.getByText('джерело недоступне')).toBeInTheDocument()
    expect(screen.queryByText(/ph_removed/)).not.toBeInTheDocument()
  })

  it('uses a human-readable unavailable source label when the device still exists', async () => {
    const editor = createEditor({ nodes: [VariableNode] })
    editor.update(() => {
      const paragraph = $createParagraphNode()
      paragraph.append($createVariableNode('ph_source'))
      $getRoot().append(paragraph)
    }, { discrete: true })
    render(<RichTextEditor value={editor.getEditorState().toJSON() as unknown as Record<string, unknown>}
      onChange={vi.fn()} variables={[]} unavailableLabels={{ ph_source: 'Віртуальна машина «web» — джерело недоступне' }} />)
    expect(await screen.findByText('Віртуальна машина «web» — джерело недоступне')).toBeInTheDocument()
    expect(screen.queryByText(/ph_source/)).not.toBeInTheDocument()
  })

  it('opens the searchable variable picker and closes it with Escape', () => {
    render(<RichTextEditor value={null} onChange={vi.fn()} variables={[
      { name: 'event_name', description: 'Event name', example: 'CyberICEBox CTF' },
      { name: 'user_email', description: 'Recipient email' },
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Вставити змінну' }))
    const search = screen.getByRole('searchbox', { name: 'Знайти змінну' })
    expect(search).toHaveFocus()
    expect(screen.getByText('event_name', { selector: 'code' })).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'email' } })
    expect(screen.queryByText('event_name', { selector: 'code' })).not.toBeInTheDocument()
    expect(screen.getByText('user_email', { selector: 'code' })).toBeInTheDocument()
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('inserts the picked variable as a variable node at the editor selection', async () => {
    const onChange = vi.fn()
    const { container } = render(<RichTextEditor value={null} onChange={onChange} variables={[
      { name: 'event_name', description: 'Event name' },
    ]} />)
    const editable = container.querySelector('[contenteditable]') as HTMLElement
    editable.focus()
    const paragraph = await waitFor(() => { const p = editable.querySelector('p'); expect(p).not.toBeNull(); return p! })
    const range = document.createRange()
    range.setStart(paragraph, 0)
    range.collapse(true)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    fireEvent(document, new Event('selectionchange'))
    fireEvent.click(screen.getByRole('button', { name: 'Вставити змінну' }))
    fireEvent.click(screen.getByText('event_name', { selector: 'code' }).closest('button')!)
    await waitFor(() => expect(JSON.stringify(onChange.mock.calls.at(-1)?.[0])).toContain('"varName":"event_name"'))
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('opens inline placeholder creation from the task editor without a preconfigured list', () => {
    const request = vi.fn()
    render(<RichTextEditor value={null} onChange={vi.fn()} variables={[]} onInsertVariable={request} />)
    fireEvent.click(screen.getByRole('button', { name: 'Вставити підстановку' }))
    expect(request).toHaveBeenCalledOnce()
    expect(typeof request.mock.calls[0][0]).toBe('function')
    expect(screen.queryByText('Спочатку налаштуйте підстановку нижче.')).not.toBeInTheDocument()
  })

  it('opens inline placeholder creation with keyboard activation', () => {
    const request = vi.fn()
    render(<RichTextEditor value={null} onChange={vi.fn()} variables={[]} onInsertVariable={request} />)
    fireEvent.click(screen.getByRole('button', { name: 'Вставити підстановку' }), { detail: 0 })
    expect(request).toHaveBeenCalledOnce()
  })

  it('opens editing when a rendered placeholder is clicked', async () => {
    const editor = createEditor({ nodes: [VariableNode] })
    editor.update(() => {
      const paragraph = $createParagraphNode()
      paragraph.append($createVariableNode('ph_known'))
      $getRoot().append(paragraph)
    }, { discrete: true })
    const edit = vi.fn()
    render(<RichTextEditor value={editor.getEditorState().toJSON() as unknown as Record<string, unknown>}
      onChange={vi.fn()} variables={[{ name: 'ph_known', description: 'IP', example: '10.0.0.5' }]} onEditVariable={edit} />)
    fireEvent.click(await screen.findByRole('button', { name: /10\.0\.0\.5/ }))
    expect(edit).toHaveBeenCalledWith('ph_known')
  })

  it('renders one visual token shell and applies saved inline styles', async () => {
    const editor = createEditor({ nodes: [VariableNode] })
    editor.update(() => {
      const paragraph = $createParagraphNode()
      paragraph.append($createVariableNode('ph_known', ['bold', 'italic']))
      $getRoot().append(paragraph)
    }, { discrete: true })
    const value = editor.getEditorState().toJSON() as unknown as Record<string, unknown>
    expect(JSON.stringify(value)).toContain('"formats":["bold","italic"]')
    render(<RichTextEditor value={value} onChange={vi.fn()}
      variables={[{ name: 'ph_known', description: 'IP', example: '10.0.0.5' }]} onEditVariable={vi.fn()} />)
    const token = await screen.findByRole('button', { name: /10\.0\.0\.5/ })
    expect(token).toHaveClass('font-bold', 'italic')
    expect(token.parentElement).not.toHaveClass('border')
  })

  it('shows formatted placeholder text cleanly by default and can reveal its editing highlight', async () => {
    const editor = createEditor({ nodes: [VariableNode] })
    editor.update(() => {
      const paragraph = $createParagraphNode()
      paragraph.append($createVariableNode('ph_known', ['bold', 'italic']))
      $getRoot().append(paragraph)
    }, { discrete: true })
    render(<RichTextEditor value={editor.getEditorState().toJSON() as unknown as Record<string, unknown>}
      onChange={vi.fn()} variables={[{ name: 'ph_known', description: 'IP', example: '10.0.0.5' }]}
      onInsertVariable={vi.fn()} onEditVariable={vi.fn()} />)

    const token = await screen.findByRole('button', { name: /10\.0\.0\.5/ })
    expect(token).toHaveClass('font-bold', 'italic')
    expect(token).not.toHaveClass('bg-primary/10')
    expect(token).not.toHaveAttribute('title')
    fireEvent.focus(token)
    expect(token).toHaveAccessibleDescription('IP')
    fireEvent.blur(token)

    const reveal = screen.getByRole('button', { name: 'Показати підстановки' })
    expect(reveal).not.toHaveTextContent('Показати підстановки')
    fireEvent.click(reveal)
    expect(token).toHaveClass('bg-primary/10')
    expect(screen.getByRole('button', { name: 'Чистий вигляд' })).toBeInTheDocument()
  })

  it('does not allow editing a token in a disabled editor', async () => {
    const editor = createEditor({ nodes: [VariableNode] })
    editor.update(() => {
      const paragraph = $createParagraphNode()
      paragraph.append($createVariableNode('ph_known'))
      $getRoot().append(paragraph)
    }, { discrete: true })
    render(<RichTextEditor value={editor.getEditorState().toJSON() as unknown as Record<string, unknown>}
      onChange={vi.fn()} variables={[{ name: 'ph_known', description: 'IP', example: '10.0.0.5' }]}
      onEditVariable={vi.fn()} disabled />)
    await screen.findByText('10.0.0.5')
    expect(screen.queryByRole('button', { name: /10\.0\.0\.5/ })).not.toBeInTheDocument()
  })
})

describe('inline variable insertion', () => {
  it('restores the saved caret after a modal takes focus and preserves surrounding text', async () => {
    const editor = createEditor({ nodes: [VariableNode] })
    let savedSelection: ReturnType<typeof $getSelection> = null
    editor.update(() => {
      const paragraph = $createParagraphNode()
      const text = $createTextNode('before after')
      paragraph.append(text)
      $getRoot().append(paragraph)
      const selection = $createRangeSelection()
      selection.anchor.set(text.getKey(), 7, 'text')
      selection.focus.set(text.getKey(), 7, 'text')
      $setSelection(selection)
      savedSelection = selection.clone()
    }, { discrete: true })
    insertVariableAtSavedSelection(editor, savedSelection, 'ph_test')
    await waitFor(() => expect(JSON.stringify(editor.getEditorState().toJSON())).toContain('"varName":"ph_test"'))
    const json = JSON.stringify(editor.getEditorState().toJSON())
    expect(json).toContain('"text":"before "')
    expect(json).toContain('"text":" after"')
  })

  it('inherits bold text styling at the caret when inserting a dynamic token', async () => {
    const editor = createEditor({ nodes: [VariableNode] })
    let savedSelection: ReturnType<typeof $getSelection> = null
    editor.update(() => {
      const paragraph = $createParagraphNode()
      const text = $createTextNode('before after')
      text.setFormat('bold')
      paragraph.append(text)
      $getRoot().append(paragraph)
      const selection = $createRangeSelection()
      selection.anchor.set(text.getKey(), 7, 'text')
      selection.focus.set(text.getKey(), 7, 'text')
      $setSelection(selection)
      savedSelection = selection.clone()
    }, { discrete: true })
    insertVariableAtSavedSelection(editor, savedSelection, 'ph_test')
    await waitFor(() => expect(JSON.stringify(editor.getEditorState().toJSON())).toContain('"varName":"ph_test"'))
    expect(JSON.stringify(editor.getEditorState().toJSON())).toContain('"formats":["bold"]')
  })

  it('replaces only the trigger and preserves text on both sides of the caret', async () => {
    const editor = createEditor({ nodes: [VariableNode] })
    editor.update(() => {
      const paragraph = $createParagraphNode()
      const text = $createTextNode('before {{na after')
      text.setFormat('bold')
      paragraph.append(text)
      $getRoot().append(paragraph)
      const selection = $createRangeSelection()
      selection.anchor.set(text.getKey(), 11, 'text')
      selection.focus.set(text.getKey(), 11, 'text')
      $setSelection(selection)
      expect(replaceVariableQueryWithNode(text, 'ph_test')).toBe(true)
    }, { discrete: true })
    const document = JSON.stringify(editor.getEditorState().toJSON())
    expect(document).toContain('"text":"before "')
    expect(document).toContain('"varName":"ph_test"')
    expect(document).toContain('"text":" after"')
  })
})

describe('VariableNode', () => {
  it('toggles inline formatting through the normal text selection', () => {
    const editor = createEditor({ nodes: [VariableNode] })
    editor.update(() => {
      const token = $createVariableNode('ph_known')
      const paragraph = $createParagraphNode()
      paragraph.append(token)
      $getRoot().append(paragraph)
      const selection = $createNodeSelection()
      selection.add(token.getKey())
      $setSelection(selection)
      expect($toggleSelectedVariableFormat('bold')).toBe(true)
      expect(token.getFormats()).toContain('bold')
      expect($toggleSelectedVariableFormat('bold')).toBe(true)
      expect(token.getFormats()).not.toContain('bold')
    }, { discrete: true })
  })

  it('becomes editable when disabled turns off after mount', async () => {
    const { rerender } = render(<RichTextEditor value={null} onChange={vi.fn()} disabled />)
    expect(document.querySelector('[contenteditable]')).toHaveAttribute('contenteditable', 'false')
    rerender(<RichTextEditor value={null} onChange={vi.fn()} />)
    await waitFor(() => expect(document.querySelector('[contenteditable]')).toHaveAttribute('contenteditable', 'true'))
  })

  it('turns pasted Markdown into formatted blocks and known variables into nodes', async () => {
    // jsdom has no layout; Lexical measures the caret to scroll it into view.
    const rect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    const rangeProto = Range.prototype as Partial<Range>
    rangeProto.getBoundingClientRect = rect
    onTestFinished(() => { delete rangeProto.getBoundingClientRect })
    const onChange = vi.fn()
    render(<RichTextEditor value={null} onChange={onChange} variables={[{ name: 'event_name', description: 'Event name' }]} />)
    const editable = document.querySelector('[contenteditable="true"]') as HTMLElement
    editable.focus()
    const paragraph = await waitFor(() => { const p = editable.querySelector('p'); expect(p).not.toBeNull(); return p! })
    const range = document.createRange()
    range.setStart(paragraph, 0)
    range.collapse(true)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    fireEvent(document, new Event('selectionchange'))
    fireEvent.paste(editable, { clipboardData: { getData: (type: string) => type === 'text/plain' ? '# Title\n\n#### Four\n\n###### Six\n\n- **one** {{event_name}} {{unknown}}\n\n```\nls -la\n```' : '' } })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const state = JSON.stringify(onChange.mock.calls.at(-1)?.[0])
    expect(state).toContain('"tag":"h1"')
    expect(state).toContain('"tag":"h4"')
    expect(state).toContain('"tag":"h6"')
    expect(state).toContain('"listType":"bullet"')
    expect(state).toContain('"varName":"event_name"')
    expect(state).toContain('{{unknown}}')
    expect(state).toContain('"format":1')
    expect(state).toContain('"type":"code"')
  })

  it('VariableNode.getType() returns "variable"', () => {
    // Static method — no active editor required
    expect(VariableNode.getType()).toBe('variable')
  })

  it('$isVariableNode returns false for non-VariableNode values', () => {
    // No active editor needed for negative checks
    expect($isVariableNode('a string')).toBe(false)
    expect($isVariableNode(null)).toBe(false)
    expect($isVariableNode(undefined)).toBe(false)
    expect($isVariableNode({})).toBe(false)
    expect($isVariableNode(42)).toBe(false)
  })

  it('$createVariableNode creates a VariableNode and $isVariableNode identifies it', () => {
    // Node constructor requires an active editor context in Lexical — use createEditor
    const editor = createEditor({ nodes: [VariableNode] })
    let result = false
    // editor.update callback runs synchronously for the node-creation bookkeeping
    editor.update(() => {
      const node = $createVariableNode('Name')
      result = $isVariableNode(node)
    })
    expect(result).toBe(true)
  })
})

describe('CopyBlockNode', () => {
 it('round trips a standard element container with inline variable children', () => {
  const editor = createEditor({ nodes: [VariableNode, CopyBlockNode] })
  editor.update(() => { $getRoot().append($createCopyBlockNode().append($createTextNode('ssh '), $createVariableNode('host'))) }, { discrete: true })
  const json = editor.getEditorState().toJSON()
  expect(json.root.children[0]).toMatchObject({ type: 'copy-block', version: 1, children: [ { text: 'ssh ' }, { type: 'variable', varName: 'host' } ] })
  editor.setEditorState(editor.parseEditorState(JSON.stringify(json)))
  expect(editor.getEditorState().toJSON()).toEqual(json)
 })
 it('provides a translated toolbar action in the code group', () => {
  render(<RichTextEditor value={null} onChange={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Блок для копіювання' })).toBeInTheDocument()
 })
})

it('flattens rich copy-block children and line breaks while retaining variable chips', () => {
 const editor = createEditor({ nodes: [VariableNode, CopyBlockNode] })
 editor.update(() => {
  const block = $createCopyBlockNode().append($createParagraphNode().append($createTextNode('one\ntwo'), $createVariableNode('host')))
  $getRoot().append(block)
  $normalizeCopyBlock(block)
 }, { discrete: true })
 const block = editor.getEditorState().toJSON().root.children[0] as unknown as { children: {type: string; text?: string; varName?: string}[] }
 expect(block.children.map(n => n.type)).toEqual(['text', 'variable'])
 expect(block.children[0].text).toBe('one two')
 expect(block.children[1].varName).toBe('host')
})

it('Enter leaves a copy block for a normal paragraph and preserves the trailing text', () => {
 const editor = createEditor({ nodes: [CopyBlockNode] })
 editor.update(() => {
  const text = $createTextNode('beforeafter')
  $getRoot().append($createCopyBlockNode().append(text))
  text.select(6, 6)
  const selection = $getSelection()
  if ($isRangeSelection(selection)) selection.insertParagraph()
 }, { discrete: true })
 expect(editor.getEditorState().toJSON().root.children).toMatchObject([
  { type: 'copy-block', children: [{ text: 'before' }] },
  { type: 'paragraph', children: [{ text: 'after' }] },
 ])
})
it('Backspace at the start turns a copy block into a paragraph without losing variable children', () => {
 const editor = createEditor({ nodes: [VariableNode, CopyBlockNode] })
 const root = document.createElement('div'); document.body.append(root); editor.setRootElement(root)
 onTestFinished(() => { editor.setRootElement(null); root.remove() })
 editor.update(() => {
  const text = $createTextNode('ssh ')
  $getRoot().append($createCopyBlockNode().append(text, $createVariableNode('host')))
  text.select(0, 0)
  const selection = $getSelection()
  if ($isRangeSelection(selection)) selection.deleteCharacter(true)
 }, { discrete: true })
 expect(editor.getEditorState().toJSON().root.children).toMatchObject([
  { type: 'paragraph', children: [{ text: 'ssh ' }, { type: 'variable', varName: 'host' }] },
 ])
})

it('fixes hint content to 144px with internal scrolling and keeps long text lossless', async () => {
 const text = 'A long hint with rich content '.repeat(500)
 const editor = createEditor()
 editor.update(() => { $getRoot().append($createParagraphNode().append($createTextNode(text))) }, { discrete: true })
 const { container } = render(<RichTextEditor value={editor.getEditorState().toJSON() as unknown as Record<string, unknown>} onChange={vi.fn()} contentHeight={144} />)
 const area = container.querySelector('.editor-scroll')!
 expect(area).toHaveStyle({ height: '144px', minHeight: '144px', maxHeight: '144px', resize: 'none', overflowY: 'auto' })
 expect(area).not.toContainElement(screen.getByRole('toolbar'))
 expect(container.firstElementChild).toHaveClass('overflow-visible')
 await waitFor(() => expect(area.textContent).toBe(text))
})
it('caps task description scrolling at 320px without applying fixed sizing to other editors', () => {
 const { container, rerender } = render(<RichTextEditor value={null} onChange={vi.fn()} maxContentHeight={320} />)
 expect(container.querySelector('.editor-scroll')).toHaveStyle({ maxHeight: '320px', overflowY: 'auto' })
 rerender(<RichTextEditor value={null} onChange={vi.fn()} />)
 expect(container.querySelector('.editor-scroll')).not.toHaveStyle({ maxHeight: '320px' })
})


describe('copy-block clipboard import', () => {
 async function paste(data: Record<string, string>) {
  const rect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  const rangeProto = Range.prototype as Partial<Range>
  rangeProto.getBoundingClientRect = rect
  onTestFinished(() => { delete rangeProto.getBoundingClientRect })
  const initial = createEditor({ nodes: [CopyBlockNode] })
  initial.update(() => { $getRoot().append($createCopyBlockNode()) }, { discrete: true })
  const onChange = vi.fn()
  const rendered = render(<RichTextEditor value={initial.getEditorState().toJSON() as unknown as Record<string, unknown>} onChange={onChange}
   variables={[{ name: 'host', description: 'Host', example: 'example.test' }]} />)
  const editable = rendered.container.querySelector('[contenteditable="true"]') as HTMLElement
  editable.focus()
  const block = await waitFor(() => { const node = editable.querySelector('[data-copy-block-editor]'); expect(node).not.toBeNull(); return node! })
  const range = document.createRange()
  range.setStart(block, 0); range.collapse(true)
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range)
  fireEvent(document, new Event('selectionchange'))
  fireEvent.paste(editable, { clipboardData: { getData: (type: string) => data[type] ?? '' } })
  await waitFor(() => expect(onChange).toHaveBeenCalled())
  return { value: onChange.mock.calls.at(-1)![0], rendered }
 }
 function copiedFragment() {
  const source = createEditor({ namespace: 'RichTextEditor', nodes: [VariableNode] })
  let lexical = '', html = ''
  source.update(() => {
   const paragraph = $createParagraphNode().append($createTextNode('https://'), $createVariableNode('host', ['bold', 'code']), $createTextNode('/panel\nnext'))
   $getRoot().append(paragraph)
   paragraph.select(0, paragraph.getChildrenSize())
   lexical = $getLexicalContent(source)!
   html = $getHtmlContent(source)
  }, { discrete: true })
  return { lexical, html }
 }
 it.each(['lexical', 'html'] as const)('pastes a real %s clipboard fragment as text and formatted variables, resolving the saved preview', async (format) => {
  const fragment = copiedFragment()
  const { value, rendered } = await paste({
   ...(format === 'lexical' ? { 'application/x-lexical-editor': fragment.lexical } : {}),
   'text/html': fragment.html, 'text/plain': 'https://{{host}}/panel\nnext',
  })
  expect(value.root.children).toHaveLength(1)
  expect(value.root.children[0]).toMatchObject({ type: 'copy-block', children: [
   { type: 'text', text: 'https://' }, { type: 'variable', varName: 'host', formats: ['bold', 'code'] }, { type: 'text', text: '/panel next' },
  ] })
  rendered.unmount()
  render(<TaskRichTextView value={value} variables={{ host: 'example.test' }} />)
  expect(screen.getByText('https://example.test/panel next')).toBeInTheDocument()
 })
 it('flattens HTML wrappers and line breaks while retaining supported variable chips', async () => {
  const { value } = await paste({ 'text/html': '<p>ssh <strong><span data-variable="host" data-variable-formats="italic code">{{host}}</span></strong></p><p>--verbose<br>now<script>alert(1)</script></p>', 'text/plain': 'fallback' })
  expect(value.root.children).toHaveLength(1)
  expect(value.root.children[0].children).toMatchObject([
   { type: 'text', text: 'ssh ' }, { type: 'variable', varName: 'host', formats: ['italic', 'code'] }, { type: 'text', text: ' --verbose now' },
  ])
  expect(JSON.stringify(value)).not.toContain('alert')
 })
 it('recognizes only known plain-text placeholder tokens, retaining unknown text and flattening newlines', async () => {
  const { value } = await paste({ 'text/plain': 'ssh {{host}}\n{{unknown}}\t{{ .host }}' })
  expect(value.root.children[0].children).toMatchObject([
   { type: 'text', text: 'ssh ' }, { type: 'variable', varName: 'host' },
   { type: 'text', text: ' {{unknown}} ' }, { type: 'variable', varName: 'host' },
  ])
 })
 it.each(['{broken', JSON.stringify({ namespace: 'RichTextEditor', nodes: [{ type: 'unsupported-widget', version: 1 }] })])('safely falls back from unsupported or malformed structured data (%s)', async (lexical) => {
  const { value } = await paste({ 'application/x-lexical-editor': lexical, 'text/plain': 'safe {{host}}' })
  expect(value.root.children[0].children).toMatchObject([{ text: 'safe ' }, { type: 'variable', varName: 'host' }])
 })
})
