import { GoogleGenAI } from '@google/genai';
import ExcelJS from 'exceljs';
import type { KnowledgeChunk, KnowledgeSlotId } from '@aislaves/shared';

function extractCsvLines(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(',').map((c) => c.trim().replace(/^"|"$/g, '')).join(' | '))
    .join('\n');
}

export async function extractDocumentText(input: {
  fileName: string;
  mimeType?: string;
  buffer?: Buffer;
  plainText?: string;
}): Promise<string> {
  if (input.plainText && !input.buffer) {
    return input.plainText.trim();
  }

  const lower = input.fileName.toLowerCase();
  const mime = (input.mimeType || '').toLowerCase();
  const buf = input.buffer;

  if (!buf || buf.length === 0) {
    return (input.plainText || '').trim();
  }

  if (lower.endsWith('.pdf') || mime.includes('pdf')) {
    try {
      const { extractText } = await import('unpdf');
      const result = await extractText(new Uint8Array(buf), { mergePages: true });
      const text = Array.isArray(result.text) ? result.text.join('\n') : String(result.text || '');
      if (text.trim()) return text.trim();
    } catch {
      // fallback to UTF-8 text if PDF text stream is plain text in tests
    }
    return buf.toString('utf8').trim();
  }

  if (lower.endsWith('.docx') || mime.includes('wordprocessingml')) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: buf });
    return (result.value || '').trim();
  }

  if (lower.endsWith('.xlsx') || mime.includes('spreadsheetml')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const lines: string[] = [];
    wb.eachSheet((sheet) => {
      lines.push(`## Sheet: ${sheet.name}`);
      sheet.eachRow((row) => {
        const vals = (row.values as unknown[]).slice(1).map((cell) => {
          if (cell && typeof cell === 'object' && 'result' in cell) {
            return String((cell as { result?: unknown }).result ?? '');
          }
          return String(cell ?? '');
        });
        const clean = vals.map((v) => v.trim()).filter(Boolean);
        if (clean.length) lines.push(clean.join(' | '));
      });
    });
    return lines.join('\n');
  }

  if (lower.endsWith('.csv') || mime.includes('csv')) {
    return extractCsvLines(buf.toString('utf8'));
  }

  return buf.toString('utf8').trim();
}

export async function ingestDocumentToChunks(input: {
  slotId: KnowledgeSlotId;
  fileName: string;
  mimeType?: string;
  buffer?: Buffer;
  plainText?: string;
  departmentScope?: 'all_staff' | 'sales' | 'finance_only';
}): Promise<KnowledgeChunk[]> {
  const fullText = await extractDocumentText(input);
  if (!fullText) return [];

  const scope = input.departmentScope ?? 'all_staff';
  const now = new Date().toISOString();
  const paragraphs = fullText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: KnowledgeChunk[] = [];
  let currentSection = 'Section 1';
  let bufferText = '';

  const flush = () => {
    const trimmed = bufferText.trim();
    if (!trimmed) return;
    chunks.push({
      id: `chk-${Date.now().toString(36)}-${chunks.length + 1}`,
      slotId: input.slotId,
      docName: input.fileName,
      sectionTitle: currentSection,
      content: trimmed,
      departmentScope: scope,
      createdAt: now,
    });
    bufferText = '';
  };

  for (const para of paragraphs) {
    if (para.startsWith('#') || /^Section\s+\d+/i.test(para)) {
      flush();
      const firstLine = para.split('\n')[0].replace(/^#+\s*/, '').trim();
      currentSection = firstLine.slice(0, 72) || currentSection;
    }

    if ((bufferText + '\n\n' + para).length > 560 && bufferText) {
      flush();
    }
    bufferText = bufferText ? `${bufferText}\n\n${para}` : para;
  }
  flush();

  if (chunks.length === 0) {
    chunks.push({
      id: `chk-${Date.now().toString(36)}-1`,
      slotId: input.slotId,
      docName: input.fileName,
      sectionTitle: 'Summary',
      content: fullText.slice(0, 560),
      departmentScope: scope,
      createdAt: now,
    });
  }

  return chunks;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function bm25Score(queryTokens: string[], content: string, title: string): number {
  const docTokens = tokenize(`${title} ${content}`);
  if (docTokens.length === 0 || queryTokens.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const t of docTokens) {
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  let score = 0;
  for (const q of new Set(queryTokens)) {
    const tf = freq.get(q) ?? 0;
    if (tf > 0) {
      const k1 = 1.2;
      const b = 0.75;
      const avgDl = 45;
      score += (tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * docTokens.length) / avgDl));
      if (title.toLowerCase().includes(q)) score += 0.6;
    }
  }
  return score;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export async function retrieveCitedChunks(opts: {
  chunks: KnowledgeChunk[];
  query: string;
  allowedScopes?: Array<'all_staff' | 'sales' | 'finance_only'>;
  topK?: number;
  geminiApiKey?: string;
}): Promise<Array<KnowledgeChunk & { score: number; citation: string }>> {
  const scopes = opts.allowedScopes ?? ['all_staff', 'sales', 'finance_only'];
  const scoped = opts.chunks.filter((c) => scopes.includes(c.departmentScope));
  if (scoped.length === 0) return [];

  const qTokens = tokenize(opts.query);
  const baseRanked = scoped
    .map((chunk) => ({
      chunk,
      score: bm25Score(qTokens, chunk.content, chunk.sectionTitle),
    }))
    .sort((a, b) => b.score - a.score);

  const apiKey = opts.geminiApiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (apiKey && scoped.length <= 15) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const res = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: [opts.query, ...scoped.map((c) => `${c.sectionTitle}: ${c.content}`)],
      });
      const embeddings = res.embeddings?.map((e) => e.values ?? []) ?? [];
      if (embeddings.length === scoped.length + 1) {
        const qVec = embeddings[0];
        const semanticRanked = scoped
          .map((chunk, i) => ({
            chunk,
            score: cosineSimilarity(qVec, embeddings[i + 1]) + bm25Score(qTokens, chunk.content, chunk.sectionTitle) * 0.25,
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, opts.topK ?? 3);

        return semanticRanked.map(({ chunk, score }) => ({
          ...chunk,
          score: Math.round(score * 1000) / 1000,
          citation: `${chunk.docName} (${chunk.sectionTitle})`,
        }));
      }
    } catch {
      // gracefully fall back to local BM25 ranking
    }
  }

  return baseRanked.slice(0, opts.topK ?? 3).map(({ chunk, score }) => ({
    ...chunk,
    score: Math.round(score * 1000) / 1000,
    citation: `${chunk.docName} (${chunk.sectionTitle})`,
  }));
}
