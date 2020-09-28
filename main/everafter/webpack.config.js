const path = require("path");
const fs = require("fs");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");

module.exports = {
  entry: {
    main: "./src/index.ts",
    tests: "./tests/index.ts",
  },
  module: {
    rules: [
      {
        test: /(\.ts|\.js)$/,
        use: {
          loader: "babel-loader",
          options: {
            plugins: [
              "const-enum",
              "@glimmerx/babel-plugin-component-templates",
              ["@babel/plugin-proposal-decorators", { legacy: true }],
              [
                "@babel/plugin-transform-typescript",
                { allowDeclareFields: true, onlyRemoveTypeImports: true },
              ],
              ["@babel/plugin-proposal-class-properties", { loose: true }],
              ["@glimmer/babel-plugin-glimmer-env", { DEBUG: true }],
              ["@babel/plugin-proposal-private-methods", { loose: true }],
            ],
          },
        },
      },
    ],
  },
  devtool: "inline-source-map",
  resolve: {
    plugins: [
      new TsconfigPathsPlugin({
        mainFields: ["module", "main"],
      }),
    ],
    extensions: [".tsx", ".ts", ".js"],
    alias: {
      everafter: path.resolve(__dirname, "src", "index.ts"),
    },
  },
  output: {
    filename: "[name].js",
    path: path.resolve(__dirname, "dist"),
  },
  devServer: {
    writeToDisk: true,
    contentBase: path.join(__dirname, "dist"),
    compress: true,
    port: 9000,
  },
};
