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
  ]),
  {
    files: [
      "src/components/evidence/CameraCapture.tsx",
      "src/components/results/ResultsView.tsx",
    ],
    rules: {
      // getUserMedia / sessionStorage hydrate require mount-time async setState
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
