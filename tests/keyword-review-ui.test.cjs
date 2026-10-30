const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const React = require("react");
const { makeReview } = require("./fixtures/tailoring-review.cjs");
const root = path.resolve(__dirname, "..");
function loadSource(relative, mocks = {}) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const result = ts.transpileModule(source, {
    fileName: relative,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  assert.equal(result.diagnostics.length, 0);
  const loaded = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("@/")) {
      const base = name.slice(2);
      return loadSource(
        base + (fs.existsSync(path.join(root, base + ".ts")) ? ".ts" : ".tsx"),
        mocks,
      );
    }
    return require(name);
  };
  new Function("require", "module", "exports", result.outputText)(
    localRequire,
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}
const warnings = loadSource("lib/tailoring/warnings.ts");
const grounding =
  "GROUNDING_REVIEW_REQUIRED: Review workExperience[0].description[1] against the source resume.";
test("grounding warnings stay intact, appear in Changes and Save with human locations", () => {
  const original = [grounding, "Check all qualifications."];
  assert.deepEqual(warnings.reviewWarningsForStep(original, 0), [original[1]]);
  for (const step of [1, 2]) {
    const messages = warnings.reviewWarningsForStep(original, step);
    assert.match(messages[0], /bullet 2 in work experience 1/);
    assert.match(messages[0], /original CV/);
    assert.match(messages[0], /Only keep claims you can support/);
    assert.doesNotMatch(messages[0], /GROUNDING|workExperience\[/);
    assert.equal(messages[1], original[1]);
  }
  assert.equal(original[0], grounding);
  const unknown = warnings.readableReviewWarning(
    "GROUNDING_REVIEW_REQUIRED: A new source location",
  );
  assert.match(unknown, /verify the experience changes against your original CV/);
  assert.doesNotMatch(unknown, /highlighted|GROUNDING/);
});

function nodes(element) {
  if (!element || typeof element !== "object") return [];
  if (Array.isArray(element)) return element.flatMap(nodes);
  return [element, ...nodes(element.props?.children)];
}
function text(element) {
  if (element == null || typeof element === "boolean") return "";
  if (Array.isArray(element)) return element.map(text).join("");
  if (typeof element !== "object") return String(element);
  return text(element.props?.children);
}
const theme = { colors: { primary: "purple", border: "gray", mutedForeground: "silver" } };
const primitivesMocks = {
  react: { ...React, useMemo: (fn) => fn() },
  "react-native": { Pressable: "Pressable", View: "View" },
  "@/components/ui/text": { Text: "Text" },
  "@/lib/icons/LucideIcon": { __esModule: true, default: "Icon" },
  "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
  "@/theming/ThemeProvider": { useTheme: () => ({ theme }) },
};
const primitives = loadSource("components/tailoring/ReviewPrimitives.tsx", primitivesMocks);
const previewContent = loadSource("components/tailoring/ReviewContent.tsx", primitivesMocks);

test("keyword toggles retain stable classes, checked state and visible selection on repeated presses", () => {
  const selected = new Set();
  const classes = new Map();
  for (const keyword of ["OPC-UA", "PLC", "Python", "OPC-UA", "PLC", "OPC-UA", "Python", "PLC"]) {
    const render = () =>
      primitives.KeywordOption({
        keyword,
        attestation: keyword === "OPC-UA",
        selected: selected.has(keyword),
        disabled: false,
        onPress: () => (selected.has(keyword) ? selected.delete(keyword) : selected.add(keyword)),
      });
    const before = render();
    before.props.onPress();
    const after = render();
    assert.equal(after.props.accessibilityRole, "checkbox");
    assert.equal(after.props.accessibilityState.checked, selected.has(keyword));
    assert.equal(after.props.className, before.props.className);
    const classList = nodes(after).map((node) => node.props.className);
    if (classes.has(keyword)) assert.deepEqual(classList, classes.get(keyword));
    classes.set(keyword, classList);
    assert.equal(after.props.style.borderColor, selected.has(keyword) ? "purple" : "gray");
    const check = nodes(after).find((node) => node.props.name === "Check");
    assert.equal(check.props.style.opacity, selected.has(keyword) ? 1 : 0);
  }
  assert.deepEqual([...selected].sort(), ["OPC-UA", "PLC"]);
  const disabled = primitives.KeywordOption({
    keyword: "OPC-UA",
    attestation: true,
    selected: true,
    disabled: true,
    onPress: () => {},
  });
  assert.equal(disabled.props.disabled, true);
  assert.equal(disabled.props.accessibilityState.disabled, true);
});

function screenHarness() {
  const preview = makeReview();
  preview.review.keyword_options.supported = Array.from(
    { length: 40 },
    (_, i) => `Existing ${i + 1}`,
  );
  preview.review.keyword_options.needs_attestation = Array.from(
    { length: 35 },
    (_, i) => `Confirm ${i + 1}`,
  );
  preview.review.keyword_options.supported.push("EXISTING 1", "existing 40");
  preview.review.keyword_options.needs_attestation.push("confirm 35", "EXISTING 1");
  preview.review.warnings = [grounding, "2 change(s) rejected during verification"];
  const run = {
    preview,
    step: 0,
    status: "success",
    hydrating: false,
    reviewActivity: null,
    selectedKeywords: [],
    setStep: (step) => {
      run.step = step;
    },
    toggleKeyword: (keyword, attested) => {
      const index = run.selectedKeywords.findIndex((item) => item.keyword === keyword);
      if (index >= 0) run.selectedKeywords.splice(index, 1);
      else run.selectedKeywords = [...run.selectedKeywords, { keyword, attested }];
    },
  };
  const stateValues = [];
  let stateIndex = 0;
  const mocks = {
    ...primitivesMocks,
    react: {
      ...React,
      useCallback: (fn) => fn,
      useEffect: () => {},
      useRef: () => ({ current: null }),
      useState: (init) => {
        const index = stateIndex++;
        if (!(index in stateValues))
          stateValues[index] = typeof init === "function" ? init() : init;
        return [
          stateValues[index],
          (value) => {
            stateValues[index] = typeof value === "function" ? value(stateValues[index]) : value;
          },
        ];
      },
    },
    "expo-router": {
      router: {},
      Stack: { Screen: "StackScreen" },
      useFocusEffect: () => {},
      useLocalSearchParams: () => ({}),
    },
    "react-native": {
      ActivityIndicator: "ActivityIndicator",
      BackHandler: {},
      FlatList: "FlatList",
      View: "View",
    },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 0 }) },
    "@/components/layout/AppScreen": { AppScreen: "AppScreen" },
    "@/components/layout/ScreenHeader": { ScreenHeader: "ScreenHeader" },
    "@/components/ui/button": { Button: "Button" },
    "@/components/cv/Notice": { Notice: "Notice" },
    "@/components/tailoring/ReviewContent": {
      reviewItems: previewContent.reviewItems,
      ReviewContent: "ReviewContent",
    },
    "@/components/tailoring/ReviewPrimitives": primitives,
    "@/lib/auth/AuthProvider": {
      useAuth: () => ({ session: { user: { id: "test-owner" } }, loading: false }),
    },
    "@/lib/tailoring/TailoringProvider": { useTailoring: () => run },
  };
  const Screen = loadSource("app/tailoring/review.tsx", mocks).default;
  return {
    run,
    render: () => {
      stateIndex = 0;
      return Screen();
    },
  };
}
test("all 75 returned suggestions share one list; selections persist and Continue opens Changes", () => {
  const { run, render } = screenHarness();
  let screen = render();
  let list = nodes(screen).find((node) => node.type === "FlatList");
  const keywords = list.props.data.filter((item) => item.kind === "keyword");
  assert.equal(keywords.length, 75, "30 is an application limit, never a list page size");
  assert.equal(keywords.at(-1).keyword, "Confirm 35");
  const safety = list.props.data.filter((item) => item.kind === "warning");
  assert.equal(safety.length, 1);
  assert.match(safety[0].message, /Only select skills you really have/);
  assert.equal(list.props.data.find((item) => item.id === "attestation-heading").body, "");
  assert.equal(new Set(keywords.map((item) => item.keyword.toLowerCase())).size, 75);
  assert.equal(
    run.preview.review.keyword_options.supported.length,
    42,
    "display deduplication never alters server options",
  );
  assert.ok(!nodes(screen).some((node) => node.type === "Button" && text(node) === "Skip"));
  const header = text(list.props.ListHeaderComponent);
  assert.doesNotMatch(header, /30 total|keywords can still|Only select skills/);
  assert.match(header, /Some job keywords are missing from your CV/);
  for (const name of ["Existing 1", "Confirm 35", "Confirm 2", "Confirm 35", "Confirm 35"]) {
    list = nodes(render()).find((node) => node.type === "FlatList");
    const item = list.props.data.find((item) => item.kind === "keyword" && item.keyword === name);
    const option = list.props.renderItem({ item }).props.children;
    assert.equal(option.type, primitives.KeywordOption);
    option.props.onPress();
  }
  screen = render();
  assert.ok(
    nodes(screen).some((node) => node.type === "Text" && text(node) === "Apply Keywords (3)"),
  );
  assert.equal(run.selectedKeywords.find((item) => item.keyword === "Confirm 35").attested, true);
  assert.equal(run.selectedKeywords.find((item) => item.keyword === "Existing 1").attested, false);
  const continueButton = nodes(screen).find(
    (node) => node.type === "Button" && text(node) === "Continue to Changes",
  );
  assert.equal(continueButton.props.disabled, false);
  continueButton.props.onPress();
  assert.equal(run.step, 1);
  list = nodes(render()).find((node) => node.type === "FlatList");
  assert.ok(
    list.props.data.some(
      (item) => item.kind === "warning" && /bullet 2 in work experience 1/.test(item.message),
    ),
  );
  assert.equal(run.selectedKeywords.length, 3);
  assert.ok(
    list.props.data.some(
      (item) => item.kind === "warning" && /2 suggested changes were excluded/.test(item.message),
    ),
  );
});

