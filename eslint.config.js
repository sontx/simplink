import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/*.gen.ts"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: { "@stylistic": stylistic },
    languageOptions: { globals: globals.node },
    rules: {
      "@stylistic/padding-line-between-statements": [
        "error",
        {
          blankLine: "always",
          prev: ["class", "function", "type", "interface", "export"],
          next: ["class", "function", "type", "interface", "export"],
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-expressions": [
        "error",
        { allowShortCircuit: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true },
      ],
    },
  },
);
