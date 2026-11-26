import ExcelJS from 'exceljs';
import type { ExcelLedgerRow } from '@aislaves/shared';

function normalizeNumber(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw ?? '0').replace(/[^0-9.-]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function splitCsvLine(line: string): string[] {
  return line
    .split(',')
    .map((cell) => cell.trim().replace(/^"|"$/g, ''));
}

export async function parsePosZReportBuffer(input: {
  fileName: string;
  buffer?: Buffer;
  csvText?: string;
  varianceCapMyr?: number;
}): Promise<{
  rows: ExcelLedgerRow[];
  flaggedRows: ExcelLedgerRow[];
  grossSalesMyr: number;
  varianceTotalMyr: number;
}> {
  const cap = input.varianceCapMyr ?? 20;
  const parsed: ExcelLedgerRow[] = [];
  const lower = input.fileName.toLowerCase();

  if (lower.endsWith('.xlsx') && input.buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(input.buffer as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0];
    if (sheet) {
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const date = String(row.getCell(1).value ?? '').trim() || new Date().toISOString().slice(0, 10);
        const outlet = String(row.getCell(2).value ?? '').trim();
        if (!outlet) return;
        const category = String(row.getCell(3).value ?? 'POS Z-Report').trim();
        const posReported = normalizeNumber(row.getCell(4).value);
        const bankDeposited = normalizeNumber(row.getCell(5).value);
        const variance = Math.round((posReported - bankDeposited) * 100) / 100;
        parsed.push({
          date,
          outletOrVendor: outlet,
          category,
          posReportedMyr: posReported,
          bankDepositedMyr: bankDeposited,
          varianceMyr: variance,
          status:
            Math.abs(variance) > cap
              ? `AI_Staging (VARIANCE RM ${variance.toFixed(2)})`
              : 'AI_Staging (Matched)',
        });
      });
    }
  } else {
    const rawCsv = input.csvText ?? input.buffer?.toString('utf8') ?? '';
    const lines = rawCsv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const dataLines =
      lines.length > 0 && /date|outlet|pos/i.test(lines[0]) ? lines.slice(1) : lines;

    for (const line of dataLines) {
      const cols = splitCsvLine(line);
      if (cols.length < 4 || !cols[1]) continue;
      const date = cols[0] || new Date().toISOString().slice(0, 10);
      const outlet = cols[1];
      const posReported = normalizeNumber(cols[2]);
      const bankDeposited = normalizeNumber(cols[3]);
      const category = cols[4] || 'POS Z-Report';
      const variance = Math.round((posReported - bankDeposited) * 100) / 100;
      parsed.push({
        date,
        outletOrVendor: outlet,
        category,
        posReportedMyr: posReported,
        bankDepositedMyr: bankDeposited,
        varianceMyr: variance,
        status:
          Math.abs(variance) > cap
            ? `AI_Staging (VARIANCE RM ${variance.toFixed(2)})`
            : 'AI_Staging (Matched)',
      });
    }
  }

  const flaggedRows = parsed.filter((r) => Math.abs(r.varianceMyr) > cap);
  const grossSalesMyr = Math.round(parsed.reduce((acc, r) => acc + r.posReportedMyr, 0) * 100) / 100;
  const varianceTotalMyr = Math.round(parsed.reduce((acc, r) => acc + r.varianceMyr, 0) * 100) / 100;

  return {
    rows: parsed,
    flaggedRows,
    grossSalesMyr,
    varianceTotalMyr,
  };
}
