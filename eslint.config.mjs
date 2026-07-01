import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Reference copy of the original vanilla app — not part of the Next build.
    "legacy/**",
    // Node CLI (CommonJS); adapted to launch Next in a later step.
    "bin/**",
  ]),
  {
    // The block editor is an imperative contentEditable engine: it mirrors
    // props into refs and syncs DOM/caret state inside effects on purpose.
    // The new react-hooks/react-compiler rules flag these intentional,
    // verified-safe patterns, so keep them as warnings rather than errors.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);

export default eslintConfig;