test("verification rejection summaries use friendly copy outside Keywords without hiding other warnings", () => {
  for (const count of [1, 7]) {
    const summary = `${count} change(s) rejected during verification`;
    const messages = [summary, "Please check your qualifications."];
    assert.deepEqual(warnings.reviewWarningsForStep(messages, 0), [messages[1]]);
    for (const step of [1, 2]) {
      assert.equal(
        warnings.reviewWarningsForStep(messages, step)[0],
        `${count} suggested ${count === 1 ? "change was" : "changes were"} excluded during verification. Check the updated text before saving.`,
      );
    }
    assert.equal(messages[0], summary);
    assert.equal(
      warnings.isRejectedChangeSummary(`  ${count} CHANGE(S) REJECTED DURING VERIFICATION  `),
      true,
    );
  }
  const other = "Verification failed. Reload before continuing.";
  assert.deepEqual(warnings.reviewWarningsForStep([other], 0), [other]);
});

test("summary cards keep primary metrics and only positive optional counts", () => {
  const summary = {
    skills_added: 0,
    descriptions_modified: 0,
    skills_removed: 0,
    certifications_added: 0,
    high_risk_changes: 6,
  };
  let cards = primitives.ChangeSummaryCards({ summary });
  assert.match(text(cards), /Skills Added/);
  assert.match(text(cards), /Descriptions Modified/);
  assert.doesNotMatch(text(cards), /Skills Removed|Certifications Added|High Risk Changes/);
  summary.skills_removed = 2;
  summary.certifications_added = 3;
  cards = primitives.ChangeSummaryCards({ summary });
  assert.match(text(cards), /2Skills Removed/);
  assert.match(text(cards), /3Certifications Added/);
  assert.equal(nodes(cards).filter((node) => node.props.className?.includes("w-[48%]")).length, 4);
  summary.skills_removed = null;
  summary.certifications_added = null;
  assert.doesNotMatch(
    text(primitives.ChangeSummaryCards({ summary })),
    /Skills Removed|Certifications Added/,
  );
});

