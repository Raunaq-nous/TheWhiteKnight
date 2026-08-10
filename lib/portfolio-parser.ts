// Deterministic TypeScript source parser for the portfolio repo's data
// files (src/data/builds.ts, battles.ts). Uses the TypeScript compiler's
// own AST (already a project dependency) to read exported object/array
// literals as plain data — it never executes the fetched source (no eval,
// no vm, no Function constructor). That matters here specifically because
// this file's content comes from a GitHub repo over the network; parsing
// the AST for literal values is exactly as safe as parsing JSON, whereas
// executing arbitrary fetched TS/JS would not be, portfolio-owned or not.
//
// Only literal shapes are understood: string/template literals, numbers,
// booleans, arrays, and object literals. Anything else (a function call, a
// spread, an imported constant) is skipped for that key — safe, since the
// mapping layer (lib/portfolio-sync.ts) treats every field as optional and
// falls back gracefully.

import ts from "typescript";

export type ParsedLiteral = string | number | boolean | null | ParsedLiteral[] | { [key: string]: ParsedLiteral };

function literalToValue(node: ts.Node): ParsedLiteral | undefined {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isTemplateExpression(node)) {
    // Best-effort: join literal spans, drop ${...} interpolations (can't
    // resolve them without executing code) rather than guess at them.
    return node.head.text + node.templateSpans.map(s => s.literal.text).join("");
  }
  if (ts.isArrayLiteralExpression(node)) {
    const out: ParsedLiteral[] = [];
    for (const el of node.elements) {
      const v = literalToValue(el);
      if (v !== undefined) out.push(v);
    }
    return out;
  }
  if (ts.isObjectLiteralExpression(node)) {
    const out: { [key: string]: ParsedLiteral } = {};
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) continue; // skip shorthand/spread/methods — not used in plain data files
      const key = prop.name.getText().replace(/^["']|["']$/g, "");
      const v = literalToValue(prop.initializer);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    return literalToValue(node.expression);
  }
  return undefined; // function call, identifier reference, spread, etc. — not a literal we can read safely
}

function findExportedInitializer(source: ts.SourceFile, exportName: string): ts.Expression | null {
  let found: ts.Expression | null = null;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isVariableStatement(node)) {
      const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
      if (isExported) {
        for (const decl of node.declarationList.declarations) {
          if (decl.name.getText() === exportName && decl.initializer) {
            found = decl.initializer;
            return;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Parses `export const <exportName> = [...]` into plain objects. Returns [] if not found or not an array literal. */
export function parseExportedArray(sourceText: string, exportName: string): Record<string, ParsedLiteral>[] {
  const source = ts.createSourceFile("portfolio.ts", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const init = findExportedInitializer(source, exportName);
  if (!init) return [];
  const value = literalToValue(init);
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is { [key: string]: ParsedLiteral } => typeof v === "object" && v !== null && !Array.isArray(v));
}

/** Parses `export const <exportName> = {...}` into a plain object. Returns null if not found or not an object literal. */
export function parseExportedObject(sourceText: string, exportName: string): Record<string, ParsedLiteral> | null {
  const source = ts.createSourceFile("portfolio.ts", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const init = findExportedInitializer(source, exportName);
  if (!init) return null;
  const value = literalToValue(init);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value;
}
