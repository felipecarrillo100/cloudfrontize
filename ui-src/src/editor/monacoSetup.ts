// Only what the editor needs: the core, its standard features, JavaScript and JSON (not the ~80
// other languages, which would add megabytes to the package)
import * as api from 'monaco-editor/editor/editor.api'
import 'monaco-editor/features/register.all'
import 'monaco-editor/languages/definitions/javascript/register'
import * as typescript from 'monaco-editor/languages/features/typescript/register'
import * as json from 'monaco-editor/languages/features/json/register'
import { loader } from '@monaco-editor/react'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import TsWorker from 'monaco-editor/languages/features/typescript/ts.worker?worker'
import JsonWorker from 'monaco-editor/languages/features/json/json.worker?worker'
import manifestSchema from '../../../schema/cloudfrontize.schema.json'
import { EDGE_TYPES } from './edgeTypes'

/**
 * Monaco is bundled with the WebUI (never loaded from a CDN), so the editor works offline and the
 * page sends nothing anywhere. This module is loaded lazily, with the editor.
 */
self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === 'json') return new JsonWorker()
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    return new EditorWorker()
  },
}
const monaco = { ...api, typescript, json }
loader.config({ monaco: monaco as unknown as typeof import('monaco-editor') })

// Function code: modern JavaScript, CommonJS for Lambda@Edge, no DOM; CloudFront's event types
monaco.typescript.javascriptDefaults.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ESNext,
  allowJs: true,
  allowNonTsExtensions: true,
  checkJs: false,
  lib: ['es2022'],
  module: monaco.typescript.ModuleKind.CommonJS,
})
monaco.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false })
monaco.typescript.javascriptDefaults.addExtraLib(EDGE_TYPES, 'ts:cloudfrontize/edge.d.ts')

// The key value store file format AWS imports ("File format for key-value pairs")
const kvsSchema = {
  type: 'object',
  required: ['data'],
  properties: {
    data: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'value'],
        additionalProperties: false,
        properties: {
          key: { type: 'string', minLength: 1, maxLength: 512, description: 'Up to 512 characters' },
          value: { type: 'string', maxLength: 1024, description: 'Up to 1,024 characters' },
        },
      },
    },
  },
}

monaco.json.jsonDefaults.setDiagnosticsOptions({
  validate: true,
  allowComments: false,
  schemas: [
    { uri: 'cloudfrontize://schema/manifest.json', fileMatch: ['*/cloudfrontize.json'], schema: manifestSchema },
    { uri: 'cloudfrontize://schema/kvs.json', fileMatch: ['*/kvs-store/*'], schema: kvsSchema },
  ],
})

export { monaco }
