import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import sonarjs from "eslint-plugin-sonarjs";

// eslint-plugin-sonarjs console.debugs every dependency it reads.
console.debug = () => {};

const root = fileURLToPath(new URL(".", import.meta.url));

export default [
  { ignores: ["dist/**", "coverage/**", ".pack/**"] },
  js.configs.recommended,
  ...tsPlugin.configs["flat/recommended"],
  sonarjs.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: root },
    },
    rules: {
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/return-await": ["warn", "in-try-catch"],
      "@typescript-eslint/prefer-optional-chain": "warn",
      "sonarjs/no-unused-vars": "off",
    },
  },
  {
    files: ["**/*.test.ts", "**/__simulators__/**"],
    rules: { "sonarjs/no-hardcoded-passwords": "off" },
  },
];
