import { warning, debug, isDebug, group } from "@actions/core";
import { SemVer } from "semver";
import { Octokit } from "octokit";

// Only write debug messages when the RUNNER_DEBUG environment variable is set.
// This reduces noise in tests.
const localDebug = isDebug() ? debug : () => {};

/**
 * Calculate the version to use for the current build.
 * @param {import("@actions/github/lib/context").Context} context
 * @param {{ majorVersion?: number }} args
 */
export async function calculateVersion(context, args) {
  const majorVersion = args?.majorVersion;
  const eventName = context.eventName;
  const ref = context.ref;
  const sha = context.sha;
  const defaultBranch = context.payload?.repository?.default_branch;

  localDebug(`major-version: ${majorVersion ?? ""}`);
  localDebug(`event_name: ${eventName}`);
  localDebug(`ref: ${ref}`);
  localDebug(`sha: ${sha}`);
  localDebug(`repository.default_branch: ${defaultBranch}`);
  if (isDebug()) {
    group("Context", () => {
      debug(JSON.stringify(context, null, 2));
    });
  }

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
    let headCommitMessage = context.payload?.head_commit?.message;
    if (headCommitTimestamp === undefined || headCommitMessage === undefined) {
      const headCommit = await getCommit(context.repo, sha);
      headCommitTimestamp = headCommit.timestamp;
      headCommitMessage = headCommit.message;
    }
    localDebug(`head_commit.timestamp: ${headCommitTimestamp}`);
    localDebug(`head_commit.message: ${headCommitMessage}`);

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
      const nextVersion = await getDefaultBranchNextVersion(
        context.repo,
        headCommitMessage
      );
      return alphaVersion(nextVersion, headCommitTimestamp);
    }
    localDebug(`Branch pushed: ${branchName}`);
    const previousRelease = await getLatestReleaseVersion(context.repo);
    const nextVersion = previousRelease.inc("minor");
    return localAlphaVersion(nextVersion, headCommitTimestamp, sha);
  }

  if (eventName === "pull_request") {
    // pull_request events only
    const headRef = context.payload?.pull_request?.head?.ref;
    const prLabels = context.payload?.pull_request?.labels;
    localDebug(`PR pushed: ${context.eventName} ${context.ref}`);
    localDebug(`pull_request.head.ref: ${headRef}`);
    localDebug(`pull_request.labels: ${JSON.stringify(prLabels)}`);

    const asVersion = tryParseVersionBranch(headRef);
    let nextVersion;
    if (asVersion !== undefined) {
      localDebug(`Version branch PR: ${headRef}`);
      nextVersion = new SemVer(`${asVersion}.0.0`);
    } else {
      const previousRelease = await getLatestReleaseVersion(context.repo);
      if (isMajorUpgradeBranch(headRef)) {
        nextVersion = previousRelease.inc("major");
      } else {
        const increment = getIncrementTypeFromLabels(prLabels);
        nextVersion = previousRelease.inc(increment);
      }
    }
    const { timestamp } = await getCommit(context.repo, sha);
    const shortHash = context.sha.slice(0, 7);
    return localAlphaVersion(nextVersion, timestamp, shortHash);
  }

  if (eventName === "schedule" || eventName === "repository_dispatch") {
    const previousRelease = await getLatestReleaseVersion(context.repo);
    let nextVersion = previousRelease.inc("minor");
    // If a major version is provided, ensure we're using that major version.
    nextVersion = ensureMajorVersion(nextVersion, majorVersion);
    const { timestamp } = await getCommit(context.repo, sha);
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
  if (!branchName) {
    return undefined;
  }
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
 * Calculates the next version number that will be released
 * for a default branch push event. This is determined by
 * the latest release version and the commit message.
 * If the commit message contains a PR number, the PR's branch
 * name will be checked for a version number. Otherwise, the
 * increment type will be determined by PR labels.
 * @param {{ owner: string, repo: string }} repo
 * @param {string} commitMessage
 * @returns {Promise<SemVer>} The next version number to be released.
 */
async function getDefaultBranchNextVersion(repo, commitMessage) {
  const previousRelease = await getLatestReleaseVersion(repo);
  const prNumber = tryParsePrNumber(commitMessage);
  if (prNumber === undefined) {
    return previousRelease.inc("minor");
  }
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const pr = await octokit.rest.pulls.get({
    ...repo,
    pull_number: prNumber,
  });
  // Check if the PR branch name is a version branch
  const prRef = pr.data?.head?.ref;
  if (prRef !== undefined) {
    const prBranchVersion = tryParseVersionBranch(prRef);
    if (prBranchVersion !== undefined) {
      return new SemVer(`${prBranchVersion}.0.0`);
    }
  }
  // Next, check if the branch name was generated from a major version upgrade
  if (prRef !== undefined && isMajorUpgradeBranch(prRef)) {
    return previousRelease.inc("major");
  }
  // Otherwise, determine the increment type from the PR labels
  const increment = getIncrementTypeFromLabels(pr.data?.labels);
  return previousRelease.inc(increment);
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
 * Tests if the branch name matches the pattern /upgrade-*-major/
 * @param {string} branchName
 * @returns {boolean}
 */
function isMajorUpgradeBranch(branchName) {
  if (!branchName) {
    return false;
  }
  return branchName.startsWith("upgrade-") && branchName.endsWith("-major");
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
 * Get the latest release version from GitHub.
 * @param {{ owner: string, repo: string}} repo Repository to load releases from.
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
 *
 * @param {SemVer} version
 * @param {number | undefined} majorVersion
 * @returns {SemVer}
 */
function ensureMajorVersion(version, majorVersion) {
  if (majorVersion === undefined) {
    return version;
  }
  if (version.major == majorVersion) {
    return version;
  }
  // Reset to requested major version.
  return new SemVer(`${majorVersion}.0.0`);
}

/**
 * Returns the ISO timestamp of the commit being built
 * @param {{ owner: string, repo: string }} repo
 * @param {string} sha
 * @returns {Promise<{ timestamp: string, message: string }>}
 */
async function getCommit(repo, sha) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const currentCommit = await octokit.rest.repos.getCommit({
    ...repo,
    ref: sha,
  });
  const commit = currentCommit?.data?.commit;
  if (commit === undefined) {
    throw new Error(`Could not load commit data: ${sha}`);
  }
  const commitDate = commit.committer?.date;
  localDebug(`Commit date: ${commitDate}`);
  return {
    timestamp: commitDate,
    message: commit.message,
  };
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
