import { describe, expect, test } from 'vitest'
import { manifestProblems, parseJson, positionOf } from './problems'

const text = `{
  "version": 1,
  "name": "shop",
  "origins": [
    { "id": "web", "type": "local", "path": "origins/www" }
  ],
  "defaultBehavior": { "origin": "nope" }
}`

describe('problems', () => {
  test('positions are 1-based lines and columns', () => {
    expect(positionOf('ab\ncd', 4)).toEqual({ line: 2, column: 2 })
  })

  test('a diagnostic lands on the property its JSON pointer names', () => {
    const [p] = manifestProblems(text, [{ severity: 'error', path: '/defaultBehavior/origin', rule: 'unknown-origin', message: 'No origin with id "nope"' }])
    expect(p).toMatchObject({ severity: 'error', line: 7, message: 'No origin with id "nope"' })
    const [q] = manifestProblems(text, [{ severity: 'error', path: '/origins/0/path', rule: 'path-missing', message: 'missing' }])
    expect(q.line).toBe(5)
  })

  test('a missing field is reported on its closest existing parent; escaped pointers work', () => {
    const [p] = manifestProblems(text, [{ severity: 'error', path: '/defaultBehavior/functions/viewer-request', rule: 'x', message: 'm' }])
    expect(p.line).toBe(7)
    const [root] = manifestProblems(text, [{ severity: 'error', path: '', rule: 'x', message: 'm' }])
    expect(root.line).toBe(1)
    const withSlash = '{\n  "behaviors": [\n    { "pathPattern": "/a/*" }\n  ]\n}'
    const [b] = manifestProblems(withSlash, [{ severity: 'error', path: '/behaviors/0/pathPattern', rule: 'x', message: 'm' }])
    expect(b.line).toBe(3)
  })

  test('JSON syntax errors become a problem with its position', () => {
    expect(parseJson('{"a": 1}')).toEqual({ value: { a: 1 }, problem: null })
    const bad = parseJson('{\n  "a": 1,\n}')
    expect(bad.problem).toMatchObject({ severity: 'error', line: 3 })
  })
})
