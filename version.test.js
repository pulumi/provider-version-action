import {
  calculateVersion,
  calculateIsLatest,
  findVersionBranch,
  isLatestRelease,
} from "./version";

beforeEach(() => {
  fetch.resetMocks();
});

describe("Tag pushed", () => {
  test("Valid tag", async () => {
    mockGitHubEndpoints();
    expect(
      await calculateVersion({
        eventName: "push",
        ref: "refs/tags/v1.0.0",
      })
    ).toBe("1.0.0");
  });
  test("Invalid tag", async () => {
    mockGitHubEndpoints();
    await expect(
      calculateVersion({
        eventName: "push",
        ref: "refs/tags/v1.foo",
      })
    ).rejects.toThrow("Invalid Version: v1.foo");
  });
});

describe("main/master branch pushed", () => {
  test("with previous release", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": { tag_name: "v1.0.0" },
    });

    expect(
      await calculateVersion({
        eventName: "push",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        ref: "refs/heads/master",
        repo: {
          owner: "owner",
          repo: "repo",
        },
        payload: {
          repository: { default_branch: "master" },
          head_commit: {
            message: "Commit message",
            timestamp: "2020-01-01T00:00:00Z",
          },
        },
      })
    ).toBe("1.1.0-alpha.1577836800");
  });

  test("without previous release", async () => {
    mockGitHubEndpoints({
      // Make release not found
      "repos/owner/repo/releases/latest": {},
    });

    expect(
      await calculateVersion({
        eventName: "push",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        ref: "refs/heads/master",
        repo: {
          owner: "owner",
          repo: "repo",
        },
        payload: {
          repository: { default_branch: "master" },
          head_commit: {
            message: "Commit message",
            timestamp: "2020-01-01T00:00:00Z",
          },
        },
      })
    ).toBe("0.1.0-alpha.1577836800");
  });

  test("with explicit major version", async () => {
    mockGitHubEndpoints({
      // Make release not found
      "repos/owner/repo/releases/latest": {},
    });

    expect(
      await calculateVersion(
        {
          eventName: "push",
          sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
          ref: "refs/heads/master",
          repo: {
            owner: "owner",
            repo: "repo",
          },
          payload: {
            repository: { default_branch: "master" },
            head_commit: {
              message: "Commit message",
              timestamp: "2020-01-01T00:00:00Z",
            },
          },
        },
        { majorVersion: 2 }
      )
    ).toBe("2.0.0-alpha.1577836800");
  });

  test("After merging PR with needs-release/major label", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": { tag_name: "v1.0.0" },
      "repos/owner/repo/pulls/4": {
        labels: [{ name: "needs-release/major" }],
      },
    });

    expect(
      await calculateVersion({
        eventName: "push",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        ref: "refs/heads/master",
        repo: {
          owner: "owner",
          repo: "repo",
        },
        payload: {
          repository: { default_branch: "master" },
          head_commit: {
            message: "Commit message (#4)",
            timestamp: "2020-01-01T00:00:00Z",
          },
        },
      })
    ).toBe("2.0.0-alpha.1577836800");
  });

  test("After merging version branch PR", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": { tag_name: "v1.0.0" },
      "repos/owner/repo/pulls/4": {
        head: { ref: "v2" },
      },
    });

    expect(
      await calculateVersion({
        eventName: "push",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        ref: "refs/heads/v2",
        repo: {
          owner: "owner",
          repo: "repo",
        },
        payload: {
          repository: { default_branch: "master" },
          head_commit: {
            message: "Commit message (#4)",
            timestamp: "2020-01-01T00:00:00Z",
          },
        },
      })
    ).toBe("2.0.0-alpha.1577836800");
  });

  test("After merging major upgrade PR", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": { tag_name: "v1.0.0" },
      "repos/owner/repo/pulls/4": {
        head: { ref: "upgrade-xyz-to-v2.0.0-major" },
      },
    });

    expect(
      await calculateVersion({
        eventName: "push",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        ref: "refs/heads/master",
        repo: {
          owner: "owner",
          repo: "repo",
        },
        payload: {
          repository: { default_branch: "master" },
          head_commit: {
            message: "Commit message (#4)",
            timestamp: "2020-01-01T00:00:00Z",
          },
        },
      })
    ).toBe("2.0.0-alpha.1577836800");
  });

  test("after merging PR with short major version branch name", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": { tag_name: "v1.0.0" },
      "repos/owner/repo/pulls/4": {
        head: { ref: "upgrade-to-v2-major" },
      },
    });

    expect(
      await calculateVersion({
        eventName: "push",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        ref: "refs/heads/master",
        repo: {
          owner: "owner",
          repo: "repo",
        },
        payload: {
          repository: { default_branch: "master" },
          head_commit: {
            message: "Upgrade to v2 (#4)",
            timestamp: "2020-01-01T00:00:00Z",
          },
        },
      })
    ).toBe("2.0.0-alpha.1577836800");
  });
});

