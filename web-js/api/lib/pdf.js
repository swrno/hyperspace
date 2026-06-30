import { PDFParse } from 'pdf-parse';

/**
 * Extract plain text from a PDF buffer (pdf-parse v2 API).
 * Returns '' (never throws) so a single bad file can't break an upload batch.
 */
export async function extractPdfText(buffer) {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return (result.text || '').replace(/\n{3,}/g, '\n\n').trim();
  } catch (e) {
    console.warn('PDF parse failed:', e.message);
    return '';
  }
}

/**
 * Decode a base64 (optionally data-URL prefixed) document and, for PDFs,
 * extract its text. Returns the best-effort plain text.
 */
export async function textFromBase64(base64, filename = '') {
  if (!base64) return '';
  const cleaned = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const buf = Buffer.from(cleaned, 'base64');
  if (/\.pdf$/i.test(filename) || buf.slice(0, 5).toString('latin1') === '%PDF-') {
    return extractPdfText(buf);
  }
  // Fallback: treat as UTF-8 text.
  return buf.toString('utf8');
}
