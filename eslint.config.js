import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import notice from "./eslint-rules/notice.js";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/playwright-report/**", "**/test-results/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks, local: { rules: { notice } } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "local/notice": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.config.{js,ts}", "e2e/**/*.ts", "scripts/**"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["**/public/*.js"],
    languageOptions: { globals: { ...globals.browser } },
  },
);