describe("Manual run after merging to default branch", () => {
  test("after merging PR with short major version branch name", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": { tag_name: "v5.89.0" },
      "repos/owner/repo/pulls/2367": {
        head: { ref: "upgrade-to-v6-major" },
      },
      "repos/owner/repo/commits/18927620756933474daed64f741429db57342e42": {
        commit: {
          message: "Upgrade to v6 major (#2367)",
          committer: { date: "2020-01-01T00:00:00Z" },
        },
      },
    });

    expect(
      await calculateVersion({
        eventName: "workflow_dispatch",
        sha: "18927620756933474daed64f741429db57342e42",
        ref: "refs/heads/master",
        repo: {
          owner: "owner",
          repo: "repo",
        },
        payload: {
          repository: { default_branch: "master" },
        },
      })
    ).toBe("6.0.0-alpha.1577836800");
  });
});

describe("workflow_dispatch", () => {
  test("with previous release", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": { tag_name: "v1.0.0" },
      "repos/owner/repo/commits/699a10d86efd595503aa8c3ecfff753a7ed3cbd4": {
        commit: {
          message: "Commit message",
          committer: { date: "2020-01-01T00:00:00Z" },
        },
      },
    });

    expect(
      await calculateVersion({
        eventName: "workflow_dispatch",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        ref: "refs/heads/master",
        repo: {
          owner: "owner",
          repo: "repo",
        },
        payload: {
          repository: { default_branch: "master" },
        },
      })
    ).toBe("1.1.0-alpha.1577836800");
  });
});

describe("repository_dispatch", () => {
  test("with previous release", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": { tag_name: "v1.0.0" },
      "repos/owner/repo/commits/699a10d86efd595503aa8c3ecfff753a7ed3cbd4": {
        commit: {
          message: "Commit message",
          committer: { date: "2020-01-01T00:00:00Z" },
        },
      },
    });

    expect(
      await calculateVersion({
        eventName: "repository_dispatch",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        ref: "refs/heads/master",
        repo: {
          owner: "owner",
          repo: "repo",
        },
        payload: {
          action: "foo",
        },
      })
    ).toBe("1.1.0-alpha.1577836800+699a10d");
  });
});

describe("Version branch pushed", () => {
  test("with previous release", async () => {
    mockGitHubEndpoints({});

    expect(
      await calculateVersion({
        eventName: "push",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        ref: "refs/heads/v2",
        repo: {
          owner: "owner",
          repo: "repo",
        },
        payload: {
          repository: { default_branch: "master" },
          head_commit: {
            message: "Commit message",
            timestamp: "2020-01-01T00:00:00Z",
          },
        },
      })
    ).toBe("2.0.0-alpha.1577836800");
  });

  test("with explicit major version", async () => {
    mockGitHubEndpoints({});

    expect(
      await calculateVersion(
        {
          eventName: "push",
          sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
          ref: "refs/heads/v2",
          repo: {
            owner: "owner",
            repo: "repo",
          },
          payload: {
            repository: { default_branch: "master" },
            head_commit: {
              message: "Commit message",
              timestamp: "2020-01-01T00:00:00Z",
            },
          },
        },
        { majorVersion: 3 }
      )
    ).toBe("3.0.0-alpha.1577836800");
  });
});

