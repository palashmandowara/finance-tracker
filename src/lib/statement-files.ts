import { inflateRawSync } from "node:zlib";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { analyseSlice, sliceHeader, SLICE_MAX_ROWS } from "./slice";
import { MAX_BYTES, MAX_ROWS } from "./statements";
// Bound the ZIP's declared expansion before ExcelJS inflates it. Reject ZIP64.
function checkZip(data: Buffer) {
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (data.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("Invalid XLSX ZIP");
  const count = data.readUInt16LE(end + 10),
    offset = data.readUInt32LE(end + 16);
  if (count > 200 || count === 65535)
    throw new Error("Workbook is too complex");
  let pos = offset,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > data.length || data.readUInt32LE(pos) !== 0x02014b50)
      throw new Error("Invalid workbook directory");
    const expected = data.readUInt32LE(pos + 24),
      compressed = data.readUInt32LE(pos + 20),
      local = data.readUInt32LE(pos + 42),
      method = data.readUInt16LE(pos + 10);
    if (data.readUInt16LE(pos + 8) & 1)
      throw new Error("Encrypted workbooks are not supported");
    if (local + 30 > data.length || data.readUInt32LE(local) !== 0x04034b50)
      throw new Error("Invalid ZIP entry");
    const start =
      local +
      30 +
      data.readUInt16LE(local + 26) +
      data.readUInt16LE(local + 28);
    if (start + compressed > data.length || expected > 20 * 1024 * 1024 - total)
      throw new Error("Expanded workbook exceeds limit");
    const bytes = data.subarray(start, start + compressed);
    const expanded =
      method === 0
        ? bytes
        : method === 8
          ? inflateRawSync(bytes, {
              maxOutputLength: Math.max(1, 20 * 1024 * 1024 - total),
            })
          : null;
    if (!expanded || expanded.length !== expected)
      throw new Error("Invalid or unsupported ZIP compression");
    total += expanded.length;
    if (total > 20 * 1024 * 1024)
      throw new Error("Expanded workbook exceeds 20 MB");
    pos +=
      46 +
      data.readUInt16LE(pos + 28) +
      data.readUInt16LE(pos + 30) +
      data.readUInt16LE(pos + 32);
  }
}
export async function readStatement(file: File) {
  if (!file.size || file.size > MAX_BYTES)
    throw new Error("Use a non-empty CSV or XLSX file up to 2 MB.");
  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: string[][] = [];
  if (file.name.toLowerCase().endsWith(".csv")) {
    rows = parse(buffer.toString("utf8"), {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      max_record_size: 16000,
    });
  } else if (file.name.toLowerCase().endsWith(".xlsx")) {
    checkZip(buffer);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    if (book.worksheets.length !== 1 && !book.getWorksheet("Statement"))
      throw new Error("Use a workbook with exactly one worksheet.");
    const sheet = book.getWorksheet("Statement") ?? book.worksheets[0];
    if (sheet.rowCount > SLICE_MAX_ROWS + 200 || sheet.columnCount > 40)
      throw new Error("Limit: 500 data rows and 40 columns.");
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      for (let i = 1; i <= Math.max(sheet.columnCount, 1); i++) {
        const cell = row.getCell(i);
        const v = cell.value;
        if (v instanceof Date) cells.push(v.toISOString().slice(0, 10));
        else if (typeof v === "number" && Math.abs(v) > Number.MAX_SAFE_INTEGER)
          cells.push("[Unsafe numeric reference: use text cells]");
        else if (v && typeof v === "object")
          cells.push("[Unsupported formula or rich cell]");
        else cells.push(v == null ? "" : String(v));
      }
      rows.push(cells);
    });
  } else throw new Error("Only .csv and .xlsx files are supported.");
  if (rows.length <= SLICE_MAX_ROWS + 200 && sliceHeader(rows) >= 0) {
    if (rows.some((r) => r.length > 40 || r.some((c) => c.length > 500)))
      throw new Error("Slice limit: 40 columns, 500 characters per cell.");
    const slice = analyseSlice(rows);
    return { headers: [], rows: [], slice };
  }
  if (
    rows.length < 2 ||
    rows.length > MAX_ROWS + 1 ||
    rows.some((r) => r.length > 40 || r.some((c) => c.length > 500))
  )
    throw new Error(
      "Use a header row plus 1–500 rows, at most 40 columns and 500 characters per cell.",
    );
  return {
    headers: rows[0].map((v, i) => v || "Column " + (i + 1)),
    rows: rows.slice(1),
  };
}
