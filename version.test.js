import { calculateVersion, findVersionBranch } from "./version";

beforeEach(() => {
  fetch.resetMocks();
});

describe("Tag pushed", () => {
  test("Valid tag", async () => {
    expect(
      await calculateVersion({
        eventName: "push",
        ref: "refs/tags/v1.0.0",
      })
    ).toBe("1.0.0");
  });
  test("Invalid tag", async () => {
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
    // Mock the latest release response
    fetch.mockResponseOnce(async () => ({
      body: JSON.stringify({ tag_name: "v1.0.0" }),
      headers: { "content-type": "application/json" },
    }));
    // Mock the commit response
    fetch.mockResponseOnce(async () => ({
      body: JSON.stringify({
        commit: { committer: { date: "2020-01-01T00:00:00Z" } },
      }),
      headers: { "content-type": "application/json" },
    }));

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
    // Mock the latest release response
    fetch.mockResponseOnce(async () => ({
      body: JSON.stringify(null),
      headers: { "content-type": "application/json" },
    }));
    // Mock the commit response
    fetch.mockResponseOnce(async () => ({
      body: JSON.stringify({
        commit: { committer: { date: "2020-01-01T00:00:00Z" } },
      }),
      headers: { "content-type": "application/json" },
    }));

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
    // Mock the latest release response
    fetch.mockResponseOnce(async () => ({
      body: JSON.stringify({ tag_name: "v1.0.0" }),
      headers: { "content-type": "application/json" },
    }));
    // Mock the commit response
    fetch.mockResponseOnce(async () => ({
      body: JSON.stringify(null),
      headers: { "content-type": "application/json" },
    }));

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
  // Mock the latest release response
  fetch.mockResponseOnce(async () => ({
    body: JSON.stringify({ tag_name: "v1.2.1" }),
    headers: { "content-type": "application/json" },
  }));
  // Mock the commit response
  fetch.mockResponseOnce(async () => ({
    body: JSON.stringify({
      commit: { committer: { date: "2020-01-01T00:00:00Z" } },
    }),
    headers: { "content-type": "application/json" },
  }));

  expect(
    await calculateVersion({
      eventName: "pull_request",
      sha: "699a10d86efd595503aa8c3ecfff753a7ed3cbd4",
      ref: "refs/pull/4/merge",
      repo: {
        owner: "owner",
        repo: "repo",
      },
    })
  ).toBe("1.3.0-alpha.1577836800+699a10d");
});

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