test("simplified Changes preserves individual risks, dynamic counts and unmatched warnings", () => {
  const { run, render } = screenHarness();
  run.step = 1;
  let list = nodes(render()).find((node) => node.type === "FlatList");
  assert.ok(!list.props.data.some((item) => item.id === "verification-toggle"));
  for (const [section, title] of [
    ["summary", "Summary Changes"],
    ["skill", "Skills Changes"],
    ["description", "Description Changes"],
  ]) {
    const accordion = list.props.data.find((item) => item.section === section);
    assert.equal(accordion.title, title);
    assert.ok(
      accordion.subtitle.startsWith(
        String(
          run.preview.review.change_sections.find((item) => item.type === section).items.length,
        ),
      ),
    );
  }
  // Every original comparison, including high-risk ones, is still expandable.
  for (const section of run.preview.review.change_sections) {
    list = nodes(render()).find((node) => node.type === "FlatList");
    const accordion = list.props.data.find((item) => item.section === section.type);
    if (section.type !== "summary")
      list.props.renderItem({ item: accordion }).props.children.props.onPress();
  }
  list = nodes(render()).find((node) => node.type === "FlatList");
  assert.deepEqual(
    list.props.data
      .filter((item) => item.kind === "change" || item.kind === "skill-added")
      .map((item) => item.change),
    run.preview.review.change_sections.flatMap((section) => section.items),
  );
  assert.ok(
    list.props.data.some(
      (item) => item.kind === "warning" && /bullet 2 in work experience 1/.test(item.message),
    ),
  );
  assert.ok(!list.props.data.some((item) => item.id === "resume-toggle"));
  run.step = 2;
  const saveList = nodes(render()).find((node) => node.type === "FlatList");
  assert.ok(saveList.props.data.some((item) => item.id === "resume-heading"));
  assert.ok(
    !saveList.props.data.some(
      (item) => item.id === "resume-toggle" || item.id === "save-review-toggle",
    ),
  );
  run.step = 1;
  // A warning with an exact comparison path belongs beside that comparison.
  const target = run.preview.review.change_sections.find(
    (section) => section.type === "description",
  ).items[0];
  run.preview.review.warnings.push(`Check ${target.field_path} against your original CV.`);
  list = nodes(render()).find((node) => node.type === "FlatList");
  const changeIndex = list.props.data.findIndex((item) => item.change === target);
  assert.equal(list.props.data[changeIndex + 1].message, run.preview.review.warnings.at(-1));
  run.preview.review.change_sections = [];
  list = nodes(render()).find((node) => node.type === "FlatList");
  assert.ok(list.props.data.some((item) => item.id === "verification-unavailable"));
  assert.ok(list.props.data.some((item) => item.message === run.preview.review.warnings.at(-1)));
  run.preview.review.change_summary.high_risk_changes = 0;
  list = nodes(render()).find((node) => node.type === "FlatList");
  assert.ok(!list.props.data.some((item) => item.id === "verification-unavailable"));
});

