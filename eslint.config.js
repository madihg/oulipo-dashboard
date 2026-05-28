import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import vuePlugin from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".vite/**",
      "dev-dist/**",
      "**/*.vue.js",
      "**/*.vue.ts",
    ],
  },
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
      globals: { ...globals.browser, ...globals.node, ...globals.es2022 },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...js.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-unused-vars": "off",
      // TypeScript covers undefined-identifier checking; ESLint's no-undef
      // trips on Volar's internal __VLS_* template artifacts in .vue files.
      "no-undef": "off",
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: { ...globals.browser, ...globals.es2022 },
    },
    plugins: { vue: vuePlugin, "@typescript-eslint": tsPlugin },
    rules: {
      ...vuePlugin.configs["flat/recommended"][2].rules,
      "vue/multi-word-component-names": "off",
      // TypeScript handles undefined identifier checking in Vue files;
      // ESLint's no-undef trips on Volar's internal __VLS_* template artifacts.
      "no-undef": "off",
    },
  },
];
