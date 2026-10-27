const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const { makeReview } = require("./fixtures/tailoring-review.cjs");
const root = path.resolve(__dirname, "..");
const flush = () => new Promise((resolve) => setImmediate(resolve));
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  OLD = "44444444-4444-4444-8444-444444444444";
const input = {
  resumeId: "source-cv",
  filename: "Original CV.pdf",
  jobDescription: "The exact job description must survive a full application restart.",
};
function clock() {
  let now = Date.parse("2026-10-27T12:00:00Z"),
    next = 0;
  const tasks = new Map();
  return {
    Date: { now: () => now, parse: Date.parse },
    setTimeout(fn, delay) {
      const id = ++next;
      tasks.set(id, { at: now + delay, fn });
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
    async advance(ms) {
      now += ms;
      for (const [id, task] of [...tasks])
        if (task.at <= now) {
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
function load(relative, time, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: relative,
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "setTimeout", "clearTimeout", "Date", output)(
    (name) =>
      Object.hasOwn(mocks, name)
        ? mocks[name]
        : name.startsWith("@/")
          ? load(name.slice(2) + ".ts", time, mocks)
          : require(name),
    module,
    module.exports,
    time?.setTimeout ?? setTimeout,
    time?.clearTimeout ?? clearTimeout,
    time?.Date ?? Date,
  );
  return module.exports;
}
const types = load("lib/tailoring/types.ts");
function row(id = A, status = "queued") {
  return {
    progress_id: id,
    status,
    current_step: status === "running" ? "tailor_resume" : null,
    completed_steps: [],
    visited_steps: [],
    tailoring_id: status === "succeeded" ? makeReview().tailoring_id : null,
    started_at: "2026-10-27T12:00:00Z",
    updated_at: "2026-10-27T12:01:00Z",
  };
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function harness(options = {}) {
  const time = options.time ?? clock();
  const shared = options.shared ?? {
    storage: null,
    jobs: [],
    posts: [],
    reads: 0,
    results: 0,
    offline: false,
    resultFailures: 0,
  };
  const events = [],
    previews = [];
  let uuidIndex = 0;
  const { DurableTailoringJob } = load("lib/tailoring/jobs.ts", time);
  const deps = {
    read: async () => shared.storage,
    write: async (value) => {
      if (options.storageFails) throw Error("storage unavailable");
      shared.storage = value;
      events.push("persist");
    },
    uuid: () => options.nextId ?? [A, B][uuidIndex++ % 2],
    submit: async (body, id, signal) => {
      assert.equal(JSON.parse(shared.storage).progressId, id, "persist UUID before POST");
      assert.deepEqual(JSON.parse(shared.storage).input, body);
      shared.posts.push({ body, id, signal });
      events.push("submit");
      if (options.submit) return options.submit(body, id, signal, shared);
      shared.jobs = [row(options.canonical ?? id)];
      return shared.jobs[0];
    },
    recent: async (signal) => {
      events.push("recent");
      if (shared.offline || signal.aborted) throw Error("offline");
      return shared.jobs;
    },
    progress: async (id, signal) => {
      shared.reads++;
      if (shared.offline || signal.aborted) throw Error("offline");
      const job = shared.jobs.find((job) => job.progress_id === id);
      if (!job) throw Error("404");
      return { ...job };
    },
    result: async (id, signal) => {
      shared.results++;
      if (signal.aborted || shared.resultFailures-- > 0) throw Error("temporary result failure");
      return types.parseTailoringPreview({ ...makeReview(), progress_id: id });
    },
    onState: (state) => events.push({ ...state }),
    onResult: async (preview, job) => {
      previews.push({ preview, job });
      events.push("review-persisted");
    },
  };
  return { client: new DurableTailoringJob(deps), shared, time, events, previews };
}

test("write-before-submit, canonical ID persistence, queued polling and duplicate prevention", async () => {
  const h = harness({ canonical: B });
  await h.client.restore();
  assert.equal(h.client.start(input), true);
  assert.equal(h.client.start(input), false);
  await flush();
  assert.equal(h.shared.posts.length, 1);
  assert.equal(h.client.snapshot.submitting, false);
  assert.equal(JSON.parse(h.shared.storage).progressId, B);
  const reads = h.shared.reads;
  await h.time.advance(1750);
  assert.ok(h.shared.reads > reads, "queued jobs continue polling");
  h.shared.jobs[0] = row(B, "running");
  await h.time.advance(1750);
  assert.equal(h.client.snapshot.progress.current_step, "tailor_resume");
  assert.deepEqual(h.client.snapshot.progress.completed_steps, []);
  assert.deepEqual(h.shared.posts[0].body, input);
  h.client.dispose();
});
test("background pauses GETs while the worker finishes; foreground retrieves the same result", async () => {
  const h = harness();
  await h.client.restore();
  h.client.start(input);
  await flush();
  h.client.setActive(false);
  const reads = h.shared.reads;
  h.shared.jobs[0] = row(A, "succeeded");
  await h.time.advance(60000);
  assert.equal(h.shared.reads, reads);
  assert.equal(h.previews.length, 0);
  assert.equal(h.shared.posts[0].signal.aborted, false);
  h.client.setActive(true);
  await flush();
  assert.equal(h.previews.length, 1);
  assert.equal(h.shared.posts.length, 1);
  assert.deepEqual(
    h.previews[0].preview,
    types.parseTailoringPreview({ ...makeReview(), progress_id: A }),
  );
  assert.equal(h.client.snapshot.job.startedAt, Date.parse("2026-10-27T12:00:00Z"));
  assert.equal(JSON.parse(h.shared.storage).delivered, true);
  h.client.dispose();
});
test("full app restart checks saved progress and recent jobs, then downloads without resubmitting", async () => {
  const first = harness({ canonical: B });
  await first.client.restore();
  first.client.start(input);
  await flush();
  first.client.dispose();
  first.shared.jobs[0] = row(B, "succeeded");
  const reopened = harness({ shared: first.shared });
  await reopened.client.restore();
  assert.equal(reopened.shared.posts.length, 1);
  assert.equal(reopened.previews.length, 1);
  assert.ok(reopened.events.includes("recent"));
  assert.ok(reopened.shared.reads > 0);
  assert.deepEqual(reopened.client.snapshot.job.input, input);
  assert.equal(reopened.client.snapshot.job.progressId, B);
  reopened.client.dispose();
});
test("lost HTTP 202 acknowledgement recovers the backend canonical job using GETs only", async () => {
  const h = harness({
    submit: async (_body, _id, _signal, shared) => {
      shared.jobs = [row(B)];
      throw Error("acknowledgement lost");
    },
  });
  await h.client.restore();
  h.client.start(input);
  await flush();
  assert.equal(h.shared.posts.length, 1);
  assert.equal(h.client.snapshot.job.progressId, B);
  await h.time.advance(10000);
  assert.equal(h.shared.posts.length, 1);
  assert.equal(JSON.parse(h.shared.storage).progressId, B);
  h.client.dispose();
});
test("unconfirmed submissions never auto-repost; explicit Retry same job reuses its UUID", async () => {
  let accepted = false;
  const h = harness({
    submit: async (_body, id, _signal, shared) => {
      if (!accepted) throw Error("request never reached server");
      shared.jobs = [row(id)];
      return shared.jobs[0];
    },
  });
  await h.client.restore();
  h.client.start(input);
  await flush();
  await h.time.advance(10000);
  await h.time.advance(10000);
  assert.equal(h.shared.posts.length, 1);
  assert.equal(h.client.snapshot.job.status, "unknown");
  assert.deepEqual(h.client.snapshot.job.input, input);
  accepted = true;
  h.client.retry();
  h.client.retry();
  await flush();
  assert.deepEqual(
    h.shared.posts.map((post) => post.id),
    [A, A],
  );
  h.client.dispose();
});
test("temporary progress and result network errors recover without another AI operation", async () => {
  const h = harness();
  await h.client.restore();
  h.client.start(input);
  await flush();
  h.shared.offline = true;
  await h.time.advance(1750);
  assert.equal(h.client.snapshot.job.status, "queued");
  assert.match(h.client.snapshot.connectionError, /Reconnecting/);
  h.shared.offline = false;
  h.shared.jobs[0] = row(A, "succeeded");
  h.shared.resultFailures = 1;
  await h.time.advance(1750);
  assert.equal(h.previews.length, 0);
  assert.match(h.client.snapshot.connectionError, /finished/);
  await h.time.advance(5000);
  assert.equal(h.previews.length, 1);
  assert.equal(h.shared.posts.length, 1);
  h.client.dispose();
});
test("backgrounding before the acceptance response still saves the canonical ID", async () => {
  const accepted = deferred();
  const h = harness({ submit: () => accepted.promise });
  await h.client.restore();
  h.client.start(input);
  await flush();
  h.client.setActive(false);
  accepted.resolve(row(B));
  await flush();
  assert.equal(h.shared.posts[0].signal.aborted, false);
  assert.equal(JSON.parse(h.shared.storage).progressId, B);
  h.client.dispose();
  h.shared.jobs = [row(B, "succeeded")];
  const reopened = harness({ shared: h.shared });
  await reopened.client.restore();
  assert.equal(reopened.previews.length, 1);
  assert.equal(reopened.shared.posts.length, 1);
  reopened.client.dispose();
});
test("failed and interrupted states preserve inputs and never automatically rerun", async () => {
  for (const status of ["failed", "interrupted"]) {
    const h = harness();
    await h.client.restore();
    h.client.start(input);
    await flush();
    h.shared.jobs[0] = row(A, status);
    await h.time.advance(1750);
    assert.equal(h.client.snapshot.job.status, status);
    assert.ok(h.client.snapshot.terminalError);
    assert.deepEqual(h.client.snapshot.job.input, input);
    await h.time.advance(10000);
    assert.equal(h.shared.posts.length, 1);
    h.client.retry();
    await flush();
    assert.equal(h.shared.posts.length, 2);
    assert.notEqual(h.shared.posts[0].id, h.shared.posts[1].id);
    h.client.dispose();
  }
});
test("storage failure prevents submission and disposal never deletes the recoverable record", async () => {
  const h = harness({ storageFails: true });
  await h.client.restore();
  h.client.start(input);
  await flush();
  assert.equal(h.shared.posts.length, 0);
  assert.deepEqual(h.client.snapshot.job.input, input);
  h.client.dispose();
  const accepted = harness();
  await accepted.client.restore();
  accepted.client.start(input);
  await flush();
  const saved = accepted.shared.storage;
  accepted.client.dispose();
  assert.equal(accepted.shared.storage, saved);
});
test("recent recovery does not reopen a delivered job or substitute an older job for an unconfirmed submission", async () => {
  const h = harness();
  await h.client.restore();
  h.client.start(input);
  await flush();
  h.shared.jobs[0] = row(A, "succeeded");
  await h.time.advance(1750);
  h.client.dispose();
  const reopened = harness({
    shared: h.shared,
    nextId: B,
    submit: async () => {
      throw Error("offline submission");
    },
  });
  await reopened.client.restore();
  assert.equal(reopened.previews.length, 0);
  reopened.shared.jobs.push({ ...row(OLD, "succeeded"), started_at: "2026-10-26T00:00:00Z" });
  reopened.client.start(input);
  await flush();
  assert.equal(reopened.previews.length, 0);
  reopened.client.dispose();
});
test("job parsers accept all durable states and result/recent endpoints use owner bearer auth", async () => {
  for (const status of ["queued", "running", "succeeded", "failed", "interrupted"])
    assert.equal(types.parseTailoringJob(row(A, status)).status, status);
  assert.throws(
    () => types.parseTailoringJob({ ...row(), progress_id: "unsafe" }),
    /incomplete job/,
  );
  assert.throws(() => types.parseRecentTailoringJobs([]), /recent jobs/);
  const oldFetch = global.fetch,
    oldUrl = process.env.EXPO_PUBLIC_RESUME_API_URL,
    requests = [];
  process.env.EXPO_PUBLIC_RESUME_API_URL = "https://durable-job-test.invalid";
  const api = load("lib/cv/api.ts", null, {
    "@/lib/supabase": {
      supabase: {
        auth: {
          getSession: async () => ({
            data: {
              session: {
                access_token: "owner-token",
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
        url.endsWith("recent") ? { jobs: [row()] } : { ...makeReview(), progress_id: A },
      ),
      { status: 200 },
    );
  };
  try {
    const signal = new AbortController().signal;
    assert.equal((await api.recentTailoringJobs("owner", signal))[0].progress_id, A);
    assert.equal(
      (await api.tailoringJobResult("owner", A, signal)).tailoring_id,
      makeReview().tailoring_id,
    );
    requests.forEach((request) => {
      assert.equal(request.method, "GET");
      assert.equal(request.headers.Authorization, "Bearer owner-token");
    });
    assert.ok(requests[1].url.endsWith("/tailor/jobs/" + A + "/result"));
    assert.equal(requests.filter((request) => request.method === "POST").length, 0);
  } finally {
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.EXPO_PUBLIC_RESUME_API_URL;
    else process.env.EXPO_PUBLIC_RESUME_API_URL = oldUrl;
  }
});

test("recent jobs recover a completed worker even when no local cache is available", async () => {
  const h = harness();
  h.shared.jobs = [row(B, "succeeded")];
  await h.client.restore();
  assert.equal(h.shared.posts.length, 0);
  assert.equal(h.previews.length, 1);
  assert.equal(h.client.snapshot.job.progressId, B);
  assert.equal(h.client.snapshot.job.input, null);
  assert.equal(JSON.parse(h.shared.storage).delivered, true);
  h.client.dispose();
});
test("reopening with an unconfirmed job never automatically sends another POST", async () => {
  const first = harness({
    submit: async () => {
      throw Error("connection lost before acceptance");
    },
  });
  await first.client.restore();
  first.client.start(input);
  await flush();
  first.client.dispose();
  const reopened = harness({ shared: first.shared });
  await reopened.client.restore();
  await reopened.time.advance(10000);
  assert.equal(reopened.shared.posts.length, 1);
  assert.equal(reopened.client.snapshot.job.progressId, A);
  assert.deepEqual(reopened.client.snapshot.job.input, input);
  reopened.client.retry();
  await flush();
  assert.deepEqual(
    reopened.shared.posts.map((post) => post.id),
    [A, A],
  );
  reopened.client.dispose();
});
