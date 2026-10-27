const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const flush = () => new Promise((resolve) => setImmediate(resolve));
function clock() {
  let now = 1000,
    next = 0;
  const tasks = new Map();
  return {
    Date: { now: () => now, parse: Date.parse },
    setTimeout: (fn, delay) => {
      const id = ++next;
      tasks.set(id, { at: now + delay, fn });
      return id;
    },
    clearTimeout: (id) => tasks.delete(id),
    async advance(ms) {
      now += ms;
      const ready = [...tasks].filter(([, task]) => task.at <= now);
      for (const [id, task] of ready) {
        tasks.delete(id);
        task.fn();
      }
      await flush();
    },
    get pending() {
      return tasks.size;
    },
  };
}
function load(relative, mocks = {}, time) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: relative,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name) =>
    Object.hasOwn(mocks, name)
      ? mocks[name]
      : name.startsWith("@/")
        ? load(name.slice(2) + ".ts", mocks, time)
        : require(name);
  new Function("require", "module", "exports", "setTimeout", "clearTimeout", "Date", output)(
    localRequire,
    module,
    module.exports,
    time?.setTimeout ?? setTimeout,
    time?.clearTimeout ?? clearTimeout,
    time?.Date ?? Date,
  );
  return module.exports;
}
const types = load("lib/tailoring/types.ts");
const progress = (overrides = {}) => ({
  status: "running",
  current_step: "tailor_resume",
  completed_steps: ["read_job"],
  visited_steps: ["read_job", "plan_skills", "tailor_resume"],
  tailoring_id: null,
  ...overrides,
});
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("all seven engine IDs map to the existing labels without inferring completion", () => {
  const state = types.stageProgress(types.parseTailoringProgress(progress()));
  assert.deepEqual(state, { keywords: "completed", tailor: "running" });
  assert.equal(state.plan, undefined, "visited does not mean completed");
  assert.equal(state.rewrite, undefined, "optional unvisited stages remain muted");
  assert.equal(types.TAILORING_STAGES.length, 7);
  for (const [id, key] of Object.entries(types.PROGRESS_STAGE_KEYS))
    assert.equal(
      types.stageProgress(progress({ current_step: id, completed_steps: [] }))[key],
      "running",
    );
  assert.deepEqual(
    types.stageProgress(progress({ status: "succeeded", completed_steps: ["read_job"] })),
    { keywords: "completed" },
  );
  assert.throws(
    () => types.parseTailoringProgress({ status: "running", completed_steps: "all" }),
    /incomplete progress/,
  );
});
test("registration 404 and transient errors retry every 1.75s, preserving real progress", async () => {
  const time = clock(),
    seen = [],
    main = new AbortController();
  let calls = 0;
  const { pollTailoringProgress } = load("lib/tailoring/progress.ts", {}, time);
  const stop = pollTailoringProgress(
    async () => {
      calls++;
      if (calls < 3) throw new Error(calls === 1 ? "404" : "temporary failure");
      return progress();
    },
    (value) => seen.push(value),
    main.signal,
  );
  await flush();
  assert.equal(calls, 1);
  assert.deepEqual(seen, []);
  await time.advance(1749);
  assert.equal(calls, 1);
  await time.advance(1);
  assert.equal(calls, 2);
  await time.advance(1750);
  assert.equal(calls, 3);
  assert.deepEqual(seen, [progress()]);
  stop();
  await time.advance(10000);
  assert.equal(calls, 3);
  assert.equal(main.signal.aborted, false);
});
test("slow GETs never overlap, and cleanup discards a late response without cancelling the POST", async () => {
  const time = clock(),
    main = new AbortController(),
    pending = deferred(),
    seen = [];
  let calls = 0,
    getSignal;
  const { pollTailoringProgress } = load("lib/tailoring/progress.ts", {}, time);
  const stop = pollTailoringProgress(
    (signal) => {
      calls++;
      getSignal = signal;
      return pending.promise;
    },
    (value) => seen.push(value),
    main.signal,
  );
  await time.advance(10000);
  assert.equal(calls, 1);
  stop();
  stop();
  assert.equal(getSignal.aborted, true);
  assert.equal(main.signal.aborted, false);
  pending.resolve(progress());
  await flush();
  await time.advance(10000);
  assert.deepEqual(seen, []);
  assert.equal(calls, 1);
  assert.equal(time.pending, 0);
});
test("terminal progress stops polling without cancelling its owner", async () => {
  for (const status of ["succeeded", "failed", "interrupted"]) {
    const time = clock(),
      main = new AbortController(),
      seen = [];
    let calls = 0;
    const { pollTailoringProgress } = load("lib/tailoring/progress.ts", {}, time);
    pollTailoringProgress(
      async () => {
        calls++;
        return progress({ status });
      },
      (value) => seen.push(value),
      main.signal,
    );
    await flush();
    await time.advance(10000);
    assert.equal(calls, 1);
    assert.equal(seen[0].status, status);
    assert.equal(main.signal.aborted, false);
    assert.equal(time.pending, 0);
  }
});
test("polling-session cancellation aborts an active GET and prevents future polls", async () => {
  const time = clock(),
    main = new AbortController(),
    pending = deferred();
  let getSignal;
  const { pollTailoringProgress } = load("lib/tailoring/progress.ts", {}, time);
  pollTailoringProgress(
    (signal) => {
      getSignal = signal;
      return pending.promise;
    },
    () => assert.fail("late response"),
    main.signal,
  );
  main.abort();
  assert.equal(getSignal.aborted, true);
  pending.resolve(progress());
  await flush();
  await time.advance(10000);
  assert.equal(time.pending, 0);
});

