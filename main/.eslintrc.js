module.exports = {
  extends: ["eslint:recommended"],
  env: {
    node: true,
    es2020: true,
  },
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  rules: {
    "@typescript-eslint/no-require-imports": "off",
    "@typescript-eslint/no-unused-vars": "off",
  },
};
