const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const { makeReview, tailoringId } = require("./fixtures/tailoring-review.cjs");
const root = path.resolve(__dirname, "..");
function loadSource(relative, mocks = {}) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: relative,
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("@/")) return loadSource(name.slice(2) + ".ts", mocks);
    return require(name);
  };
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const types = loadSource("lib/tailoring/types.ts");
const { compareWords } = loadSource("lib/tailoring/diff.ts");

test("review uses server scores, changes and warnings and keeps the complete preview", () => {
  const raw = makeReview();
  const result = types.parseTailoringPreview(raw);
  assert.equal(types.atsScore(result.review), 76);
  assert.deepEqual(result.review.score_history, [76]);
  assert.deepEqual(result.preview.writing, { score: 70 });
  assert.deepEqual(result.review.change_summary, raw.review.change_summary);
  assert.deepEqual(result.review.change_sections, raw.review.change_sections);
  assert.deepEqual(result.review.keyword_options.needs_attestation, ["OPC-UA"]);
  assert.deepEqual(result.review.warnings, raw.review.warnings);
});
test("missing optional score and summary are unavailable rather than invented zeroes", () => {
  const raw = makeReview();
  delete raw.review.ats_score;
  delete raw.review.change_summary;
  const result = types.parseTailoringPreview(raw);
  assert.equal(types.atsScore(result.review), null);
  assert.equal(result.review.change_summary.skills_added, null);
  assert.match(result.review.warnings.join(" "), /complete change summary/);
});
test("mismatched IDs and invalid keyword limits cannot become a usable review", () => {
  const raw = makeReview();
  raw.review.preview_id = "old-id";
  assert.throws(() => types.parseTailoringPreview(raw), /incomplete review/);
  const invalid = makeReview();
  invalid.review.keyword_options.remaining_slots = -1;
  assert.throws(() => types.parseTailoringPreview(invalid), /incomplete review/);
});
test("missing comparisons become a visible warning and unknown sections survive", () => {
  const raw = makeReview();
  raw.review.change_sections = [];
  assert.match(
    types.parseTailoringPreview(raw).review.warnings.join(" "),
    /change details are unavailable/,
  );
  raw.review.change_sections = [
    {
      type: "other",
      items: [
        {
          field_type: "other",
          field_path: "other",
          change_type: "modified",
          original_value: "A",
          new_value: "B",
          confidence: "medium",
        },
      ],
    },
  ];
  assert.equal(types.parseTailoringPreview(raw).review.change_sections[0].type, "other");
});
test("expiry is based on the actual server timestamp", () => {
  const raw = makeReview();
  raw.review.preview_expires_at = "2020-01-01T00:00:00Z";
  assert.equal(types.previewHasExpired(types.parseTailoringPreview(raw)), true);
  assert.equal(types.previewHasExpired(types.parseTailoringPreview(makeReview())), false);
});
test("word comparisons preserve every character and mark only changed wording", () => {
  const before = "Built  systems.\nMaintained PLCs.";
  const after = "Built reliable systems.\nMaintained PLCs.";
  const diff = compareWords(before, after);
  assert.equal(diff.before.map((part) => part.text).join(""), before);
  assert.equal(diff.after.map((part) => part.text).join(""), after);
  assert.match(
    diff.after
      .filter((part) => part.changed)
      .map((part) => part.text)
      .join(""),
    /reliable/,
  );
  assert.ok(diff.after.some((part) => !part.changed && part.text.includes("Maintained PLCs.")));
  const long = "Long section ".repeat(1000);
  const large = compareWords(long, long + "Added sentence.");
  assert.equal(large.before.map((part) => part.text).join(""), long);
  assert.equal(large.after.map((part) => part.text).join(""), long + "Added sentence.");
});

test("authenticated mobile requests use fresh preview IDs and explicit attestation", async () => {
  const oldFetch = global.fetch;
  const oldUrl = process.env.EXPO_PUBLIC_RESUME_API_URL;
  process.env.EXPO_PUBLIC_RESUME_API_URL = "https://isolated-review-test.invalid";
  const requests = [];
  const responses = [
    makeReview(),
    makeReview("preview-2", 79, ["PLC", "OPC-UA"], [76, 79]),
    makeReview("preview-3", 78, ["PLC", "OPC-UA", "Python"], [76, 79, 78]),
    { tailoring_id: tailoringId, status: "ready", tailored_cv: { resume_id: "saved-result" } },
  ];
  global.fetch = async (url, init) => {
    requests.push({ url, ...init });
    return new Response(JSON.stringify(responses.shift()), { status: 200 });
  };
  const api = loadSource("lib/cv/api.ts", {
    "@/lib/supabase": {
      supabase: {
        auth: {
          getSession: async () => ({
            data: {
              session: {
                access_token: "isolated-token",
                user: { id: "test-owner" },
                expires_at: Date.now() / 1000 + 3600,
              },
            },
          }),
        },
      },
    },
  });
  try {
    const signal = new AbortController().signal;
    const first = await api.loadTailoringReview("test-owner", tailoringId, signal);
    const second = await api.applyTailoringKeywords(
      "test-owner",
      tailoringId,
      first.preview.preview_id,
      [
        { keyword: "PLC", attested: false },
        { keyword: "OPC-UA", attested: true },
      ],
      signal,
    );
    const third = await api.applyTailoringKeywords(
      "test-owner",
      tailoringId,
      second.preview.preview_id,
      [{ keyword: "Python", attested: false }],
      signal,
    );
    assert.deepEqual(third.review.score_history, [76, 79, 78]);
    await api.confirmTailoring("test-owner", tailoringId, signal);
    assert.equal(requests.length, 4);
    requests.forEach((request) =>
      assert.equal(request.headers.Authorization, "Bearer isolated-token"),
    );
    assert.deepEqual(JSON.parse(requests[1].body), {
      expected_preview_id: "preview-1",
      keywords: [
        { keyword: "PLC", attested: false },
        { keyword: "OPC-UA", attested: true },
      ],
    });
    assert.equal(JSON.parse(requests[2].body).expected_preview_id, "preview-2");
    assert.equal(requests[3].body, undefined);
    assert.equal(requests[3].headers["Content-Type"], undefined);
    for (const status of [409, 422, 503]) {
      let count = 0;
      global.fetch = async () => {
        count++;
        return new Response(
          JSON.stringify({
            detail:
              status === 422
                ? [{ msg: "Choose distinct keywords" }]
                : "Draft changed. Refresh review",
          }),
          { status },
        );
      };
      await assert.rejects(
        api.applyTailoringKeywords(
          "test-owner",
          tailoringId,
          "preview-3",
          [{ keyword: "Python", attested: false }],
          signal,
        ),
        (error) => error.status === status,
      );
      assert.equal(count, 1, "mutations are never blindly retried");
    }
    global.fetch = async () =>
      new Response(JSON.stringify(makeReview("preview-3")), { status: 200 });
    await assert.rejects(
      api.applyTailoringKeywords(
        "test-owner",
        tailoringId,
        "preview-3",
        [{ keyword: "Python", attested: false }],
        signal,
      ),
      /outdated keyword review/,
    );
  } finally {
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.EXPO_PUBLIC_RESUME_API_URL;
    else process.env.EXPO_PUBLIC_RESUME_API_URL = oldUrl;
  }
});
