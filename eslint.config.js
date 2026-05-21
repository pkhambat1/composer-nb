import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import stylistic from "@stylistic/eslint-plugin"

const sharedStylistic = {
  semi: "off",
  "@stylistic/semi": ["error", "never"],
  "no-multiple-empty-lines": ["error", { max: 1, maxBOF: 0, maxEOF: 0 }],
}

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ["node_modules", "dist", ".git"] },
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
    files: ["**/*.{js,jsx}"],
    ignores: ["**/*.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        React: "readonly",
        ReactDOM: "readonly",
        Tone: "readonly",
        WaveSurfer: "readonly",
        Tonal: "readonly",
        marked: "readonly",
        ChordLookup: "readonly",
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "@stylistic": stylistic,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...sharedStylistic,
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["notebook.jsx"],
    languageOptions: {
      globals: {
        useTweaks: "readonly",
      },
    },
  },
]
