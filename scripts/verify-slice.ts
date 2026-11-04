// Reads locally; prints only aggregate verification results, never customer metadata/references.
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { readStatement } from "../src/lib/statement-files";
import { MAX_BYTES } from "../src/lib/statements";
const path = process.argv[2];
if (!path) {
  console.error(
    "Usage: npm run verify:slice -- private-statements/your-statement.xlsx",
  );
  process.exitCode = 1;
} else {
  try {
    if ((await stat(path)).size > MAX_BYTES)
      throw new Error("File exceeds 2 MB.");
    const data = await readStatement(
      new File([await readFile(path)], "statement" + extname(path)),
    );
    if (!data.slice) throw new Error("Slice header not detected.");
    const s = data.slice;
    console.log(
      JSON.stringify(
        {
          transactions: s.count,
          from: s.from,
          to: s.to,
          openingINR: (s.opening / 100).toFixed(2),
          closingINR: (s.closing / 100).toFixed(2),
          incomingINR: (s.incoming / 100).toFixed(2),
          outgoingINR: (s.outgoing / 100).toFixed(2),
          balanceChecksPassed: s.errors.length === 0,
          errors: s.errors,
        },
        null,
        2,
      ),
    );
    if (s.errors.length) process.exitCode = 1;
  } catch (e) {
    console.error(
      e instanceof Error && !("code" in e)
        ? e.message
        : "Could not read the local statement file.",
    );
    process.exitCode = 1;
  }
}
