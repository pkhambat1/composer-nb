import js from "@eslint/js"
import globals from "globals"
import react from "eslint-plugin-react"
import reactHooks from "eslint-plugin-react-hooks"
import stylistic from "@stylistic/eslint-plugin"
import tseslint from "typescript-eslint"

const sharedStylistic = {
  semi: "off",
  "@stylistic/semi": ["error", "never"],
  "no-multiple-empty-lines": ["error", { max: 1, maxBOF: 0, maxEOF: 0 }],
}

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      "**/node_modules",
      "**/dist",
      "dsl/lib",
      "mcp/lib",
      ".git",
      ".claude",
      "dsl/python",
      "mcp/src/reference.ts",
    ],
  },
  {
    files: ["**/*.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
    plugins: { "@stylistic": stylistic },
    rules: {
      ...js.configs.recommended.rules,
      ...sharedStylistic,
    },
  },
  {
    files: ["mcp/**/*.js", "api/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
    plugins: { "@stylistic": stylistic },
    rules: {
      ...js.configs.recommended.rules,
      ...sharedStylistic,
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The playground, and the MCP App's page, which holds the playground in the host's frame:
    // React in TypeScript, in a browser. tsc checks their types (npm run typecheck).
    files: ["playground/src/**/*.{ts,tsx}", "mcp/app/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "@typescript-eslint": tseslint.plugin,
      "@stylistic": stylistic,
    },
    settings: { react: { version: "18.3" } },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.eslintRecommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...sharedStylistic,
      // A component used in JSX counts as used
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // The TypeScript: the engine, which runs in a browser, and the MCP server and the Vercel
    // functions, which run in Node. tsc checks their types (npm run typecheck); this checks
    // the rest, as for the JavaScript beside them.
    files: [
      "dsl/js/**/*.ts",
      "mcp/src/**/*.ts",
      "mcp/scripts/**/*.ts",
      "api/**/*.ts",
      "playground/scripts/**/*.ts",
    ],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "@typescript-eslint": tseslint.plugin, "@stylistic": stylistic },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.eslintRecommended.rules,
      ...sharedStylistic,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
]