test("Summary comparisons preserve complete paragraphs with full Before strikethrough and word highlights", () => {
  const original =
    "Built devices and systems.\n\n" +
    "Maintained reliable equipment across multiple sites. ".repeat(25);
  const updated =
    "Built automation and systems.\n\n" +
    "Maintained reliable equipment across multiple sites. ".repeat(25);
  const change = {
    field_type: "summary",
    field_path: "summary",
    change_type: "modified",
    confidence: "medium",
    original_value: original,
    new_value: updated,
  };
  const comparison = primitives.ChangeComparison({ change, summaryComparison: true });
  const sections = nodes(comparison).filter(
    (node) => node.type === "View" && node.props.className?.includes("border-l-2"),
  );
  const before = nodes(sections[0]).find((node) => node.type === "Text" && node.props.selectable);
  const after = nodes(sections[1]).find((node) => node.type === "Text" && node.props.selectable);
  assert.equal(text(before), original);
  assert.equal(text(after), updated);
  const beforeParts = nodes(before).filter((node) => node !== before && node.type === "Text");
  assert.ok(beforeParts.every((node) => node.props.className.includes("line-through")));
  assert.ok(
    beforeParts.some(
      (node) => text(node).includes("devices") && node.props.className.includes("text-destructive"),
    ),
  );
  assert.ok(
    nodes(after).some(
      (node) => text(node).includes("automation") && node.props.className?.includes("text-primary"),
    ),
  );
  assert.ok(
    nodes(after).some((node) => node.props.className === "" && text(node).includes("Maintained")),
  );
  // Existing Skills/Descriptions styling does not acquire whole-paragraph deletion.
  const other = primitives.ChangeComparison({ change: { ...change, field_type: "description" } });
  const otherBefore = nodes(other).find((node) => node.type === "Text" && node.props.selectable);
  assert.ok(
    nodes(otherBefore).some(
      (node) =>
        node !== otherBefore && node.props.className === "" && text(node).includes("Maintained"),
    ),
  );
});

