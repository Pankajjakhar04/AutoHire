import fs from 'fs';

let pdfParse = null;
let mammoth = null;
let loadAttempted = false;

async function lazyLoadParsers() {
  if (loadAttempted) return;
  loadAttempted = true;
  
  if (!pdfParse) {
    try {
      const mod = await import('pdf-parse');
      pdfParse = mod.default || mod;
      console.log('[ResumeText] pdf-parse loaded successfully');
    } catch (err) {
      console.error('[ResumeText] Failed to load pdf-parse:', err?.message || err);
      pdfParse = null;
    }
  }
  if (!mammoth) {
    try {
      const mod = await import('mammoth');
      mammoth = mod.default || mod;
      console.log('[ResumeText] mammoth loaded successfully');
    } catch (err) {
      console.error('[ResumeText] Failed to load mammoth:', err?.message || err);
      mammoth = null;
    }
  }
}

function clipText(text, maxChars = 18000) {
  const t = String(text || '').replace(/\u0000/g, '').trim();
  if (!t) return '';
  return t.length > maxChars ? `${t.slice(0, maxChars)}\n\n[TRUNCATED]` : t;
}

export async function extractResumeTextFromBuffer({ buffer, mimeType, originalName }) {
  await lazyLoadParsers();

  const name = String(originalName || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();

  console.log(`[ResumeText] Extracting from: ${originalName}, mime: ${mimeType}, buffer size: ${buffer?.length || 0}`);

  const isPdf = mime.includes('pdf') || name.endsWith('.pdf');
  const isDocx =
    mime.includes('officedocument.wordprocessingml.document') || name.endsWith('.docx');
  const isDoc = mime.includes('msword') || name.endsWith('.doc');

  if (isPdf) {
    if (!pdfParse) {
      console.error('[ResumeText] pdf-parse not available, cannot extract PDF');
      return '';
    }
    try {
      const out = await pdfParse(buffer);
      let text = clipText(out?.text || '');
      
      // If no text extracted, it might be a scanned PDF
      if (!text || text.length < 50) {
        console.warn('[ResumeText] PDF appears to be scanned/image-based, no text extracted');
        console.warn('[ResumeText] Consider using OCR for scanned PDFs');
        // For now, return empty but log the issue
        text = '';
      }
      
      console.log(`[ResumeText] PDF extracted: ${text.length} chars`);
      return text;
    } catch (err) {
      console.error('[ResumeText] PDF parse error:', err?.message || err);
      return '';
    }
  }

  if (isDocx) {
    if (!mammoth) {
      console.error('[ResumeText] mammoth not available, cannot extract DOCX');
      return '';
    }
    try {
      const out = await mammoth.extractRawText({ buffer });
      const text = clipText(out?.value || '');
      console.log(`[ResumeText] DOCX extracted: ${text.length} chars`);
      return text;
    } catch (err) {
      console.error('[ResumeText] DOCX parse error:', err?.message || err);
      return '';
    }
  }

  if (isDoc) {
    console.warn('[ResumeText] .doc format not supported, only .docx and .pdf');
    return '';
  }

  console.warn(`[ResumeText] Unsupported file type: ${originalName} (${mimeType})`);
  return '';
}

export function readFileToBuffer(absPath) {
  return fs.readFileSync(absPath);
}

