/**
 * @see https://prettier.io/docs/en/configuration.html
 * @type {import("prettier").Config}
 */
const config = {
  plugins: ["@ianvs/prettier-plugin-sort-imports"],
  importOrder: [
    "<TYPES>",
    "<THIRD_PARTY_MODULES>",
    "",
    "<TYPES>^(@/)",
    "^@/(.*)$",
    "",
    "<TYPES>^[./]",
    "^[./]",
  ],
  importOrderTypeScriptVersion: "5.7.2",
  trailingComma: "all",
  semi: true,
  tabWidth: 2,
  singleQuote: false,
  printWidth: 90,
};

export default config;
