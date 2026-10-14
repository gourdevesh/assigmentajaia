import path from 'node:path';
import mammoth from 'mammoth';
import { marked } from 'marked';
import { cleanHtml } from './sanitize.js';

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.docx'];

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function textToHtml(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export class UnsupportedFileError extends Error {}

/** Turn an uploaded file into { title, html }. */
export async function importFile({ originalname, buffer }) {
  const ext = path.extname(originalname).toLowerCase();
  const baseTitle = path.basename(originalname, path.extname(originalname)).trim() || 'Imported document';
  let html;

  if (ext === '.txt') {
    html = textToHtml(buffer.toString('utf8'));
  } else if (ext === '.md' || ext === '.markdown') {
    html = await marked.parse(buffer.toString('utf8'), { async: true });
  } else if (ext === '.docx') {
    const result = await mammoth.convertToHtml({ buffer });
    html = result.value;
  } else {
    throw new UnsupportedFileError(
      `Unsupported file type "${ext || 'unknown'}". Upload one of: ${SUPPORTED_EXTENSIONS.join(', ')}`
    );
  }
  return { title: baseTitle.slice(0, 120), html: cleanHtml(html) };
}
