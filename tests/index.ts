import "file-loader?name=[name].[ext]!../node_modules/qunit/qunit/qunit.css";
import "file-loader?name=[name].[ext]!./index.html";

import "./scenarios/index";

import { Config, config, dump } from "qunit";

config.autostart = true;
config.urlConfig.push({
  id: "logging",
  value: ["all", "info", "warning"],
  label: "Enable logging",
});
config.urlConfig.push({
  id: "stacktraces",
  label: "Show stack traces",
  tooltip: "Show a full stack trace for each log",
});
dump.maxDepth = 25;

declare module "qunit" {
  interface Config {
    logging: "all" | "info" | "warning" | undefined;
    stacktraces: boolean;
  }
}
