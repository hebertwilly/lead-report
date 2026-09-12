import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import { globalIgnores } from "eslint/config";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });
const config = [globalIgnores([".next/**", "node_modules/**", "next-env.d.ts"]), ...compat.extends("next/core-web-vitals", "next/typescript")];
export default config;