describe("pull_request", () => {
  test("to default branch", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": { tag_name: "v1.2.1" },
      "repos/owner/repo/commits/699a10d86efd595503aa8c3ecfff753a7ed3cbd4": {
        commit: {
          message: "Commit message",
          committer: { date: "2020-01-01T00:00:00Z" },
        },
      },
    });

    expect(
      await calculateVersion({
        eventName: "pull_request",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        ref: "refs/pull/4/merge",
        repo: {
          owner: "owner",
          repo: "repo",
        },
        payload: {
          repository: { default_branch: "main" },
          pull_request: { base: { ref: "main" } },
        },
      })
    ).toBe("1.3.0-alpha.1577836800+699a10d");
  });

  test("with expected major version", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": { tag_name: "v1.2.1" },
      "repos/owner/repo/commits/699a10d86efd595503aa8c3ecfff753a7ed3cbd4": {
        commit: {
          message: "Commit message",
          committer: { date: "2020-01-01T00:00:00Z" },
        },
      },
    });

    expect(
      await calculateVersion(
        {
          eventName: "pull_request",
          sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
          ref: "refs/pull/4/merge",
          repo: {
            owner: "owner",
            repo: "repo",
          },
          payload: {
            repository: { default_branch: "main" },
            pull_request: { base: { ref: "main" } },
          },
        },
        { majorVersion: 1 }
      )
    ).toBe("1.3.0-alpha.1577836800+699a10d");
  });

  test("with overriding major version", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": { tag_name: "v1.2.1" },
      "repos/owner/repo/commits/699a10d86efd595503aa8c3ecfff753a7ed3cbd4": {
        commit: {
          message: "Commit message",
          committer: { date: "2020-01-01T00:00:00Z" },
        },
      },
    });

    expect(
      await calculateVersion(
        {
          eventName: "pull_request",
          sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
          ref: "refs/pull/4/merge",
          repo: {
            owner: "owner",
            repo: "repo",
          },
          payload: {
            repository: { default_branch: "main" },
            pull_request: { base: { ref: "main" } },
          },
        },
        { majorVersion: 2 }
      )
    ).toBe("2.0.0-alpha.1577836800+699a10d");
  });

  test("without previous release", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": {},
      "repos/owner/repo/commits/699a10d86efd595503aa8c3ecfff753a7ed3cbd4": {
        commit: {
          message: "Commit message",
          committer: { date: "2020-01-01T00:00:00Z" },
        },
      },
    });

    expect(
      await calculateVersion({
        eventName: "pull_request",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        ref: "refs/pull/4/merge",
        repo: {
          owner: "owner",
          repo: "repo",
        },
        payload: {
          repository: { default_branch: "main" },
          pull_request: { base: { ref: "main" } },
        },
      })
    ).toBe("0.1.0-alpha.1577836800+699a10d");
  });

  test("using version branch", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": { tag_name: "v1.2.1" },
      "repos/owner/repo/commits/699a10d86efd595503aa8c3ecfff753a7ed3cbd4": {
        commit: {
          message: "Commit message",
          committer: { date: "2020-01-01T00:00:00Z" },
        },
      },
    });

    expect(
      await calculateVersion({
        eventName: "pull_request",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        ref: "refs/pull/4/merge",
        repo: {
          owner: "owner",
          repo: "repo",
        },
        payload: {
          repository: { default_branch: "main" },
          pull_request: {
            base: { ref: "main" },
            head: { ref: "v2" },
          },
        },
      })
    ).toBe("2.0.0-alpha.1577836800+699a10d");
  });

  test("from major version upgrade", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": { tag_name: "v1.2.1" },
      "repos/owner/repo/commits/699a10d86efd595503aa8c3ecfff753a7ed3cbd4": {
        commit: {
          message: "Commit message",
          committer: { date: "2020-01-01T00:00:00Z" },
        },
      },
    });

    expect(
      await calculateVersion({
        eventName: "pull_request",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        ref: "refs/pull/4/merge",
        repo: {
          owner: "owner",
          repo: "repo",
        },
        payload: {
          repository: { default_branch: "main" },
          pull_request: {
            base: { ref: "main" },
            head: { ref: "upgrade-foo-v2.0.1-major" },
          },
        },
      })
    ).toBe("2.0.0-alpha.1577836800+699a10d");
  });

  test("to version branch", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/commits/699a10d86efd595503aa8c3ecfff753a7ed3cbd4": {
        commit: {
          message: "Commit message",
          committer: { date: "2020-01-01T00:00:00Z" },
        },
      },
    });

    expect(
      await calculateVersion({
        eventName: "pull_request",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        ref: "refs/pull/4/merge",
        repo: {
          owner: "owner",
          repo: "repo",
        },
        payload: {
          repository: { default_branch: "main" },
          pull_request: {
            base: { ref: "main" },
            head: { ref: "v21" },
          },
        },
      })
    ).toBe("21.0.0-alpha.1577836800+699a10d");
  });

  test("with needs-release/major label", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": { tag_name: "v1.2.1" },
      "repos/owner/repo/commits/699a10d86efd595503aa8c3ecfff753a7ed3cbd4": {
        commit: {
          message: "Commit message",
          committer: { date: "2020-01-01T00:00:00Z" },
        },
      },
    });

    expect(
      await calculateVersion({
        eventName: "pull_request",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        ref: "refs/pull/4/merge",
        repo: {
          owner: "owner",
          repo: "repo",
        },
        payload: {
          repository: { default_branch: "main" },
          pull_request: {
            base: { ref: "main" },
            labels: [{ name: "needs-release/major" }],
          },
        },
      })
    ).toBe("2.0.0-alpha.1577836800+699a10d");
  });

  test("with needs-release/patch label", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": { tag_name: "v1.2.1" },
      "repos/owner/repo/commits/699a10d86efd595503aa8c3ecfff753a7ed3cbd4": {
        commit: {
          message: "Commit message",
          committer: { date: "2020-01-01T00:00:00Z" },
        },
      },
    });

    expect(
      await calculateVersion({
        eventName: "pull_request",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        ref: "refs/pull/4/merge",
        repo: {
          owner: "owner",
          repo: "repo",
        },
        payload: {
          repository: { default_branch: "main" },
          pull_request: {
            base: { ref: "main" },
            labels: [{ name: "needs-release/patch" }],
          },
        },
      })
    ).toBe("1.2.2-alpha.1577836800+699a10d");
  });
});