test("connected accordions keep compact skill additions without altering verification data", () => {
  const { run, render } = screenHarness();
  run.step = 1;
  let list = nodes(render()).find((node) => node.type === "FlatList");
  for (const type of ["skill", "description"]) {
    list.props
      .renderItem({ item: list.props.data.find((item) => item.section === type) })
      .props.children.props.onPress();
    list = nodes(render()).find((node) => node.type === "FlatList");
  }
  for (const type of ["summary", "skill", "description"]) {
    const group = list.props.data.filter((item) => item.connected === type);
    assert.ok(group.length > 1);
    const firstIndex = list.props.data.indexOf(group[0]);
    assert.deepEqual(list.props.data.slice(firstIndex, firstIndex + group.length), group);
    for (let index = 0; index < group.length; index++) {
      const row = list.props.renderItem({ item: group[index] });
      assert.ok(row.props.className.includes("border-x"));
      assert.equal(row.props.className.includes("mb-3"), index === group.length - 1);
      if (index === 0) {
        assert.ok(row.props.className.includes("rounded-t-2xl"));
        assert.equal(row.props.children.props.embedded, true);
      }
      if (index === group.length - 1) assert.ok(row.props.className.includes("rounded-b-2xl"));
    }
  }
  const skill = list.props.data.find((item) => item.kind === "skill-added");
  const skillContent = list.props.renderItem({ item: skill }).props.children;
  assert.equal(text(skillContent), skill.change.new_value);
  assert.ok(nodes(skillContent).some((node) => node.props.className?.includes("text-success")));
  assert.doesNotMatch(text(skillContent), /Before|After|High risk|Verify this claim/);
  assert.ok(
    list.props.data.some((item) => item.kind === "change" && item.change.change_type === "removed"),
  );
  run.preview.review.warnings.push("Check additional.technicalSkills against your original CV.");
  list = nodes(render()).find((node) => node.type === "FlatList");
  assert.ok(!list.props.data.some((item) => item.message === run.preview.review.warnings.at(-1)));
  // Closing a section leaves a single fully rounded header.
  list.props
    .renderItem({ item: list.props.data.find((item) => item.section === "skill") })
    .props.children.props.onPress();
  list = nodes(render()).find((node) => node.type === "FlatList");
  assert.equal(list.props.data.filter((item) => item.connected === "skill").length, 1);
  run.step = 2;
  const saveList = nodes(render()).find((node) => node.type === "FlatList");
  assert.ok(saveList.props.data.some((item) => item.kind === "resume"));
  assert.ok(
    !saveList.props.data.some(
      (item) => item.id === "resume-toggle" || item.id === "save-review-toggle",
    ),
  );
  assert.equal(
    run.preview.review.warnings.at(-1),
    "Check additional.technicalSkills against your original CV.",
  );
  assert.equal(skill.change.confidence, "high");
});

