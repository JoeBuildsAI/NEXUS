/**
 * Minimal, robust parser for Valve KeyValues (VDF/ACF) text files.
 * Handles nested blocks, quoted keys/values, escaped quotes, `//` comments,
 * unquoted tokens, and tolerates malformed input by returning what parsed.
 */
export type VdfValue = string | VdfObject;
export interface VdfObject {
  [key: string]: VdfValue;
}

export function parseVdf(text: string): VdfObject {
  const tokens = tokenize(text);
  let i = 0;

  const parseBlock = (): VdfObject => {
    const obj: VdfObject = {};
    while (i < tokens.length) {
      const t = tokens[i]!;
      if (t.type === "close") {
        i++;
        return obj;
      }
      if (t.type === "open") {
        // stray brace — skip
        i++;
        continue;
      }
      const key = t.value;
      i++;
      const next = tokens[i];
      if (!next) break;
      if (next.type === "open") {
        i++;
        obj[key] = parseBlock();
      } else if (next.type === "string") {
        i++;
        obj[key] = next.value;
      } else {
        // key with no value (malformed) — skip
        i++;
      }
    }
    return obj;
  };

  return parseBlock();
}

interface Token {
  type: "string" | "open" | "close";
  value: string;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i]!;
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (c === "{") {
      out.push({ type: "open", value: "{" });
      i++;
      continue;
    }
    if (c === "}") {
      out.push({ type: "close", value: "}" });
      i++;
      continue;
    }
    if (c === '"') {
      i++;
      let s = "";
      while (i < n && text[i] !== '"') {
        if (text[i] === "\\" && i + 1 < n) {
          const e = text[i + 1]!;
          s += e === "n" ? "\n" : e === "t" ? "\t" : e;
          i += 2;
        } else {
          s += text[i];
          i++;
        }
      }
      i++; // closing quote (may be missing at EOF)
      out.push({ type: "string", value: s });
      continue;
    }
    // unquoted token
    let s = "";
    while (i < n && !/[\s{}"]/.test(text[i]!)) {
      s += text[i];
      i++;
    }
    if (s) out.push({ type: "string", value: s });
  }
  return out;
}

/** Case-insensitive lookup helper. */
export function vdfGet(obj: VdfObject | undefined, key: string): VdfValue | undefined {
  if (!obj) return undefined;
  if (key in obj) return obj[key];
  const lk = key.toLowerCase();
  for (const k of Object.keys(obj)) if (k.toLowerCase() === lk) return obj[k];
  return undefined;
}

export function vdfString(obj: VdfObject | undefined, key: string): string | undefined {
  const v = vdfGet(obj, key);
  return typeof v === "string" ? v : undefined;
}

export function vdfObject(obj: VdfObject | undefined, key: string): VdfObject | undefined {
  const v = vdfGet(obj, key);
  return v && typeof v === "object" ? v : undefined;
}
