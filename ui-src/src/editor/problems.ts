import { findNodeAtLocation, parseTree, type ParseError, printParseErrorCode, parse } from 'jsonc-parser'
import type { BuildResult, Diagnostic, KvsProblem } from '@contract'

/** A problem to show in the editor (as a marker) and in the problems list. Lines are 1-based. */
export interface Problem {
  severity: 'error' | 'warning' | 'info'
  message: string
  line: number | null
  column?: number | null
}

export function buildProblems(build: BuildResult): Problem[] {
  return [
    ...build.errors.map(e => ({ severity: 'error' as const, message: e.message, line: e.line, column: e.column })),
    ...build.warnings.map(w => ({ severity: 'warning' as const, message: w.message, line: w.line, column: w.column })),
  ]
}

export const kvsProblems = (problems: KvsProblem[]): Problem[] =>
  problems.map(p => ({ severity: p.severity, message: p.message, line: null }))

/** 1-based line and column of an offset in text. */
export function positionOf(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset)
  const line = before.split('\n').length
  return { line, column: offset - before.lastIndexOf('\n') }
}

const decodePointer = (pointer: string): (string | number)[] =>
  pointer.split('/').slice(1).map(s => s.replace(/~1/g, '/').replace(/~0/g, '~')).map(s => (/^\d+$/.test(s) ? Number(s) : s))

/**
 * Places manifest diagnostics (JSON pointers) in the text: on the property they name, or on the
 * closest parent that exists (a missing field is reported where it belongs).
 */
export function manifestProblems(text: string, diagnostics: Diagnostic[]): Problem[] {
  const tree = parseTree(text)
  return diagnostics.map(d => {
    let path = decodePointer(d.path)
    let node = tree ? findNodeAtLocation(tree, path) : undefined
    while (!node && path.length > 0 && tree) {
      path = path.slice(0, -1)
      node = findNodeAtLocation(tree, path)
    }
    // Point at the property name rather than the value, when there is one
    const target = node?.parent?.type === 'property' ? node.parent : node
    const pos = target ? positionOf(text, target.offset) : null
    return { severity: d.severity, message: d.message, line: pos?.line ?? null, column: pos?.column ?? null }
  })
}

/** Parses JSON, or returns the first syntax error as a problem. */
export function parseJson(text: string): { value: unknown; problem: null } | { value: null; problem: Problem } {
  const errors: ParseError[] = []
  const value = parse(text, errors, { allowTrailingComma: false, disallowComments: true })
  if (errors.length === 0) return { value, problem: null }
  const pos = positionOf(text, errors[0].offset)
  return { value: null, problem: { severity: 'error', message: `Invalid JSON: ${printParseErrorCode(errors[0].error)}`, line: pos.line, column: pos.column } }
}