test("descriptions share Summary replacement treatment without altering backend paragraphs", () => {
  const original = "Built devices.\n\n" + "Kept production reliable. ".repeat(30);
  const updated = "Built automation.\n\n" + "Kept production reliable. ".repeat(30);
  const change = {
    field_type: "description",
    field_path: "workExperience[0].description[0]",
    change_type: "modified",
    confidence: "medium",
    original_value: original,
    new_value: updated,
  };
  const comparison = primitives.ChangeComparison({
    change,
    descriptionComparison: true,
    embedded: true,
  });
  assert.ok(!comparison.props.className.includes("rounded-2xl"));
  const texts = nodes(comparison).filter((node) => node.type === "Text" && node.props.selectable);
  assert.equal(text(texts[0]), original);
  assert.equal(text(texts[1]), updated);
  assert.ok(
    nodes(texts[0])
      .filter((node) => node !== texts[0])
      .every((node) => node.props.className.includes("line-through")),
  );
  assert.ok(
    nodes(texts[0]).some(
      (node) =>
        text(node).includes("devices") && node.props.className?.includes("text-destructive"),
    ),
  );
  assert.ok(
    nodes(texts[1]).some(
      (node) => text(node).includes("automation") && node.props.className?.includes("text-primary"),
    ),
  );
});

test("Save keeps live metrics and directly displays the complete read-only resume without accordions", () => {
  const { run, render } = screenHarness();
  run.step = 2;
  run.preview = makeReview("latest-preview", 81, ["PLC", "OPC-UA"], [76, 81]);
  const before = JSON.stringify(run.preview);
  const screen = render();
  const list = nodes(screen).find((node) => node.type === "FlatList");
  const metrics = nodes(list.props.ListHeaderComponent).filter(
    (node) =>
      node.props.accessibilityLabel &&
      /^(ATS Score|Changes Made|Keywords Applied):/.test(node.props.accessibilityLabel),
  );
  assert.deepEqual(
    metrics.map((node) => node.props.accessibilityLabel),
    ["ATS Score: 81", "Changes Made: 6", "Keywords Applied: 2"],
  );
  assert.ok(metrics.every((node) => node.props.className.includes("flex-1")));
  assert.match(text(list.props.ListHeaderComponent), /Your original CV stays unchanged\./);
  assert.equal(list.props.data[0].title, "Your tailored CV");
  assert.match(list.props.data[0].body, /Read-only/);
  assert.ok(!list.props.data.some((item) => item.kind === "section"));
  const resume = list.props.data.filter((item) => item.kind === "resume");
  assert.deepEqual(
    resume.map((item) => item.item),
    previewContent.reviewItems(run.preview.preview, "resume"),
  );
  assert.equal(resume[0].item.id, "personalInfo");
  assert.ok(!nodes(screen).some((node) => node.type === "TextInput"));
  assert.equal(
    JSON.stringify(run.preview),
    before,
    "review never changes draft facts or verification flags",
  );
});

