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
    // supabase start / db reset が生成するローカル専用の一時ファイル(git管理外)
    "supabase/.temp/**",
    // Claude Codeスキルの実行用スクリプトはCommonJS(Node直実行)前提で、
    // アプリ本体のTypeScript/ESM向けlintルール(no-require-imports等)は対象外にする
    ".claude/skills/**/scripts/**",
  ]),
]);

export default eslintConfig;
