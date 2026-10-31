import Ajv from 'ajv';
import type { CodeContext } from '@codeaudit/contracts';
export const validateCodeContext = new Ajv({ strict: true }).compile<CodeContext>({
  type: 'object', additionalProperties: false, required: ['schemaVersion', 'truncated', 'snippets'],
  properties: { schemaVersion: { const: 1 }, truncated: { type: 'boolean' }, snippets: { type: 'array', maxItems: 100, items: {
    type: 'object', additionalProperties: false, required: ['filePath', 'lines'], properties: {
      filePath: { type: 'string', minLength: 1, maxLength: 4096 }, lines: { type: 'array', maxItems: 700, items: {
        type: 'object', additionalProperties: false, required: ['number', 'text', 'truncated'], properties: {
          number: { type: 'integer', minimum: 1 }, text: { type: 'string', maxLength: 500 }, truncated: { type: 'boolean' },
        },
      } },
    },
  } } },
});
