import core from "@actions/core";
import github from "@actions/github";
import { calculateVersion } from "./version";

try {
  const version = await calculateVersion(github.context);
  core.setOutput("version", version);
} catch (error) {
  core.setFailed(error.message);
}
