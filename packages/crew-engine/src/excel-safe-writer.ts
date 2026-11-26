import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import type { ExcelLedgerRow, WorkbookPreviewState } from '@aislaves/shared';
import { getLocalDataDir } from './paths';

const DEFAULT_BOOK_NAME = 'KopiKita_Bookkeeping_2026.xlsx';
const SUMMARY_SHEET = 'Daily_Sales_Summary';
const STAGING_SHEET = 'AI_Staging';
const HEADER_ROW = 6;
const FIRST_DATA_ROW = 7;

const BASELINE_COMMITTED_ROWS: ExcelLedgerRow[] = [
  {
    date: '2026-11-24',
    outletOrVendor: 'KopiKita Bangsar Utama',
    category: 'POS Daily Close',
    posReportedMyr: 4280,
    bankDepositedMyr: 4280,
    varianceMyr: 0,
    status: 'Committed (Verified)',
  },
  {
    date: '2026-11-24',
    outletOrVendor: 'KopiKita Damansara Uptown',
    category: 'POS Daily Close',
    posReportedMyr: 3610,
    bankDepositedMyr: 3610,
    varianceMyr: 0,
    status: 'Committed (Verified)',
  },
  {
    date: '2026-11-24',
    outletOrVendor: 'KopiKita Subang SS15',
    category: 'POS Daily Close',
    posReportedMyr: 2940,
    bankDepositedMyr: 2940,
    varianceMyr: 0,
    status: 'Committed (Verified)',
  },
];

function getTenantWorkbookPaths(tenantId: string, baseDir?: string) {
  const root = join(getLocalDataDir(baseDir), 'workbooks', tenantId);
  const backupsDir = join(root, '_aislaves_backups');
  const filePath = join(root, DEFAULT_BOOK_NAME);
  mkdirSync(backupsDir, { recursive: true });
  return { root, backupsDir, filePath };
}

function assertCellHasNoFormula(sheet: ExcelJS.Worksheet, rowNumber: number, colCount: number) {
  const row = sheet.getRow(rowNumber);
  for (let col = 1; col <= colCount; col += 1) {
    const val = row.getCell(col).value;
    if (val && typeof val === 'object' && 'formula' in val && val.formula) {
      throw new Error(
        `Safety halt: attempted to overwrite formula cell (${sheet.name}!R${rowNumber}C${col}: =${val.formula})`
      );
    }
  }
}

function createBackupSnapshot(filePath: string, backupsDir: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `KopiKita_Bookkeeping_2026_${stamp}.bak.xlsx`;
  copyFileSync(filePath, join(backupsDir, backupFileName));
  return backupFileName;
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.values = [
    'Date',
    'Outlet / Vendor',
    'Category',
    'POS / Claim (MYR)',
    'Bank / Policy Approved (MYR)',
    'Variance (MYR)',
    'Status',
  ];
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' },
    };
  });
}

function writeLedgerRowAt(sheet: ExcelJS.Worksheet, rowNumber: number, item: ExcelLedgerRow) {
  assertCellHasNoFormula(sheet, rowNumber, 7);
  const row = sheet.getRow(rowNumber);
  row.getCell(1).value = item.date;
  row.getCell(2).value = item.outletOrVendor;
  row.getCell(3).value = item.category;
  row.getCell(4).value = item.posReportedMyr;
  row.getCell(5).value = item.bankDepositedMyr;
  row.getCell(6).value = {
    formula: `D${rowNumber}-E${rowNumber}`,
    result: Math.round((item.posReportedMyr - item.bankDepositedMyr) * 100) / 100,
  };
  row.getCell(7).value = item.status;
}