test("Save preserves Back, explicit confirmation, loading, errors, expiration and acknowledgement", () => {
  const { run, render } = screenHarness();
  run.step = 2;
  let calls = 0;
  run.confirm = () => {
    calls++;
  };
  let screen = render();
  let back = nodes(screen).find((node) => node.type === "Button" && text(node) === "Back");
  const draft = run.preview;
  back.props.onPress();
  assert.equal(run.step, 1);
  assert.equal(run.preview, draft);
  run.step = 2;
  screen = render();
  let confirm = nodes(screen).find(
    (node) => node.type === "Button" && text(node) === "Confirm & Save",
  );
  assert.equal(calls, 0);
  confirm.props.onPress();
  assert.equal(calls, 1);
  assert.doesNotMatch(text(render()), /Your tailored CV is saved/);
  run.reviewActivity = "confirm";
  screen = render();
  confirm = nodes(screen).find((node) => node.type === "Button" && text(node) === "Saving…");
  assert.equal(confirm.props.disabled, true);
  assert.ok(nodes(confirm).some((node) => node.type === "ActivityIndicator"));
  back = nodes(screen).find((node) => node.type === "Button" && text(node) === "Back");
  assert.equal(back.props.disabled, true);
  run.reviewActivity = null;
  run.reviewProblem = {
    kind: "retry",
    message: "The save could not be confirmed. Your draft is preserved.",
  };
  screen = render();
  const list = nodes(screen).find((node) => node.type === "FlatList");
  assert.ok(
    nodes(list.props.ListHeaderComponent).some(
      (node) => node.type === "Notice" && node.props.message === run.reviewProblem.message,
    ),
  );
  assert.equal(run.preview, draft);
  run.preview.review.preview_expires_at = "2020-01-01T00:00:00Z";
  screen = render();
  confirm = nodes(screen).find((node) => node.type === "Button" && text(node) === "Confirm & Save");
  assert.equal(confirm.props.disabled, true);
  run.saved = true;
  assert.match(text(render()), /Your tailored CV is saved/);
});

test("resume ordering uses standards, retains unknown content and handles additional/custom containers", () => {
  const resume = {
    extraResearch: "Kept unknown research",
    additional: {
      languages: ["English"],
      certificationsTraining: ["Actual certification"],
      technicalSkills: ["PLC"],
      professionalSkills: ["Leadership"],
      awards: ["Actual award"],
    },
    personalProjects: [{ name: "Actual project", description: ["Real project details"] }],
    education: [{ degree: "Actual degree" }],
    workExperience: [
      { title: "Engineer", description: ["First bullet"] },
      { title: "Analyst", description: ["Second bullet"] },
    ],
    summary: "Complete original paragraph.\n\nSecond paragraph.",
    personalInfo: {
      github: "https://example.invalid/code",
      name: "Full Name",
      email: "name@example.invalid",
      title: "Engineer",
      phone: "123",
      location: "City",
      telegram: "@realcontact",
    },
    customSections: {
      community: { sectionType: "text", text: "Actual community work" },
      empty: { sectionType: "stringList", strings: [] },
    },
  };
  const before = JSON.stringify(resume);
  const items = previewContent.orderedResumeItems(resume);
  assert.deepEqual(
    items.map((item) => item.id),
    [
      "personalInfo",
      "summary",
      "workExperience0",
      "workExperience1",
      "education0",
      "additional.technicalSkills",
      "additional.professionalSkills",
      "additional.certificationsTraining",
      "personalProjects0",
      "additional.languages",
      "customSections.community",
      "extraResearch",
      "additional.awards",
    ],
  );
  assert.equal(items.find((item) => item.id === "workExperience1").continuation, true);
  assert.equal(items.find((item) => item.id === "workExperience0").continuation, false);
  assert.equal(items.find((item) => item.id === "summary").value, resume.summary);
  assert.equal(
    items.find((item) => item.id === "customSections.community").value,
    resume.customSections.community,
  );
  const profile = previewContent.ReviewContent({ item: items[0] });
  assert.match(
    text(profile),
    /^Full NameEngineername@example.invalid · 123 · City · https:\/\/example.invalid\/code/,
  );
  assert.ok(nodes(profile).some((node) => node.props.value?.telegram === "@realcontact"));
  assert.equal(JSON.stringify(resume), before);
});