describe("schedule", () => {
  test("to default branch", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": { tag_name: "v1.2.1" },
      "repos/owner/repo/commits/699a10d86efd595503aa8c3ecfff753a7ed3cbd4": {
        commit: {
          message: "Commit message",
          committer: { date: "2020-01-01T00:00:00Z" },
        },
      },
    });

    expect(
      await calculateVersion({
        eventName: "schedule",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        ref: "refs/heads/master",
        repo: {
          owner: "owner",
          repo: "repo",
        },
      })
    ).toBe("1.3.0-alpha.1577836800+699a10d");
  });

  test("with explicit major version", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": { tag_name: "v1.2.1" },
      "repos/owner/repo/commits/699a10d86efd595503aa8c3ecfff753a7ed3cbd4": {
        commit: {
          message: "Commit message",
          committer: { date: "2020-01-01T00:00:00Z" },
        },
      },
    });

    expect(
      await calculateVersion(
        {
          eventName: "schedule",
          sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
          ref: "refs/heads/master",
          repo: {
            owner: "owner",
            repo: "repo",
          },
        },
        { majorVersion: 2 }
      )
    ).toBe("2.0.0-alpha.1577836800+699a10d");
  });
});

describe("isLatestRelease", () => {
  // Resembles a long-lived provider repository: a previous major still receiving
  // backports, prereleases, and Go submodule tags.
  const existingTags = [
    "v9.36.0",
    "v9.37.0",
    "v9.37.1",
    "v9.37.2",
    "v9.37.3",
    "v10.0.0-beta.1",
    "v10.0.0",
    "sdk/v10.0.0",
    "v10.1.0",
    "v10.2.0",
    "v10.2.1",
    "v10.2.2",
    "v10.3.0-alpha.123",
  ];
  const withTags = (...tags) => [...existingTags, ...tags];

  test.each([
    ["highest stable version", "10.3.0", withTags("v10.3.0"), true],
    ["backport on previous major", "9.37.4", withTags("v10.3.0", "v9.37.4"), false],
    ["lower version tagged on a commit shared with main", "9.37.2", withTags("v10.3.0"), false],
    ["patch backport on current major", "10.2.3", withTags("v10.3.0", "v10.2.3"), false],
    ["prerelease version", "10.4.0-alpha.1", withTags("v10.3.0", "v10.4.0-alpha.1"), false],
    ["build metadata version", "10.4.0+dirty", withTags("v10.3.0"), false],
    ["higher prerelease tags are ignored", "10.3.1", withTags("v10.3.0", "v10.4.0-beta.1", "v10.3.1"), true],
    ["higher Go submodule tags are ignored", "10.3.0", withTags("v10.3.0", "sdk/v11.0.0"), true],
    ["first release", "0.1.0", ["v0.1.0"], true],
    ["no tags", "0.1.0", [], true],
    ["double-digit minor is newer than single-digit minor", "10.10.0", ["v10.9.9", "v10.10.0"], true],
    ["single-digit minor is older than double-digit minor", "10.9.10", ["v10.10.0", "v10.9.10"], false],
    ["version with leading v", "v10.3.0", withTags("v10.3.0"), true],
    ["backport version with leading v", "v9.37.4", withTags("v10.3.0", "v9.37.4"), false],
  ])("%s", (_name, version, tags, expected) => {
    expect(isLatestRelease(version, tags)).toBe(expected);
  });
});

