// OFX/CSV bank statement parsing (FUNCOES-A-IMPLEMENTAR.md section 3).
// Open Finance is out of scope; this is the "import a file the bank gives you" fallback.
import { normalizeText } from "./calc";

export interface ParsedTransaction {
  date: string; // YYYY-MM-DD
  amount: number; // always positive
  type: "income" | "expense";
  description: string;
  fitId?: string;
}

export interface ExistingFingerprint {
  fitId?: string;
  date: string;
  amount: number;
  name: string;
}

function fingerprint(date: string, amount: number, description: string): string {
  return `${date}|${amount.toFixed(2)}|${normalizeText(description)}`;
}

/** True if this parsed transaction matches something already in the ledger. */
export function isDuplicate(tx: ParsedTransaction, existing: ExistingFingerprint[]): boolean {
  return existing.some((item) => {
    if (tx.fitId && item.fitId) return tx.fitId === item.fitId;
    return (
      fingerprint(tx.date, tx.amount, tx.description) ===
      fingerprint(item.date, item.amount, item.name)
    );
  });
}

export function parseOfx(text: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const block of blocks) {
    const body = block.split(/<\/STMTTRN>/i)[0];
    const amountRaw = extractOfxTag(body, "TRNAMT");
    const dateRaw = extractOfxTag(body, "DTPOSTED");
    const memo =
      extractOfxTag(body, "MEMO") || extractOfxTag(body, "NAME") || "Lançamento importado";
    const fitId = extractOfxTag(body, "FITID") || undefined;
    if (!amountRaw || !dateRaw) continue;

    const amount = Number(amountRaw.replace(",", "."));
    if (!Number.isFinite(amount) || amount === 0) continue;

    const date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
    transactions.push({
      date,
      amount: Math.abs(amount),
      type: amount < 0 ? "expense" : "income",
      description: memo.trim(),
      fitId,
    });
  }
  return transactions;
}

function extractOfxTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, "i"));
  return match ? match[1].trim() : "";
}

/** Thrown when a CSV can't be parsed safely — ambiguous delimiter or a row whose
 *  column count doesn't match the header. Never silently truncates a value instead. */
export class CsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvFormatError";
  }
}

const CSV_DELIMITERS = [",", ";"] as const;
const DATE_HEADERS = ["data", "date"];
const AMOUNT_HEADERS = ["valor", "amount"];
const DESC_HEADERS = ["descricao", "historico", "description"];

/**
 * Splits one CSV line into cells, honoring RFC 4180 quoting: a field starting
 * with `"` runs until the next unescaped `"`, `""` inside a quoted field is a
 * literal quote, and a delimiter inside quotes is part of the value — not a
 * column break. This is what lets a quoted "1.234,56" survive a comma-delimited
 * file instead of being split into "1.234" + "56".
 */
function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' && current === "") {
      inQuotes = true;
      continue;
    }
    if (char === delimiter) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function matchCsvHeaders(headerCells: string[]): {
  dateIndex: number;
  amountIndex: number;
  descIndex: number;
} {
  const headers = headerCells.map((cell) => normalizeText(cell));
  return {
    dateIndex: headers.findIndex((h) => DATE_HEADERS.includes(h)),
    amountIndex: headers.findIndex((h) => AMOUNT_HEADERS.includes(h)),
    descIndex: headers.findIndex((h) => DESC_HEADERS.includes(h)),
  };
}

export function parseCsv(text: string): ParsedTransaction[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  // Try every candidate delimiter and keep only the ones whose header row
  // actually resolves a date + amount column — never guess by counting
  // characters. If more than one delimiter looks valid, the file is
  // structurally ambiguous and we refuse to pick one silently.
  const viable = CSV_DELIMITERS.map((delimiter) => {
    const headerCells = splitCsvLine(lines[0], delimiter);
    return { delimiter, headerCells, ...matchCsvHeaders(headerCells) };
  }).filter((candidate) => candidate.dateIndex >= 0 && candidate.amountIndex >= 0);

  if (viable.length === 0) return [];
  if (viable.length > 1) {
    throw new CsvFormatError(
      "Não consegui identificar com segurança o separador deste CSV (vírgula ou ponto e vírgula). Confira o arquivo.",
    );
  }
  const { delimiter, headerCells, dateIndex, amountIndex, descIndex } = viable[0];
  const expectedColumns = headerCells.length;

  const transactions: ParsedTransaction[] = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = splitCsvLine(lines[lineIndex], delimiter);
    if (cells.length !== expectedColumns) {
      throw new CsvFormatError(
        `Linha ${lineIndex + 1} do CSV tem um número de colunas diferente do cabeçalho — confira se os valores decimais com milhar estão entre aspas (ex.: "1.234,56").`,
      );
    }
    const rawAmount = cells[amountIndex] || "";
    const amount = parseBrazilianAmount(rawAmount);
    const date = normalizeCsvDate(cells[dateIndex] || "");
    if (!date || !Number.isFinite(amount) || amount === 0) continue;

    transactions.push({
      date,
      amount: Math.abs(amount),
      type: amount < 0 ? "expense" : "income",
      description: (cells[descIndex] || "Lançamento importado").trim(),
    });
  }
  return transactions;
}

function parseBrazilianAmount(value: string): number {
  const clean = value.replace(/[^\d,.-]/g, "");
  if (!clean) return NaN;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  return Number(normalized);
}

function normalizeCsvDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const [, d, m, y] = match;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}
