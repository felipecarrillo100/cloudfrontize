import { describe, expect, test } from 'vitest'
import { applyPreset, headerProblems, isCloudFrontAdded, parseHeaders, serializeHeaders } from './viewerHeaders'

describe('viewer headers file', () => {
  test('reads both forms the server accepts', () => {
    expect(parseHeaders('{"X-A": "1"}')).toEqual([{ key: 'X-A', value: '1', target: 'request' }])
    expect(parseHeaders('{"RequestHeaders": {"X-A": "1"}, "responseHeaders": {"X-B": "2"}}')).toEqual([
      { key: 'X-A', value: '1', target: 'request' },
      { key: 'X-B', value: '2', target: 'response' },
    ])
    expect(parseHeaders(null)).toEqual([])
  })

  test('writes the simple form unless there are response headers', () => {
    expect(serializeHeaders([{ key: 'X-A', value: '1', target: 'request' }])).toBe('{\n  "X-A": "1"\n}\n')
    expect(JSON.parse(serializeHeaders([{ key: 'X-A', value: '1', target: 'request' }, { key: 'X-B', value: '2', target: 'response' }])))
      .toEqual({ requestHeaders: { 'X-A': '1' }, responseHeaders: { 'X-B': '2' } })
  })

  test('round-trips', () => {
    const content = '{\n  "requestHeaders": {\n    "CloudFront-Viewer-Country": "FR"\n  },\n  "responseHeaders": {\n    "Cache-Control": "no-store"\n  }\n}\n'
    expect(serializeHeaders(parseHeaders(content))).toBe(content)
  })

  test('flags empty, invalid and repeated names', () => {
    expect(headerProblems([{ key: '', value: '', target: 'request' }])).toEqual(['A header has no name'])
    expect(headerProblems([{ key: 'Bad Name', value: '', target: 'request' }])).toEqual(['"Bad Name" isn\'t a valid header name'])
    expect(headerProblems([{ key: 'X-A', value: '1', target: 'request' }, { key: 'x-a', value: '2', target: 'request' }])).toEqual(['x-a is listed twice'])
    expect(headerProblems([{ key: 'X-A', value: '1', target: 'request' }, { key: 'X-A', value: '2', target: 'response' }])).toEqual([])
  })

  test('presets replace the same headers; device presets clear the other device flags', () => {
    const rows = applyPreset([
      { key: 'cloudfront-viewer-country', value: 'US', target: 'request' },
      { key: 'CloudFront-Is-Tablet-Viewer', value: 'true', target: 'request' },
      { key: 'X-Keep', value: 'yes', target: 'request' },
    ], { 'CloudFront-Is-Mobile-Viewer': 'true' }, 'cloudfront-is-')
    expect(rows.map(r => r.key)).toEqual(['cloudfront-viewer-country', 'X-Keep', 'CloudFront-Is-Mobile-Viewer'])
  })

  test('knows which headers CloudFront adds', () => {
    expect(isCloudFrontAdded('CloudFront-Viewer-Country')).toBe(true)
    expect(isCloudFrontAdded('X-Custom')).toBe(false)
  })
})
