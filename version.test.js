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
    ).rejects.toThrow("Invalid tag version: v1.foo");
  });
});

describe("main/master branch pushed", () => {
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
        eventName: "push",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        ref: "refs/heads/master",
        repo: {
          owner: "owner",
          repo: "repo",
        },
      })
    ).toBe("1.1.0-alpha.1577836800");
  });

  test("without previous release", async () => {
    mockGitHubEndpoints({
      // Make release not found
      "repos/owner/repo/releases/latest": null,
      "repos/owner/repo/commits/699a10d86efd595503aa8c3ecfff753a7ed3cbd4": {
        commit: {
          message: "Commit message",
          committer: { date: "2020-01-01T00:00:00Z" },
        },
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
      })
    ).toBe("0.1.0-alpha.1577836800");
  });

  test("failure to fetch commit falls back to runId", async () => {
    mockGitHubEndpoints({
      "repos/owner/repo/releases/latest": { tag_name: "v1.0.0" },
      // Make commit not found
      "repos/owner/repo/commits/699a10d86efd595503aa8c3ecfff753a7ed3cbd4": null,
    });

    expect(
      await calculateVersion({
        eventName: "push",
        sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
        runId: 1234,
        ref: "refs/heads/master",
        repo: {
          owner: "owner",
          repo: "repo",
        },
      })
    ).toBe("1.1.0-alpha.1234");
  });
});

// This is essentially the same as the branch push test, but with a different event name, which doesn't currently affect the behavior.
test("PR build", async () => {
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
        base: { ref: "refs/heads/main" },
      },
    })
  ).toBe("1.3.0-alpha.1577836800+699a10d");
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

describe("findVersionBranch", () => {
  test("v1 branch", () => {
    expect(
      findVersionBranch({
        eventName: "push",
        ref: "refs/heads/v1",
      })
    ).toBe(1);
  });
  test("v2 branch", () => {
    expect(
      findVersionBranch({
        eventName: "push",
        ref: "refs/heads/v2",
      })
    ).toBe(2);
  });
  test("v2 PR", () => {
    expect(
      findVersionBranch({
        eventName: "pull_request",
        payload: { base: { ref: "refs/heads/v2" } },
      })
    ).toBe(2);
  });
  test("invalid branch", () => {
    expect(
      findVersionBranch({
        eventName: "push",
        ref: "refs/heads/foo",
      })
    ).toBe(undefined);
  });
});