export async function ensureSeedWorkbook(
  tenantId: string,
  baseDir?: string,
  forceOverwrite = false
): Promise<WorkbookPreviewState> {
  const { filePath, backupsDir } = getTenantWorkbookPaths(tenantId, baseDir);

  if (!existsSync(filePath) || forceOverwrite) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'AISlaves Safe Excel Engine';
    wb.created = new Date();

    const summary = wb.addWorksheet(SUMMARY_SHEET);
    summary.columns = [
      { width: 14 },
      { width: 32 },
      { width: 22 },
      { width: 20 },
      { width: 26 },
      { width: 16 },
      { width: 26 },
    ];

    summary.getRow(1).values = ['KopiKita Artisan Roasters Sdn Bhd — Protected Bookkeeping Master'];
    summary.getRow(1).getCell(1).font = { bold: true, size: 13 };

    // Live top summary formulas protected above the ledger rows (Rows 2-4)
    summary.getRow(2).getCell(2).value = 'TOTAL POS / CLAIM REPORTED (FORMULA)';
    summary.getRow(2).getCell(4).value = { formula: 'SUM(D7:D200)', result: 10830 };
    summary.getRow(3).getCell(2).value = 'TOTAL BANK DEPOSITED (FORMULA)';
    summary.getRow(3).getCell(5).value = { formula: 'SUM(E7:E200)', result: 10830 };
    summary.getRow(4).getCell(2).value = 'NET CASH VARIANCE (FORMULA)';
    summary.getRow(4).getCell(6).value = { formula: 'D2-E3', result: 0 };

    styleHeaderRow(summary.getRow(HEADER_ROW));
    BASELINE_COMMITTED_ROWS.forEach((row, index) => {
      writeLedgerRowAt(summary, FIRST_DATA_ROW + index, row);
    });

    const staging = wb.addWorksheet(STAGING_SHEET);
    staging.columns = summary.columns;
    staging.getRow(1).values = ['AI_Staging Queue (Requires 1-Tap Manager Sign-Off Before Master Commit)'];
    staging.getRow(1).getCell(1).font = { bold: true, size: 12 };
    styleHeaderRow(staging.getRow(HEADER_ROW));

    await wb.xlsx.writeFile(filePath);
  }

  return inspectWorkbookState(tenantId, baseDir, backupsDir);
}

function readSheetRows(sheet: ExcelJS.Worksheet | undefined, startRow: number): ExcelLedgerRow[] {
  if (!sheet) return [];
  const rows: ExcelLedgerRow[] = [];
  for (let r = startRow; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const dateVal = row.getCell(1).value;
    const outletVal = row.getCell(2).value;
    if (!dateVal || !outletVal) continue;
    const posNum = Number(row.getCell(4).value ?? 0);
    const bankNum = Number(row.getCell(5).value ?? 0);
    const rawVar = row.getCell(6).value;
    const variance =
      rawVar && typeof rawVar === 'object' && 'result' in rawVar
        ? Number(rawVar.result ?? posNum - bankNum)
        : Number(rawVar ?? posNum - bankNum);
    rows.push({
      date: String(dateVal),
      outletOrVendor: String(outletVal),
      category: String(row.getCell(3).value ?? ''),
      posReportedMyr: posNum,
      bankDepositedMyr: bankNum,
      varianceMyr: Math.round(variance * 100) / 100,
      status: String(row.getCell(7).value ?? ''),
    });
  }
  return rows;
}

