import { warning } from "@actions/core";
import { context } from "@actions/github";
import { parse as parseSemver } from "semver";
import { Octokit } from "octokit";

/**
 * Calculate the version to use for the current build.
 * @param {any} fetch
 * @param {typeof context} context
 */
export async function calculateVersion(context) {
  // Are we building a tagged release?
  if (context.eventName === "push" && context.ref.startsWith("refs/tags/v")) {
    // Get the version from the tag
    const version = context.ref.replace("refs/tags/", "");
    const parsed = parseSemver(version); // Ensure it's a valid semver version
    if (parsed === null) {
      throw new Error(`Invalid tag version: ${version}`);
    }
    return parsed.version;
  }
  // Get the latest release
  const parsed = await getPreviousReleaseVersion(context);
  const nextVersion = parsed.inc("minor");
  const timestamp = await getTimestamp(context);
  if (wasMainBranchPushed(context)) {
    // If we're building the main branch, don't include the `+{shortHash}` part as Python considers this a "local" version
    // and will not allow it to be uploaded to PyPI.
    return `${nextVersion.version}-alpha.${timestamp}`;
  }
  const shortHash = context.sha.slice(0, 7);
  return `${nextVersion.version}-alpha.${timestamp}+${shortHash}`;
}

/**
 * Check if we're building, or merging to, a version branch.
 * @param {typeof context} context
 * @returns {number | undefined} the major version number of the version branch.
 */
export function findVersionBranch(context) {
  let matches = null;
  if (context.eventName === "push") {
    matches = context.ref.match(/refs\/heads\/v(\d+)/);
  }
  if (context.eventName === "pull_request") {
    matches = context.payload.base?.ref?.match(/refs\/heads\/v(\d+)/);
  }
  if (matches !== null) {
    const parsedNum = parseInt(matches[1], 10);
    if (!isNaN(parsedNum)) {
      return parsedNum;
    }
  }
  return undefined;
}

/**
 * Returns true if the main branch was pushed.
 * @param {typeof context} context
 * @returns {boolean}
 */
function wasMainBranchPushed(context) {
  return (
    context.eventName === "push" &&
    (context.ref === "refs/heads/master" || context.ref === "refs/heads/main")
  );
}

/**
 * Get the latest release version from GitHub.
 * @param {typeof context} context
 * @returns {Promise<import("semver").SemVer>}
 */
async function getPreviousReleaseVersion(context) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  try {
    const response = await octokit.rest.repos.getLatestRelease({
      owner: context.repo.owner,
      repo: context.repo.repo,
    });
    const latestTag = response?.data?.tag_name;
    if (latestTag === undefined) {
      warning("Could not find latest release tag");
      return parseSemver("0.0.0");
    }
    const parsed = parseSemver(latestTag); // Ensure it's a valid semver version
    if (parsed === null) {
      warning(`Latest release tag is an invalid semver version: ${latestTag}`);
      return parseSemver("0.0.0");
    }
    return parsed;
  } catch (error) {
    // Prefer always returning some kind of version so we don't break builds due to network issues or unexpected release formats.
    warning(`Failed to get latest release: ${error.toString()}`);
    return parseSemver("0.0.0");
  }
}

/**
 * Returns the unix timestamp of the commit being built
 * @param {typeof context} context
 * @returns {Promise<string>}
 */
async function getTimestamp(context) {
  try {
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const currentCommit = await octokit.rest.repos.getCommit({
      owner: context.repo.owner,
      repo: context.repo.repo,
      ref: context.sha,
    });
    const commitDate = currentCommit?.data?.commit?.committer?.date;
    const date = new Date(commitDate);
    let time = date.getTime();
    // Check if the date is valid
    if (isNaN(time)) {
      throw new Error(`Invalid commit date: ${commitDate}`);
    }
    // Remove milliseconds
    return (time / 1000).toString();
  } catch (error) {
    warning(
      "Failed to get commit date, using GitHub run_id instead\n" +
        error.toString()
    );
    return context.runId;
  }
}
