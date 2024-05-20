import {
  setFailed,
  getInput,
  exportVariable,
  setOutput,
  info,
} from "@actions/core";
import * as github from "@actions/github";
import { calculateVersion } from "./version";

try {
  const version = await calculateVersion(github.context);
  info(`Calculated version: ${version}`);
  setOutput("version", version);
  const envVar = getInput("set-env");
  if (envVar !== "") {
    exportVariable(envVar, version);
  }
} catch (error) {
  setFailed(error.message);
}
