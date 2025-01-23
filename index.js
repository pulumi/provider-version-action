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
  const majorVersion = parseMajorVersion(getInput("major-version"));
  const version = await calculateVersion(github.context, { majorVersion });
  info(`Calculated version: ${version}`);
  setOutput("version", version);
  const envVar = getInput("set-env");
  if (envVar !== "") {
    exportVariable(envVar, version);
  }
} catch (error) {
  setFailed(error);
}

/**
 *
 * @param {string} majorVersion
 * @returns {number | undefined}
 */
function parseMajorVersion(majorVersion) {
  if (majorVersion === "") {
    return undefined;
  }
  const parsed = parseInt(majorVersion, 10);
  if (isNaN(parsed)) {
    throw new Error(
      `Invalid major version: ${majorVersion}. Must be an integer.`
    );
  }
  return parsed;
}
