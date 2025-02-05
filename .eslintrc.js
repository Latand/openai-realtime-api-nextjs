module.exports = {
  extends: ["next/core-web-vitals"],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
  },
  ignorePatterns: ["app/**/*", "main/**/*"],
};