test("explicit sectionMeta order and user section names survive while identity always stays first", () => {
  const resume = {
    education: [{ degree: "Degree" }],
    summary: "Summary",
    personalInfo: { name: "Name" },
    additional: { technicalSkills: ["Python"] },
    customSections: { volunteer: { sectionType: "text", text: "Actual volunteering" } },
    sectionMeta: [
      { key: "customSections.volunteer", displayName: "Community Service", order: 1 },
      { key: "education", order: 2 },
      { key: "summary", order: 3 },
      { key: "technicalSkills", order: 4 },
    ],
  };
  const items = previewContent.orderedResumeItems(resume);
  assert.deepEqual(
    items.map((item) => item.id),
    [
      "personalInfo",
      "customSections.volunteer",
      "education0",
      "summary",
      "additional.technicalSkills",
    ],
  );
  assert.equal(items[1].label, "Community Service");
  assert.ok(!items.some((item) => item.id === "sectionMeta"));
});

test("Save renders one continuous document with one heading per multi-entry section", () => {
  const { run, render } = screenHarness();
  run.step = 2;
  const resume = run.preview.preview.resume_preview;
  resume.workExperience.push({
    title: "Second position",
    company: "Second company",
    dates: "2018–2020",
    description: ["A complete long responsibility. ".repeat(30), "Another exact bullet."],
  });
  resume.education = [
    { degree: "First degree", institution: "First school", years: "2010–2014" },
    { degree: "Second degree", institution: "Second school", years: "2014–2016" },
  ];
  resume.unexpectedSection = { detail: "Unknown resume content remains." };
  const before = JSON.stringify(resume);
  const list = nodes(render()).find((node) => node.type === "FlatList");
  const rows = list.props.data.filter((item) => item.kind === "resume");
  const headings = [];
  for (let index = 0; index < rows.length; index++) {
    const wrapper = list.props.renderItem({ item: rows[index] });
    assert.ok(wrapper.props.className.includes("border-x"));
    assert.equal(wrapper.props.className.includes("rounded-t-2xl"), index === 0);
    assert.equal(wrapper.props.className.includes("rounded-b-2xl"), index === rows.length - 1);
    assert.equal(wrapper.props.className.includes("mb-3"), index === rows.length - 1);
    assert.equal(wrapper.props.children.props.document, true);
    const content = previewContent.ReviewContent(wrapper.props.children.props);
    assert.doesNotMatch(content.props.className, /rounded|bg-card/);
    headings.push(
      ...nodes(content)
        .filter((node) => node.props.accessibilityRole === "header")
        .map(text),
    );
  }
  assert.equal(headings.filter((value) => value === "Work Experience").length, 1);
  assert.equal(headings.filter((value) => value === "Education").length, 1);
  assert.equal(rows[0].item.profile, true);
  assert.equal(rows.filter((item) => item.item.id.startsWith("workExperience")).length, 2);
  assert.equal(rows.filter((item) => item.item.id.startsWith("education")).length, 2);
  assert.ok(rows.some((item) => item.item.value === resume.unexpectedSection));
  // Render the document's pure value components to verify every field and long
  // paragraph remains present in its original entry order.
  function presentationText(element) {
    if (element == null || typeof element === "boolean") return "";
    if (Array.isArray(element)) return element.map(presentationText).join("");
    if (typeof element !== "object") return String(element);
    if (typeof element.type === "function") return presentationText(element.type(element.props));
    return presentationText(element.props?.children);
  }
  const output = rows
    .map((item) =>
      presentationText(previewContent.ReviewContent({ item: item.item, document: true })),
    )
    .join("");
  assert.ok(output.includes(resume.workExperience[1].description[0]));
  assert.ok(output.includes("Second positionSecond company"));
  assert.ok(output.indexOf("First degree") < output.indexOf("Second degree"));
  assert.ok(output.includes("First school"));
  assert.ok(output.includes("Second school"));
  assert.equal(JSON.stringify(resume), before);
});
