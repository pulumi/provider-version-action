import { warning } from "@actions/core";
import github from "@actions/github";
import semver from "semver";
import { Octokit } from "octokit";

/**
 * Calculate the version to use for the current build.
 * @param {any} fetch
 * @param {typeof github.context} context
 */
export async function calculateVersion(context) {
  // Are we building a tagged release?
  if (context.eventName === "push" && context.ref.startsWith("refs/tags/v")) {
    // Get the version from the tag
    const version = context.ref.replace("refs/tags/", "");
    const parsed = semver.parse(version); // Ensure it's a valid semver version
    if (parsed === null) {
      throw new Error(`Invalid tag version: ${version}`);
    }
    return parsed.version;
  }
  // Get the latest release
  const parsed = await getPreviousReleaseVersion(context);
  const nextVersion = parsed.inc("minor");
  const shortHash = context.sha.slice(0, 7);
  const timestamp = await getTimestamp(context);
  const version = `${nextVersion.version}-alpha.${timestamp}+${shortHash}`;
  return version;
}

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
      return semver.parse("0.0.0");
    }
    const parsed = semver.parse(latestTag); // Ensure it's a valid semver version
    if (parsed === null) {
      warning(`Latest release tag is an invalid semver version: ${latestTag}`);
      return semver.parse("0.0.0");
    }
    return parsed;
  } catch (error) {
    // Prefer always returning some kind of version so we don't break builds due to network issues or unexpected release formats.
    warning(`Failed to get latest release: ${error.toString()}`);
    return semver.parse("0.0.0");
  }
}

/**
 *Returns the unix timestamp of the commit being built
 * @param {typeof github.context} context
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