export async function inspectWorkbookState(
  tenantId: string,
  baseDir?: string,
  explicitBackupsDir?: string
): Promise<WorkbookPreviewState> {
  const { filePath, backupsDir } = getTenantWorkbookPaths(tenantId, baseDir);
  if (!existsSync(filePath)) {
    return ensureSeedWorkbook(tenantId, baseDir);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const summary = wb.getWorksheet(SUMMARY_SHEET);
  const staging = wb.getWorksheet(STAGING_SHEET);
  const committedRows = readSheetRows(summary, FIRST_DATA_ROW);
  const stagingRows = readSheetRows(staging, FIRST_DATA_ROW);

  const preservedFormulas: string[] = [];
  if (summary) {
    for (const r of [2, 3, 4]) {
      for (const c of [4, 5, 6]) {
        const val = summary.getRow(r).getCell(c).value;
        if (val && typeof val === 'object' && 'formula' in val && val.formula) {
          preservedFormulas.push(`${summary.getRow(r).getCell(c).address}: =${val.formula}`);
        }
      }
    }
  }

  const targetBackupDir = explicitBackupsDir ?? backupsDir;
  const backupNames = existsSync(targetBackupDir)
    ? readdirSync(targetBackupDir)
        .filter((f) => f.endsWith('.bak.xlsx'))
        .sort()
        .reverse()
    : [];

  return {
    fileName: DEFAULT_BOOK_NAME,
    lastUpdatedAt: new Date().toISOString(),
    preservedFormulas,
    backups: backupNames.slice(0, 6).map((backupFileName) => ({
      backupFileName,
      createdAt: new Date().toISOString(),
      reason: 'Automatic pre-write snapshot',
    })),
    committedRows,
    stagingRows,
  };
}

export async function stageLedgerRowsSafely(
  tenantId: string,
  rowsToStage: ExcelLedgerRow[],
  reason: string,
  baseDir?: string
): Promise<{ workbook: WorkbookPreviewState; backupFileName: string }> {
  await ensureSeedWorkbook(tenantId, baseDir);
  const { filePath, backupsDir } = getTenantWorkbookPaths(tenantId, baseDir);
  const backupFileName = createBackupSnapshot(filePath, backupsDir);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const staging = wb.getWorksheet(STAGING_SHEET);
  if (!staging) throw new Error(`Missing ${STAGING_SHEET} sheet`);

  let nextRow = Math.max(FIRST_DATA_ROW, staging.rowCount + 1);
  // Avoid leaving gap rows when empty
  if (readSheetRows(staging, FIRST_DATA_ROW).length === 0) {
    nextRow = FIRST_DATA_ROW;
  }

  for (const item of rowsToStage) {
    writeLedgerRowAt(staging, nextRow, item);
    nextRow += 1;
  }

  await wb.xlsx.writeFile(filePath);
  const workbook = await inspectWorkbookState(tenantId, baseDir, backupsDir);
  workbook.backups = [
    { backupFileName, createdAt: new Date().toISOString(), reason },
    ...workbook.backups.filter((b) => b.backupFileName !== backupFileName),
  ].slice(0, 6);
  return { workbook, backupFileName };
}

export async function commitApprovedStagingRows(
  tenantId: string,
  reason = 'Manager 1-tap approval commit',
  baseDir?: string
): Promise<{ workbook: WorkbookPreviewState; backupFileName: string; committedCount: number }> {
  await ensureSeedWorkbook(tenantId, baseDir);
  const { filePath, backupsDir } = getTenantWorkbookPaths(tenantId, baseDir);
  const backupFileName = createBackupSnapshot(filePath, backupsDir);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const summary = wb.getWorksheet(SUMMARY_SHEET);
  const staging = wb.getWorksheet(STAGING_SHEET);
  if (!summary || !staging) throw new Error('Missing master sheets');

  const pending = readSheetRows(staging, FIRST_DATA_ROW);
  const existingCount = readSheetRows(summary, FIRST_DATA_ROW).length;
  let nextSummaryRow = FIRST_DATA_ROW + existingCount;

  for (const item of pending) {
    writeLedgerRowAt(summary, nextSummaryRow, {
      ...item,
      status: item.varianceMyr !== 0 ? 'Committed (Variance Noted)' : 'Committed (Approved)',
    });
    nextSummaryRow += 1;
  }

  // Update cached results on top formula cells while strictly keeping the Excel formula intact
  const allCommitted = readSheetRows(summary, FIRST_DATA_ROW);
  const posSum = allCommitted.reduce((acc, row) => acc + row.posReportedMyr, 0);
  const bankSum = allCommitted.reduce((acc, row) => acc + row.bankDepositedMyr, 0);
  summary.getRow(2).getCell(4).value = { formula: 'SUM(D7:D200)', result: posSum };
  summary.getRow(3).getCell(5).value = { formula: 'SUM(E7:E200)', result: bankSum };
  summary.getRow(4).getCell(6).value = { formula: 'D2-E3', result: posSum - bankSum };

  // Clear staging data rows
  for (let r = FIRST_DATA_ROW; r <= staging.rowCount; r += 1) {
    staging.getRow(r).values = [];
  }

  await wb.xlsx.writeFile(filePath);
  const workbook = await inspectWorkbookState(tenantId, baseDir, backupsDir);
  workbook.backups = [
    { backupFileName, createdAt: new Date().toISOString(), reason },
    ...workbook.backups.filter((b) => b.backupFileName !== backupFileName),
  ].slice(0, 6);

  return { workbook, backupFileName, committedCount: pending.length };
}

export async function readWorkbookBuffer(tenantId: string, baseDir?: string): Promise<Buffer> {
  await ensureSeedWorkbook(tenantId, baseDir);
  const { filePath } = getTenantWorkbookPaths(tenantId, baseDir);
  return readFileSync(filePath);
}

export async function syncWorkbookFromTenantState(
  tenant: {
    id: string;
    workbook: Pick<WorkbookPreviewState, 'committedRows' | 'stagingRows'>;
  },
  baseDir?: string
): Promise<Buffer> {
  const { filePath } = getTenantWorkbookPaths(tenant.id, baseDir);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AISlaves Safe Excel Engine';
  wb.created = new Date();

  const summary = wb.addWorksheet(SUMMARY_SHEET);
  summary.columns = [
    { width: 14 },
    { width: 32 },
    { width: 22 },
    { width: 20 },
    { width: 26 },
    { width: 16 },
    { width: 26 },
  ];

  summary.getRow(1).values = [`${tenant.id} — Protected Bookkeeping Master`];
  summary.getRow(1).getCell(1).font = { bold: true, size: 13 };

  const committed = tenant.workbook.committedRows ?? [];
  const posSum = committed.reduce((acc, r) => acc + r.posReportedMyr, 0);
  const bankSum = committed.reduce((acc, r) => acc + r.bankDepositedMyr, 0);

  summary.getRow(2).getCell(2).value = 'TOTAL POS / CLAIM REPORTED (FORMULA)';
  summary.getRow(2).getCell(4).value = { formula: 'SUM(D7:D200)', result: posSum };
  summary.getRow(3).getCell(2).value = 'TOTAL BANK DEPOSITED (FORMULA)';
  summary.getRow(3).getCell(5).value = { formula: 'SUM(E7:E200)', result: bankSum };
  summary.getRow(4).getCell(2).value = 'NET CASH VARIANCE (FORMULA)';
  summary.getRow(4).getCell(6).value = { formula: 'D2-E3', result: posSum - bankSum };

  styleHeaderRow(summary.getRow(HEADER_ROW));
  committed.forEach((row, index) => {
    writeLedgerRowAt(summary, FIRST_DATA_ROW + index, row);
  });

  const staging = wb.addWorksheet(STAGING_SHEET);
  staging.columns = summary.columns;
  staging.getRow(1).values = ['AI_Staging Queue (Requires 1-Tap Manager Sign-Off Before Master Commit)'];
  staging.getRow(1).getCell(1).font = { bold: true, size: 12 };
  styleHeaderRow(staging.getRow(HEADER_ROW));
  (tenant.workbook.stagingRows ?? []).forEach((row, index) => {
    writeLedgerRowAt(staging, FIRST_DATA_ROW + index, row);
  });

  await wb.xlsx.writeFile(filePath);
  return readFileSync(filePath);
}

export async function resetTenantWorkbook(tenantId: string, baseDir?: string): Promise<WorkbookPreviewState> {
  return ensureSeedWorkbook(tenantId, baseDir, true);
}
