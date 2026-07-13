import StarterKit from '@tiptap/starter-kit'
import { TextStyle, FontSize, Color } from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import { MCQNode } from './MCQNode'
import { YouTubeNode } from './YouTubeNode'
import { PhaseNode } from './PhaseNode'
import { PdfNode } from './PdfNode'
import { SlideNode } from './SlideNode'

/** Shared TipTap extension set used by both the editor and the read-only viewer. */
export function buildExtensions() {
  return [
    StarterKit,
    TextStyle,
    Color,
    FontSize,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Image.configure({ inline: false, allowBase64: true }),
    TableKit,
    MCQNode,
    YouTubeNode,
    PhaseNode,
    PdfNode,
    SlideNode,
  ]
}

/** CSS for rendered rich content (headings, tables, images, links, lists). */
export const CONTENT_CSS = {
  '& p': { margin: '0.5em 0' },
  '& h1': { fontSize: '1.7em', fontWeight: 700, margin: '0.6em 0 0.3em' },
  '& h2': { fontSize: '1.4em', fontWeight: 700, margin: '0.6em 0 0.3em' },
  '& h3': { fontSize: '1.2em', fontWeight: 600, margin: '0.5em 0 0.3em' },
  '& ul, & ol': { paddingLeft: '1.4em', margin: '0.4em 0' },
  '& li': { margin: '0.2em 0' },
  '& a': { color: '#2563EB', textDecoration: 'underline' },
  '& img': { maxWidth: '100%', borderRadius: '8px', margin: '0.4em 0' },
  '& table': { borderCollapse: 'collapse', width: '100%', margin: '0.5em 0' },
  '& table td, & table th': { border: '1px solid #cbd5e1', padding: '6px 10px' },
  '& table th': { background: '#f1f5f9', fontWeight: 600 },
  '& blockquote': { borderLeft: '3px solid #cbd5e1', paddingLeft: '12px', color: '#475569', margin: '0.5em 0' },
  '& code': { background: '#f1f5f9', padding: '2px 5px', borderRadius: '4px', fontSize: '0.88em', fontFamily: 'monospace' },
  '& pre': { background: '#0f172a', color: '#e2e8f0', padding: '12px 14px', borderRadius: '8px', overflowX: 'auto', margin: '0.6em 0', fontFamily: 'monospace', fontSize: '0.9em', lineHeight: 1.6 },
  '& pre code': { background: 'transparent', color: 'inherit', padding: 0, fontSize: 'inherit' },
} as const

/** Richer typography for the reading view (viewer only). Extends CONTENT_CSS. */
export const READER_CSS = {
  ...CONTENT_CSS,
  '& p': { margin: '0.75em 0' },
  '& h1': { fontSize: '1.85em', fontWeight: 800, lineHeight: 1.25, margin: '1em 0 0.4em' },
  '& h2': { fontSize: '1.45em', fontWeight: 700, margin: '1.1em 0 0.35em', paddingBottom: '5px', borderBottom: '1px solid #e2e8f0' },
  '& h3': { fontSize: '1.2em', fontWeight: 700, margin: '0.9em 0 0.3em' },
  '& blockquote': { borderLeft: '4px solid #2563EB', background: '#EFF6FF', padding: '10px 16px', borderRadius: '8px', color: '#1e3a5f', fontStyle: 'italic', margin: '0.9em 0' },
  '& img': { maxWidth: '100%', borderRadius: '10px', margin: '0.9em auto', display: 'block', boxShadow: '0 2px 12px rgba(0,0,0,.12)' },
  '& hr': { border: 'none', borderTop: '1px solid #e2e8f0', margin: '1.3em 0' },
  '& code': { background: '#f1f5f9', padding: '2px 5px', borderRadius: '4px', fontSize: '0.88em', fontFamily: 'monospace' },
  '& pre': { background: '#0f172a', color: '#e2e8f0', padding: '12px 14px', borderRadius: '8px', overflowX: 'auto', margin: '0.9em 0' },
  '& pre code': { background: 'transparent', color: 'inherit', padding: 0 },
  '& a': { color: '#2563EB', textDecoration: 'underline', textUnderlineOffset: '2px' },
  '& ul, & ol': { paddingLeft: '1.5em', margin: '0.6em 0' },
} as const
