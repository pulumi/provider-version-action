import core from "@actions/core";
import github from "@actions/github";
import semver from "semver";
import { Octokit } from "octokit";

/**
 *
 * @param {any} fetch
 * @param {typeof github.context} context
 */
export async function calculateVersion(context) {
  // Are we building a tagged release?
  if (
    context.eventName === "push" &&
    context.payload.ref.startsWith("refs/tags/")
  ) {
    // Get the version from the tag
    const version = context.payload.ref.replace("refs/tags/", "");
    const parsed = semver.parse(removeV(version)); // Ensure it's a valid semver version
    if (parsed === null) {
      console.warn(
        `Latest release tag is an invalid semver version: ${version}`
      );
      parsed = semver.parse("0.0.0-dev");
    }
    return parsed.toString();
  }
  const octokitArgs = { auth: process.env.GITHUB_TOKEN };
  if (fetch) {
    octokitArgs.request = { fetch };
  }
  // Get the latest release
  const octokit = new Octokit(octokitArgs);
  const response = await octokit.rest.repos.getLatestRelease({
    owner: context.repo.owner,
    repo: context.repo.repo,
  });
  const latestTag = response === undefined ? "v0.0.0" : response.data.tag_name;
  const parsed = semver.parse(removeV(latestTag)); // Ensure it's a valid semver version
  if (parsed === null) {
    console.warn(
      `Latest release tag is an invalid semver version: ${latestTag}`
    );
    parsed = semver.parse("0.0.0-dev");
  }
  const nextVersion = parsed.inc("minor");
  const shortHash = context.sha.slice(0, 7);
  const timestamp = await getTimestamp(context);
  const version = `${nextVersion.version}-alpha.${timestamp}.${shortHash}`;
  return version;
}

/**
 *Returns the unix timestamp of the commit being built
 * @param {typeof github.context} context
 * @returns {Promise<string>}
 */
async function getTimestamp(context) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const currentCommit = await octokit.rest.repos.getCommit({
    owner: context.repo.owner,
    repo: context.repo.repo,
    ref: context.sha,
  });
  const commitDate = currentCommit?.data?.commit?.committer?.date;
  if (commitDate === undefined) {
    console.warn("Could not find commit date");
    return new Date().getTime() / 1000;
  }
  const date = new Date(commitDate);
  const time = date.getTime();
  // Check if the date is valid
  if (isNaN(time)) {
    console.warn("Invalid commit date");
    time = new Date().getTime();
  }
  // Remove milliseconds
  return time / 1000;
}

/**
 *
 * @param {string} version
 * @returns
 */
function removeV(version) {
  return version.replace(/^v/, "");
}
