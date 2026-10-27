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
  "react-native": { Pressable: "Pressable", View: "View" },
  "@/components/ui/text": { Text: "Text" },
  "@/lib/icons/LucideIcon": { __esModule: true, default: "Icon" },
  "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
  "@/theming/ThemeProvider": { useTheme: () => ({ theme }) },
};
const primitives = loadSource("components/tailoring/ReviewPrimitives.tsx", primitivesMocks);

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
  preview.review.warnings = [grounding];
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
  const mocks = {
    ...primitivesMocks,
    react: {
      ...React,
      useCallback: (fn) => fn,
      useEffect: () => {},
      useRef: () => ({ current: null }),
      useState: (init) => [typeof init === "function" ? init() : init, () => {}],
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
      reviewItems: () => [],
      ReviewContent: "ReviewContent",
    },
    "@/components/tailoring/ReviewPrimitives": primitives,
    "@/lib/auth/AuthProvider": {
      useAuth: () => ({ session: { user: { id: "test-owner" } }, loading: false }),
    },
    "@/lib/tailoring/TailoringProvider": { useTailoring: () => run },
  };
  const Screen = loadSource("app/tailoring/review.tsx", mocks).default;
  return { run, render: () => Screen() };
}
test("all 75 returned suggestions share one list; selections persist and Continue opens Changes", () => {
  const { run, render } = screenHarness();
  let screen = render();
  let list = nodes(screen).find((node) => node.type === "FlatList");
  const keywords = list.props.data.filter((item) => item.kind === "keyword");
  assert.equal(keywords.length, 75, "30 is an application limit, never a list page size");
  assert.equal(keywords.at(-1).keyword, "Confirm 35");
  assert.ok(!list.props.data.some((item) => item.kind === "warning"));
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
});
