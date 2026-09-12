import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/",
      "test-results/",
      "playwright-report/",
      ".lighthouseci/",
      "dist/"
    ]
  },
  {
    files: ["js/**/*.js", "portfolio/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        lucide: "readonly",
        rgStorage: "writable",
        rgTheme: "writable",
        setupAccessibleModal: "readonly",
        isPwaDismissed: "readonly",
        dismissPwa: "readonly"
      }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "caughtErrors": "none" }],
      "no-unreachable": "error",
      "no-constant-condition": "warn"
    }
  },
  {
    files: ["sw.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.serviceworker
      }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
    }
  },
  {
    files: ["tests/**/*.js", "*.config.js", "*.config.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
    }
  }
];
