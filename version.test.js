import { calculateVersion } from "./version";

beforeEach(() => {
  fetch.resetMocks();
});

test("Tag pushed", async () => {
  expect(
    await calculateVersion({
      eventName: "push",
      payload: {
        ref: "refs/tags/v1.0.0",
      },
    })
  ).toBe("1.0.0");
});

test("master branch pushed", async () => {
  // Mock the latest release response
  fetch.mockResponseOnce(async () => ({
    body: JSON.stringify({ tag_name: "v0.0.1" }),
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
      payload: {
        ref: "refs/heads/master",
      },
      repo: {
        owner: "owner",
        repo: "repo",
      },
    })
  ).toBe("0.1.0-alpha.1577836800.699a10d");
});

test("PR build", async () => {
  // Mock the latest release response
  fetch.mockResponseOnce(async () => ({
    body: JSON.stringify({ tag_name: "v0.0.1" }),
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
      repo: {
        owner: "owner",
        repo: "repo",
      },
    })
  ).toBe("0.1.0-alpha.1577836800.699a10d");
});
