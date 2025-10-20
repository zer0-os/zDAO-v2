export default {
  require: [],
  extension: ["ts"],
  spec: "test/*.ts",
  timeout: 50000,
  loader: "ts-node/esm",
};