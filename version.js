import { warning, debug, isDebug } from "@actions/core";
import { context } from "@actions/github";
import { SemVer } from "semver";
import { Octokit } from "octokit";

// Only write debug messages when the RUNNER_DEBUG environment variable is set.
// This reduces noise in tests.
const localDebug = isDebug() ? debug : () => {};

/**
 * Calculate the version to use for the current build.
 * @param {any} fetch
 * @param {typeof context} context
 */
export async function calculateVersion(context) {
  const eventName = context.eventName;
  const ref = context.ref;
  const sha = context.sha;
  const defaultBranch = context.payload?.repository?.default_branch;

  localDebug(`event_name: ${eventName}`);
  localDebug(`ref: ${ref}`);
  localDebug(`sha: ${sha}`);
  localDebug(`repository.default_branch: ${defaultBranch}`);

  if (eventName === "push" && ref.startsWith("refs/tags/")) {
    localDebug(`Tag pushed: ${ref}`);
    return calculateTagVersion(ref);
  }

  if (
    (eventName === "push" || eventName == "workflow_dispatch") &&
    ref.startsWith("refs/heads/")
  ) {
    // push events only
    let headCommitTimestamp = context.payload?.head_commit?.timestamp;
    const headCommitMessage = context.payload?.head_commit?.message ?? "";
    localDebug(`head_commit.timestamp: ${headCommitTimestamp}`);
    localDebug(`head_commit.message: ${headCommitMessage}`);

    if (headCommitTimestamp === undefined) {
      headCommitTimestamp = await getCommitTimestamp(context.repo, sha);
    }

    const branchName = ref.replace("refs/heads/", "");
    const asVersion = tryParseVersionBranch(branchName);
    if (asVersion !== undefined) {
      const baseVersion = new SemVer(`${asVersion}.0.0`);
      localDebug(
        `Version branch pushed: ${branchName}, base version: ${baseVersion}`
      );
      return alphaVersion(baseVersion, headCommitTimestamp);
    }
    if (branchName === defaultBranch) {
      localDebug(`Default branch pushed: ${defaultBranch}`);
      const previousRelease = await getLatestReleaseVersion(context.repo);
      const increment = await getIncrementType(headCommitMessage);
      const nextVersion = previousRelease.inc(increment);
      return alphaVersion(nextVersion, headCommitTimestamp);
    }
    localDebug(`Branch pushed: ${branchName}`);
    const previousRelease = await getLatestReleaseVersion(context.repo);
    const nextVersion = previousRelease.inc("minor");
    return localAlphaVersion(nextVersion, headCommitTimestamp, sha);
  }

  if (eventName === "pull_request") {
    // pull_request events only
    const baseRef = context.payload?.pull_request?.base?.ref;
    const prLabels = context.payload?.pull_request?.labels;
    localDebug(`PR pushed: ${context.eventName} ${context.ref}`);
    localDebug(`pull_request.base.ref: ${baseRef}`);
    localDebug(`pull_request.labels: ${JSON.stringify(prLabels)}`);

    const asVersion = tryParseVersionBranch(baseRef);
    let nextVersion;
    if (asVersion !== undefined) {
      localDebug(`Version branch PR: ${baseRef}`);
      nextVersion = new SemVer(`${asVersion}.0.0`);
    } else {
      const previousRelease = await getLatestReleaseVersion(context.repo);
      const increment = getIncrementTypeFromLabels(prLabels);
      nextVersion = previousRelease.inc(increment);
    }
    const timestamp = await getCommitTimestamp(context.repo, sha);
    const shortHash = context.sha.slice(0, 7);
    return localAlphaVersion(nextVersion, timestamp, shortHash);
  }

  if (eventName === "schedule") {
    const previousRelease = await getLatestReleaseVersion(context.repo);
    const nextVersion = previousRelease.inc("minor");
    const timestamp = await getCommitTimestamp(context.repo, sha);
    const shortHash = context.sha.slice(0, 7);
    return localAlphaVersion(nextVersion, timestamp, shortHash);
  }

  throw new Error(`Unsupported event: ${eventName}`);
}

/**
 * @param {SemVer} baseVersion
 * @param {string} timestamp
 * @returns {string}
 */
function alphaVersion(baseVersion, timestamp) {
  // Include the short commit hash for pull-requests and other branches to ensure a unique version per commit.
  // This is considered a "local" version by Python and is not able to be uploaded to PyPI.
  return `${baseVersion.version}-alpha.${timestampToUnix(timestamp)}`;
}

/**
 * @param {SemVer} baseVersion
 * @param {string} timestamp
 * @param {string} sha
 * @returns {string}
 */
