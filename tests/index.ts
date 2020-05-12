import "file-loader?name=[name].[ext]!../node_modules/qunit/qunit/qunit.css";
import "file-loader?name=[name].[ext]!./index.html";

import "./scenarios/index";

import { config, dump } from "qunit";

config.autostart = true;
config.urlConfig.push({
  id: "logging",
  label: "Enable logging",
});
dump.maxDepth = 25;
