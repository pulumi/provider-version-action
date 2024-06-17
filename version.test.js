import { calculateVersion, findVersionBranch } from "./version";

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
          pull_request: { base: { ref: "v2" } },
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
          pull_request: { base: { ref: "upgrade-foo-v2.0.1-major" } },
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
          pull_request: { base: { ref: "v21" } },
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
