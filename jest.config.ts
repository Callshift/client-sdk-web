import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true }],
  },
  // The source imports its own files as `./x.js`, as the published ESM must.
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
};

export default config;