describe("calculateIsLatest", () => {
  const context = { repo: { owner: "owner", repo: "repo" } };

  test("lists tags for a stable version", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/git/matching-refs/tags%2Fv": [
        { ref: "refs/tags/v1.0.0" },
        { ref: "refs/tags/v1.1.0" },
      ],
    });
    expect(await calculateIsLatest(context, "1.1.0")).toBe(true);
    expect(await calculateIsLatest(context, "1.0.0")).toBe(false);
  });

  test("does not list tags for an alpha version", async () => {
    mockGitHubEndpoints();
    expect(
      await calculateIsLatest(context, "1.2.0-alpha.1577836800+699a10d")
    ).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("fails when tags cannot be listed", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/git/matching-refs/tags%2Fv": null,
    });
    await expect(calculateIsLatest(context, "1.1.0")).rejects.toThrow();
  });
});

function mockGitHubEndpoints(requests = {}) {
  fetch.mockResponse(async (req) => {
    const url = req.url;
    if (!url.startsWith("https://api.github.com")) {
      return false;
    }
    for (const [pattern, response] of Object.entries(requests)) {
      if (url.includes(pattern)) {
        if (response === null) {
          return { status: 404 };
        }
        return {
          body: JSON.stringify(response),
          headers: { "content-type": "application/json" },
        };
      }
    }
    console.log("Unhandled request: " + url);
    return { status: 404 };
  });
}