const input = {
  resumeId: "test-resume",
  filename: "Test CV.pdf",
  jobDescription: "The original job description is retained verbatim.",
};
test("durable queue POST sends progress_id once and polls with the current bearer token", async () => {
  const oldFetch = global.fetch,
    oldUrl = process.env.EXPO_PUBLIC_RESUME_API_URL,
    requests = [];
  process.env.EXPO_PUBLIC_RESUME_API_URL = "https://isolated-progress-test.invalid";
  let token = "current-token";
  const api = load("lib/cv/api.ts", {
    "@/lib/supabase": {
      supabase: {
        auth: {
          getSession: async () => ({
            data: {
              session: {
                access_token: token,
                user: { id: "owner" },
                expires_at: Date.now() / 1000 + 3600,
              },
            },
          }),
        },
      },
    },
  });
  global.fetch = async (url, init) => {
    requests.push({ url, ...init });
    return new Response(
      JSON.stringify(
        init.method === "POST"
          ? {
              ...progress({ status: "queued" }),
              progress_id: "11111111-1111-4111-8111-111111111111",
            }
          : progress(),
      ),
      {
        status: 200,
      },
    );
  };
  try {
    const signal = new AbortController().signal,
      id = require("node:crypto").randomUUID();
    await api.startTailoringJob("owner", input, id, signal);
    token = "refreshed-current-token";
    await api.getTailoringProgress("owner", id, signal);
    assert.deepEqual(JSON.parse(requests[0].body), {
      resume_id: input.resumeId,
      job_description: input.jobDescription,
      progress_id: id,
    });
    assert.equal(
      requests[1].url,
      "https://isolated-progress-test.invalid/api/v1/mobile/tailor/progress/" + id,
    );
    assert.equal(requests[1].headers.Authorization, "Bearer refreshed-current-token");
    assert.equal(requests[1].method, "GET");
    global.fetch = async () =>
      new Response(JSON.stringify({ detail: "Not registered yet" }), { status: 404 });
    await assert.rejects(
      api.getTailoringProgress("owner", id, signal),
      (error) => error.status === 404,
    );
  } finally {
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.EXPO_PUBLIC_RESUME_API_URL;
    else process.env.EXPO_PUBLIC_RESUME_API_URL = oldUrl;
  }
});