function localAlphaVersion(baseVersion, timestamp, sha) {
  return `${baseVersion.version}-alpha.${timestampToUnix(
    timestamp
  )}+${shortHash(sha)}`;
}

/**
 * @param {string} ref
 * @returns {string}
 */
function calculateTagVersion(ref) {
  // Get the version from the tag
  const tag = ref.replace("refs/tags/", "");
  localDebug(`tag: ${tag}`);
  // Ensure it's a valid semver version
  const parsed = new SemVer(tag);
  return parsed.version;
}

/**
 * @param {string} branchName
 * @returns {number | undefined}
 */
function tryParseVersionBranch(branchName) {
  const match = branchName.match(/^v(\d+)$/);
  if (match) {
    const version = parseInt(match[1], 10);
    if (!isNaN(version)) {
      return version;
    }
  }
  return undefined;
}

/**
 * Checks the PR to see if the major version should be incremented based on labels.
 * @param {string} commitMessage
 * @returns {Promise<'minor' | 'major'>}
 */
async function getIncrementType(commitMessage) {
  const prNumber = tryParsePrNumber(commitMessage);
  if (prNumber === undefined) {
    return "minor";
  }
  const labels = await findAssociatedPrLabels(context.repo, prNumber);
  return getIncrementTypeFromLabels(labels);
}

/**
 * @param {{ name: string }[] | undefined} labels
 * @returns {'minor' | 'major'}
 */
function getIncrementTypeFromLabels(labels) {
  if (!labels) {
    labels = [];
  }
  localDebug(`PR labels: ${labels.map((label) => label.name).join(", ")}`);
  if (labels.some((label) => label.name === "needs-release/major")) {
    return "major";
  }
  if (labels.some((label) => label.name === "needs-release/minor")) {
    return "minor";
  }
  if (labels.some((label) => label.name === "needs-release/patch")) {
    return "patch";
  }
  // Default to minor as this is the most common increment type for providers.
  return "minor";
}

/**
 * @param {string} commitMessage
 * @returns {number | undefined}
 */
function tryParsePrNumber(commitMessage) {
  if (!commitMessage) {
    return undefined;
  }
  const prMatch = commitMessage.match(/\(#(\d+)\)/);
  if (prMatch) {
    const num = parseInt(prMatch[1], 10);
    if (!isNaN(num)) {
      return num;
    }
  }
  return undefined;
}

/**
 * @param {{ owner:string, repo: string }} repo
 * @param {number} prNumber
 * @returns {Promise<{ name: string }[] | undefined>}
 */
async function findAssociatedPrLabels(repo, prNumber) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const pr = await octokit.rest.pulls.get({
    ...repo,
    pull_number: prNumber,
  });
  return pr.data?.labels;
}

/**
 * Get the latest release version from GitHub.
 * @param {{ owner: string, repo: string}} repo
 * @returns {Promise<SemVer>}
 */
async function getLatestReleaseVersion(repo) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  try {
    const response = await octokit.rest.repos.getLatestRelease({
      owner: repo.owner,
      repo: repo.repo,
    });
    const latestTag = response?.data?.tag_name;
    if (latestTag === undefined) {
      localDebug("No latest release found, using 0.0.0 as the base version.");
      return new SemVer("0.0.0");
    }
    localDebug(`Latest release tag: ${latestTag}`);
    const parsed = new SemVer(latestTag); // Ensure it's a valid semver version
    if (parsed === null) {
      warning(`Latest release tag is an invalid semver version: ${latestTag}`);
      return new SemVer("0.0.0");
    }
    return parsed;
  } catch (error) {
    // Prefer always returning some kind of version so we don't break builds due to network issues or unexpected release formats.
    warning(`Failed to get latest release: ${error.toString()}`);
    return new SemVer("0.0.0");
  }
}

/**
 * Returns the ISO timestamp of the commit being built
 * @param {typeof context} context
 * @returns {Promise<string>}
 */
async function getCommitTimestamp(repo, sha) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const currentCommit = await octokit.rest.repos.getCommit({
    ...repo,
    ref: sha,
  });
  const commitDate = currentCommit?.data?.commit?.committer?.date;
  if (commitDate === undefined) {
    throw new Error("Could not find commit date");
  }
  localDebug(`Commit date: ${commitDate}`);
  return commitDate;
}

/**
 * @param {string} timestamp
 * @returns {number}
 */
function timestampToUnix(timestamp) {
  const date = new Date(timestamp);
  let time = date.getTime();
  // Check if the date is valid
  if (isNaN(time)) {
    throw new Error(`Invalid commit date: ${commitDate}`);
  }
  // Remove milliseconds
  return Math.floor(date.getTime() / 1000);
}

/**
 * @param {string} sha
 * @returns {string}
 */
function shortHash(sha) {
  return sha.slice(0, 7);
}
