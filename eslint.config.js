const eslint = require('@eslint/js')
const tseslint = require('typescript-eslint')
const prettierConfig = require('eslint-config-prettier')

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    ignores: ['dist/', 'node_modules/'],
  },
)
