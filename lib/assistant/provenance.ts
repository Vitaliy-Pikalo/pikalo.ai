/**
 * Number provenance guardrail.
 *
 * Every quantity in an assistant answer must appear in one of its sources:
 * a tool result, a retrieved IRS passage, or the user's own question. If any
 * number can't be traced, the answer is blocked. This is the rule that keeps
 * the model from inventing dollar amounts, limits or thresholds.
 *
 * Identifiers are not quantities and are ignored: form numbers ("Form 843",
 * "1040-NR"), publications ("Pub 519"), code sections ("3121(b)(19)"),
 * tax years (1990–2099), list markers ("1.", "4)") and citations ("[4]").
 */

export interface ExtractedNumber {
  raw: string;
  value: number;
  /** "percent" values are compared both as-is and as a fraction (7.65% ≈ 0.0765). */
  kind: "money" | "percent" | "fraction" | "plain";
  index: number;
}

const ALWAYS_ALLOWED = new Set([0, 1, 2]);

// Words that make the following number an identifier, not a quantity.
const ID_PREFIX =
  /(form|forms|pub\.?|publication|section|sec\.|§|schedule|line|box|boxes|question|article|title|chapter|worksheet|part|step|i-|ds-|f-|j-|m-|h-|w-)\s*$/i;

const NUMBER_RE =
  /(\$\s?)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(\s?\/\s?\d+)?(\s?%)?/g;

export function extractNumbers(text: string): ExtractedNumber[] {
  const out: ExtractedNumber[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const [raw, dollar, digits, fraction, percent] = m;
    const index = m.index ?? 0;
    const before = text.slice(Math.max(0, index - 14), index);
    const after = text.slice(index + raw.length, index + raw.length + 3);

    // Part of a longer token (e.g. "1040-NR", "3121(b)", "W-2", "F-1").
    if (/[A-Za-z(-]$/.test(before) && !dollar) continue;
    if (/^(-[A-Za-z]|\()/.test(after) && !dollar && !percent) continue;
    if (ID_PREFIX.test(before) && !dollar && !percent) continue;
    // Citation markers: "[4]" points at a source, it isn't a quantity.
    if (/\[$/.test(before) && /^\]/.test(after)) continue;
    // Numbered list markers at the start of a line: "4.", "4)", "**4.**",
    // "- 4.", "### 4." (models format lists all of these ways).
    if (
      /(^|\n)[\s*#>-]*$/.test(before) &&
      /^(\.|\))(\*\*)?(\s|$)/.test(after) &&
      !dollar &&
      !percent
    )
      continue;

    if (fraction) {
      out.push({ raw: raw.trim(), value: NaN, kind: "fraction", index });
      continue;
    }

    const value = Number(digits.replace(/,/g, ""));
    if (
      !dollar &&
      !percent &&
      Number.isInteger(value) &&
      value >= 1990 &&
      value <= 2099
    ) {
      continue; // tax year
    }
    out.push({
      raw: raw.trim(),
      value,
      kind: dollar ? "money" : percent ? "percent" : "plain",
      index,
    });
  }
  return out;
}

const close = (a: number, b: number) =>
  Math.abs(a - b) < 0.005 * Math.max(1, Math.abs(b));

function sourceValues(sources: string[]): { values: number[]; fractions: Set<string> } {
  const values: number[] = [];
  const fractions = new Set<string>();
  for (const s of sources) {
    for (const m of s.matchAll(NUMBER_RE)) {
      const [raw, , digits, fraction] = m;
      if (fraction) {
        fractions.add(raw.replace(/\s/g, ""));
        continue;
      }
      values.push(Number(digits.replace(/,/g, "")));
    }
  }
  return { values, fractions };
}

export interface ProvenanceResult {
  ok: boolean;
  unsupported: ExtractedNumber[];
}

export function checkProvenance(
  answer: string,
  sources: string[],
  question = "",
): ProvenanceResult {
  const { values, fractions } = sourceValues([...sources, question]);
  const unsupported = extractNumbers(answer).filter((n) => {
    if (n.kind === "fraction") return !fractions.has(n.raw.replace(/\s/g, ""));
    if (ALWAYS_ALLOWED.has(n.value)) return false;
    if (values.some((v) => close(v, n.value))) return false;
    // "7.65%" may be stored as 0.0765 in a tool result.
    if (n.kind === "percent" && values.some((v) => close(v * 100, n.value))) return false;
    return true;
  });
  return { ok: unsupported.length === 0, unsupported };
}
