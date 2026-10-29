import { useCallback, useEffect, useRef, useState } from "react";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, BackHandler, FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppScreen } from "@/components/layout/AppScreen";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/cv/Notice";
import { ReviewContent, reviewItems, type ReviewItem } from "@/components/tailoring/ReviewContent";
import {
  AtsScoreCard,
  ChangeComparison,
  ChangeSummaryCards,
  fieldLocation,
  formatScore,
  KeywordOption,
  ReviewStepper,
  SafetyNote,
  SectionToggle,
  sectionTitle,
} from "@/components/tailoring/ReviewPrimitives";
import { cn } from "@/lib/utils";
import { useTailoring } from "@/lib/tailoring/TailoringProvider";
import {
  atsScore,
  keywordKey,
  previewHasExpired,
  type KeywordPlacement,
  type ResumeChange,
  type ReviewStep,
} from "@/lib/tailoring/types";
import { reviewWarningsForStep } from "@/lib/tailoring/warnings";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTheme } from "@/theming/ThemeProvider";
import LucideIcon from "@/lib/icons/LucideIcon";

const stepCopy = [
  {
    title: "Optimize keywords",
    body: "Some job keywords are missing from your CV. Select skills you have to improve your match.",
  },
  {
    title: "Review changes",
    body: "See exactly what changed, and make sure every claim feels true to you.",
  },
  { title: "Confirm & save", body: "One final check before saving your tailored CV." },
];
type WizardItem = { connected?: string } & (
  | { id: string; kind: "heading"; title: string; body: string }
  | { id: string; kind: "keyword"; keyword: string; attestation: boolean }
  | {
      id: string;
      kind: "section";
      title: string;
      subtitle: string;
      section: string;
      highRisk?: boolean;
    }
  | {
      id: string;
      kind: "change";
      change: ResumeChange;
      summaryComparison?: boolean;
      descriptionComparison?: boolean;
    }
  | { id: string; kind: "resume"; item: ReviewItem }
  | { id: string; kind: "placement"; placement: KeywordPlacement }
  | { id: string; kind: "warning"; message: string }
  | { id: string; kind: "skill-added"; change: ResumeChange }
);

export default function TailoringReviewScreen() {
  const run = useTailoring();
  const { session, loading: authLoading } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tailoringId?: string }>();
  const routeId = typeof params.tailoringId === "string" ? params.tailoringId : undefined;
  const tailoringId = routeId ?? run.tailoringId ?? undefined;
  const { reloadReview, setStep } = run;
  const ownerId = session?.user?.id;
  const list = useRef<FlatList<WizardItem>>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["summary"]));
  const [now, setNow] = useState(Date.now());
  const review = run.preview?.review;
  const busy = run.hydrating || run.reviewActivity !== null || run.status === "running";
  const expired = run.preview
    ? previewHasExpired(run.preview, now) || run.reviewProblem?.kind === "expired"
    : false;
  const blocked =
    busy ||
    expired ||
    run.needsReload ||
    run.reviewProblem?.kind === "unavailable" ||
    run.reviewProblem?.kind === "auth";

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && ownerId && !run.hydrating && tailoringId) void reloadReview(tailoringId);
    }, [authLoading, ownerId, run.hydrating, tailoringId, reloadReview]),
  );
  useEffect(() => {
    setNow(Date.now());
    const expiration = review?.preview_expires_at ? Date.parse(review.preview_expires_at) : NaN;
    if (!Number.isFinite(expiration) || expiration <= Date.now()) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(expiration - Date.now() + 100, 2147483647),
    );
    return () => clearTimeout(timer);
  }, [review?.preview_expires_at]);
  useEffect(() => {
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (busy) return true;
      if (run.step > 0 && !run.saved) {
        setStep((run.step - 1) as ReviewStep);
        return true;
      }
      return false;
    });
    return () => back.remove();
  }, [busy, run.step, run.saved, setStep]);
  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [run.step, run.preview?.tailoring_id]);

  function close() {
    if (busy) return;
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/tailor");
  }
  function toggle(section: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }
  function regenerate() {
    if (run.input && run.start(run.input)) router.replace("/tailoring/processing");
  }

  const routeOptions = (
    <Stack.Screen options={{ title: "Review your resume", gestureEnabled: !busy }} />
  );
  if (run.saved)
    return (
      <AppScreen>
        {routeOptions}
        <ScreenHeader title="Resume saved" />
        <View className="flex-1 justify-center gap-6 px-6 pb-12">
          <View className="h-16 w-16 items-center justify-center rounded-3xl bg-success/10">
            <LucideIcon name="FileCheck" size={30} className="text-success" />
          </View>
          <View className="gap-3">
            <Text accessibilityRole="header" className="text-h2 text-foreground">
              Your tailored CV is saved
            </Text>
            <Text className="text-body leading-6 text-muted-foreground">
              Saved as a separate CV. Your original remains unchanged.
            </Text>
          </View>
          <Button onPress={() => router.replace("/(tabs)/tailor")} className="h-14 rounded-2xl">
            <Text>Done</Text>
          </Button>
        </View>
      </AppScreen>
    );
  if (!review || !run.preview)
    return (
      <AppScreen>
        {routeOptions}
        <ScreenHeader title="Resume review" />
        <View className="gap-5 px-6 pt-8">
          {authLoading || busy ? (
            <View className="flex-row items-center gap-3">
              <ActivityIndicator color={theme.colors.primary} />
              <Text className="text-body text-muted-foreground">Loading your review…</Text>
            </View>
          ) : (
            <>
              {run.reviewProblem ? (
                <Notice tone="error" message={run.reviewProblem.message} />
              ) : (
                <Text className="text-body leading-6 text-muted-foreground">
                  {!ownerId
                    ? "Sign in to load your tailored draft."
                    : "Choose a CV and paste a job description to create your tailored preview."}
                </Text>
              )}
              {ownerId && tailoringId ? (
                <Button onPress={() => void reloadReview(tailoringId)} className="h-12 rounded-xl">
                  <Text>Retry loading review</Text>
                </Button>
              ) : null}
              {!ownerId ? (
                <Button
                  onPress={() => router.navigate("/(tabs)/library/my-cvs")}
                  className="h-12 rounded-xl"
                >
                  <Text>Sign in</Text>
                </Button>
              ) : null}
              <Button
                variant="outline"
                onPress={() =>
                  run.status === "running" ? router.replace("/tailoring/processing") : close()
                }
                className="h-12 rounded-xl"
              >
                <Text>{run.status === "running" ? "View progress" : "Back to Tailor CV"}</Text>
              </Button>
            </>
          )}
        </View>
      </AppScreen>
    );

  const items: WizardItem[] = [];
  // Deduplicate display options only. Keep backend data and attestation rules intact.
  const seenKeywords = new Set<string>();
  function uniqueKeywords(keywords: string[]) {
    return keywords.filter((keyword) => {
      const key = keywordKey(keyword);
      if (seenKeywords.has(key)) return false;
      seenKeywords.add(key);
      return true;
    });
  }
  const options = {
    ...review.keyword_options,
    supported: uniqueKeywords(review.keyword_options.supported),
    needs_attestation: uniqueKeywords(review.keyword_options.needs_attestation),
  };
  const selected = new Set(run.selectedKeywords.map((item) => keywordKey(item.keyword)));
  if (run.step === 0) {
    if (options.supported.length) {
      items.push({
        id: "supported-heading",
        kind: "heading",
        title: "Already in your CV",
        body: "Skills from your original CV that can be highlighted for this job.",
      });
      options.supported.forEach((keyword, index) =>
        items.push({ id: `supported-${index}`, kind: "keyword", keyword, attestation: false }),
      );
    }
    if (options.needs_attestation.length) {
      items.push({
        id: "attestation-heading",
        kind: "heading",
        title: "Skills to confirm",
        body: "",
      });
      items.push({
        id: "attestation-safety",
        kind: "warning",
        message: "Only select skills you really have. You may be asked about them in interviews.",
      });
      options.needs_attestation.forEach((keyword, index) =>
        items.push({ id: `attestation-${index}`, kind: "keyword", keyword, attestation: true }),
      );
    }
    if (!options.supported.length && !options.needs_attestation.length)
      items.push({
        id: "no-keywords",
        kind: "heading",
        title: "Ready to review",
        body: "No keyword suggestions were returned for this draft. Continue to check the changes.",
      });
    if (options.remaining_slots === 0)
      items.push({
        id: "limit",
        kind: "warning",
        message: "No more skills can be added to this draft. Continue to Changes.",
      });
    if (review.keyword_placements.length) {
      items.push({
        id: "placements",
        kind: "section",
        title: "Keywords in this draft",
        subtitle: `${review.keyword_placements.length} keyword placements`,
        section: "placements",
      });
      if (expanded.has("placements"))
        review.keyword_placements.forEach((placement, index) =>
          items.push({ id: `placement-${index}`, kind: "placement", placement }),
        );
    }
  }
  const warningsByChange = new Map<ResumeChange, string[]>();
  reviewWarningsForStep(review.warnings, run.step).forEach((message, index) => {
    // Step 2 retains every warning. Attach exact backend paths to their
    // comparison; warnings without a matching comparison stay visible here.
    const rawWarning = review.warnings[index];
    const referencedPaths: string[] =
      rawWarning?.match(/[A-Za-z_]\w*(?:\[\d+\]|\.[A-Za-z_]\w*)+/g) ?? [];
    const relatedChange =
      run.step === 1
        ? review.change_sections
            .flatMap((section) => section.items)
            .find((change) => !!change.field_path && referencedPaths.includes(change.field_path))
        : undefined;
    if (relatedChange) {
      warningsByChange.set(relatedChange, [
        ...(warningsByChange.get(relatedChange) ?? []),
        message,
      ]);
    } else {
      items.push({ id: `warning-${index}`, kind: "warning", message });
    }
  });
  if (run.step === 1) {
    const detailedRiskCount = review.change_sections.reduce(
      (count, section) =>
        count + section.items.filter((change) => change.confidence === "high").length,
      0,
    );
    if ((review.change_summary.high_risk_changes ?? 0) > detailedRiskCount) {
      items.push({
        id: "verification-unavailable",
        kind: "warning",
        message:
          "Some verification details are unavailable. Reload the review and compare the current draft against your original CV before saving.",
      });
    }
  }
  if (run.step === 1) {
    review.change_sections.forEach((section, index) => {
      const highRisk = section.items.some((change) => change.confidence === "high");
      const connected = ["summary", "skill", "description"].includes(section.type)
        ? section.type
        : undefined;
      const hasAddedSkills =
        section.type === "skill" && section.items.some((change) => change.change_type === "added");
      items.push({
        id: `section-${index}`,
        kind: "section",
        title:
          (
            {
              summary: "Summary Changes",
              skill: "Skills Changes",
              description: "Description Changes",
            } as Record<string, string>
          )[section.type] ?? sectionTitle(section.type),
        subtitle: `${section.items.length} change${section.items.length === 1 ? "" : "s"}${hasAddedSkills ? " · Review skill accuracy in Save" : highRisk ? " · Contains high risk changes" : ""}`,
        section: section.type,
        highRisk: section.type === "skill" ? false : highRisk,
        connected,
      });
      if (expanded.has(section.type))
        section.items.forEach((change, changeIndex) => {
          const addedSkill = section.type === "skill" && change.change_type === "added";
          if (addedSkill) {
            items.push({
              id: `change-${index}-${changeIndex}`,
              kind: "skill-added",
              change,
              connected,
            });
          } else {
            items.push({
              id: `change-${index}-${changeIndex}`,
              kind: "change",
              change,
              summaryComparison: section.type === "summary",
              descriptionComparison: section.type === "description",
              connected,
            });
          }
          // Added-skill warnings are presented in Save with the full preview.
          if (!addedSkill)
            warningsByChange.get(change)?.forEach((message, warningIndex) =>
              items.push({
                id: `change-warning-${index}-${changeIndex}-${warningIndex}`,
                kind: "warning",
                message,
                connected,
              }),
            );
        });
    });
    if (!review.change_sections.length)
      items.push({
        id: "no-diff",
        kind: "warning",
        message:
          review.change_summary.total_changes === 0
            ? "The service reported no detailed changes. Check the current resume before saving."
            : "Detailed comparisons are unavailable. Reload the review, then check the full resume before saving.",
      });
  }
  if (run.step === 2) {
    const skillChecks = review.change_sections.flatMap((section) =>
      section.type === "skill"
        ? section.items.filter(
            (change) => change.change_type === "added" && change.confidence === "high",
          )
        : [],
    );
    if (skillChecks.length) {
      items.push({
        id: "skill-verification-heading",
        kind: "heading",
        title: "Skills to verify before saving",
        body: "These added skills still require verification. Confirm that each claim is accurate and supported by your experience.",
      });
      skillChecks.forEach((change, index) =>
        items.push({
          id: `skill-verification-${index}`,
          kind: "warning",
          message: change.new_value
            ? `Verify this added skill against your original CV and experience: ${change.new_value}`
            : "An added skill requires verification, but its details are unavailable. Reload the review before saving.",
        }),
      );
    }
    items.push({
      id: "resume-toggle",
      kind: "section",
      title: "Preview updated CV",
      subtitle: "Read the complete draft",
      section: "resume",
    });
    if (expanded.has("resume"))
      reviewItems(run.preview.preview, "resume").forEach((item) =>
        items.push({ id: "resume-" + item.id, kind: "resume", item }),
      );
  }

  function renderItem(item: WizardItem) {
    switch (item.kind) {
      case "heading":
        return (
          <View className="gap-1.5 pb-1 pt-3">
            <Text accessibilityRole="header" className="text-h5 text-foreground">
              {item.title}
            </Text>
            {item.body ? (
              <Text className="text-body leading-6 text-muted-foreground">{item.body}</Text>
            ) : null}
          </View>
        );
      case "keyword":
        return (
          <KeywordOption
            keyword={item.keyword}
            attestation={item.attestation}
            selected={selected.has(keywordKey(item.keyword))}
            disabled={
              blocked ||
              (!selected.has(keywordKey(item.keyword)) &&
                run.selectedKeywords.length >= options.remaining_slots)
            }
            onPress={() => run.toggleKeyword(item.keyword, item.attestation)}
          />
        );
      case "section":
        return (
          <SectionToggle
            title={item.title}
            subtitle={item.subtitle}
            open={expanded.has(item.section)}
            onPress={() => toggle(item.section)}
            highRisk={item.highRisk}
            embedded={!!item.connected}
            icon={
              item.section === "placements"
                ? "MapPin"
                : item.section === "resume"
                  ? "FileUser"
                  : "FileText"
            }
          />
        );
      case "change":
        return (
          <ChangeComparison
            change={item.change}
            summaryComparison={item.summaryComparison}
            descriptionComparison={item.descriptionComparison}
            embedded={!!item.connected}
          />
        );
      case "skill-added":
        return (
          <View className="px-4 py-2.5">
            {item.change.new_value ? (
              <Text selectable className="text-body leading-6 text-success">
                {item.change.new_value}
              </Text>
            ) : (
              <Text className="text-caption leading-5 text-muted-foreground">
                Added skill details are unavailable.
              </Text>
            )}
          </View>
        );
      case "resume":
        return <ReviewContent item={item.item} />;
      case "placement":
        return (
          <View className="gap-1.5 rounded-xl bg-secondary/50 p-4">
            <Text className="text-h6 text-foreground">{item.placement.keyword}</Text>
            <Text className="text-caption leading-5 text-muted-foreground">
              {item.placement.paths.length
                ? item.placement.paths.map(fieldLocation).join("\n")
                : "No placement details were returned."}
            </Text>
          </View>
        );
      case "warning":
        return <SafetyNote message={item.message} />;
    }
  }
  function renderRow(item: WizardItem, index = items.indexOf(item)) {
    if (!item.connected) return <View className="mb-3">{renderItem(item)}</View>;
    const header = item.kind === "section";
    const last = items[index + 1]?.connected !== item.connected;
    return (
      <View
        className={cn(
          "overflow-hidden border-x border-border bg-card",
          header ? "rounded-t-2xl border-t" : "border-t",
          last && "mb-3 rounded-b-2xl border-b",
        )}
      >
        {renderItem(item)}
      </View>
    );
  }
  const score = atsScore(review);
  const activityLabel =
    run.reviewActivity === "keywords"
      ? "Applying selected keywords…"
      : run.reviewActivity === "confirm"
        ? "Checking and saving your latest draft…"
        : "Refreshing your review…";
  return (
    <AppScreen>
      {routeOptions}
      <ScreenHeader
        title="Resume review"
        action={
          <View className="flex-row gap-1">
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              onPress={() => void reloadReview()}
              accessibilityLabel="Reload review"
              className="h-11 w-10 rounded-xl"
              hitSlop={2}
            >
              <LucideIcon name="RefreshCw" size={18} className="text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              onPress={close}
              accessibilityLabel="Close review"
              className="h-11 w-10 rounded-xl"
              hitSlop={2}
            >
              <LucideIcon name="X" size={20} className="text-foreground" />
            </Button>
          </View>
        }
      />
      <ReviewStepper step={run.step} />
      <FlatList
        ref={list}
        data={items}
        extraData={run.selectedKeywords}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => renderRow(item, index)}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-6 pb-5"
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          run.step === 0 && options.applied.length > 0 ? (
            <View className="flex-row items-start gap-2 px-1 pb-2 pt-1">
              <LucideIcon name="Info" size={15} className="mt-0.5 text-muted-foreground" />
              <View className="flex-1 gap-1">
                <Text className="text-h6 text-muted-foreground">
                  Want to improve your match further?
                </Text>
                <Text className="text-caption leading-5 text-muted-foreground">
                  You can add more skills, or tap Continue to Changes when you’re ready.
                </Text>
              </View>
            </View>
          ) : null
        }
        ListHeaderComponent={
          <View className="mb-5 gap-5">
            <View className="gap-2">
              <Text className="text-caption text-primary">Step {run.step + 1} of 3</Text>
              <Text accessibilityRole="header" className="text-h2 tracking-tight text-foreground">
                {stepCopy[run.step].title}
              </Text>
              <Text className="text-body leading-6 text-muted-foreground">
                {stepCopy[run.step].body}
              </Text>
            </View>
            {busy ? (
              <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2.5">
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text className="text-caption flex-1 leading-5 text-muted-foreground">
                  {activityLabel}
                </Text>
              </View>
            ) : null}
            {run.reviewProblem && !expired ? (
              <View className="gap-2">
                <Notice
                  tone={run.reviewProblem.kind === "conflict" ? "info" : "error"}
                  message={run.reviewProblem.message}
                />
                <Button
                  variant="outline"
                  onPress={() => void reloadReview()}
                  disabled={busy}
                  className="h-11 rounded-xl"
                >
                  <Text>Reload review</Text>
                </Button>
              </View>
            ) : null}
            {expired ? (
              <View className="gap-3">
                <SafetyNote message="This preview has expired. Your current draft and selections are preserved. Create a new preview to continue." />
                {run.input ? (
                  <Button
                    variant="outline"
                    onPress={regenerate}
                    disabled={busy}
                    className="h-12 rounded-xl"
                  >
                    <Text>Create new preview</Text>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onPress={close}
                    disabled={busy}
                    className="h-12 rounded-xl"
                  >
                    <Text>Back to Tailor CV</Text>
                  </Button>
                )}
              </View>
            ) : null}
            {run.step === 0 ? (
              <>
                <AtsScoreCard review={review} />
              </>
            ) : null}
            {run.step === 1 ? (
              <>
                <ChangeSummaryCards summary={review.change_summary} />
                <View className="flex-row flex-wrap gap-4">
                  <Text className="text-caption text-success">+ Added</Text>
                  <Text className="text-caption text-destructive">− Removed</Text>
                  <Text className="text-caption text-primary">Modified wording</Text>
                </View>
              </>
            ) : null}
            {run.step === 2 ? (
              <>
                <View className="gap-5 rounded-3xl border border-border bg-card p-5">
                  <View className="flex-row items-start gap-3">
                    <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                      <LucideIcon name="FileCheck" size={23} className="text-primary" />
                    </View>
                    <View className="flex-1 gap-1">
                      <Text className="text-h5 text-foreground">Your tailored CV</Text>
                      <Text className="text-caption leading-5 text-muted-foreground">
                        {run.input?.filename ?? "Based on your original CV"}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row justify-between gap-5 border-t border-border pt-4">
                    <View className="gap-1">
                      <Text className="text-caption text-muted-foreground">ATS match score</Text>
                      <Text className="text-h3 text-foreground">
                        {score === null ? "Unavailable" : `${formatScore(score)}/100`}
                      </Text>
                    </View>
                    <View className="gap-1">
                      <Text className="text-caption text-muted-foreground">Changes to review</Text>
                      <Text className="text-h3 text-foreground">
                        {review.change_summary.total_changes ?? "Unavailable"}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-caption leading-5 text-muted-foreground">
                    {options.applied.length} keywords applied to this draft.
                  </Text>
                </View>
                <View className="flex-row items-start gap-3 rounded-2xl bg-primary/5 p-4">
                  <LucideIcon name="ShieldCheck" size={20} className="text-primary" />
                  <View className="flex-1 gap-1">
                    <Text className="text-h6 text-foreground">
                      Your original CV stays unchanged
                    </Text>
                    <Text className="text-caption leading-5 text-muted-foreground">
                      We’ll save a separate tailored CV only when you tap Confirm & Save.
                    </Text>
                  </View>
                </View>
                <SafetyNote
                  highRisk={(review.change_summary.high_risk_changes ?? 0) > 0}
                  message={
                    (review.change_summary.high_risk_changes ?? 0) > 0
                      ? `${review.change_summary.high_risk_changes} high risk change${review.change_summary.high_risk_changes === 1 ? "" : "s"}. Confirm that every claim is accurate and that you can discuss it in an interview.`
                      : "Check that all skills, qualifications, and experience claims are accurate. AI can make mistakes."
                  }
                />
                {run.selectedKeywords.length ? (
                  <View className="gap-2">
                    <Text className="text-caption leading-5 text-muted-foreground">
                      {run.selectedKeywords.length} selected keyword
                      {run.selectedKeywords.length === 1 ? " hasn’t" : "s haven’t"} been applied.
                      Saving will keep the current draft.
                    </Text>
                    <Button
                      variant="outline"
                      onPress={() => setStep(0)}
                      disabled={busy}
                      className="h-11 rounded-xl"
                    >
                      <Text>Review selected keywords</Text>
                    </Button>
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
        }
      />
      <View
        className="gap-3 border-t border-border bg-background px-6 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        {run.step === 0 ? (
          <>
            <Button
              onPress={run.applyKeywords}
              disabled={blocked || !run.selectedKeywords.length}
              accessibilityLabel={`Apply Keywords (${run.selectedKeywords.length})`}
              className="h-12 gap-2 rounded-2xl"
            >
              {run.reviewActivity === "keywords" ? (
                <ActivityIndicator size="small" color={theme.colors.primaryForeground} />
              ) : (
                <LucideIcon name="Sparkles" size={17} className="text-primary-foreground" />
              )}
              <Text>
                {run.reviewActivity === "keywords"
                  ? "Applying Keywords…"
                  : `Apply Keywords (${run.selectedKeywords.length})`}
              </Text>
            </Button>
            <View className="flex-row gap-3">
              <Button
                variant="secondary"
                onPress={() => setStep(1)}
                disabled={busy}
                className="h-12 flex-1 rounded-xl"
              >
                <Text>Continue to Changes</Text>
              </Button>
            </View>
          </>
        ) : (
          <View className="flex-row gap-3">
            <Button
              variant="outline"
              onPress={() => setStep((run.step - 1) as ReviewStep)}
              disabled={busy}
              className="h-14 gap-1.5 rounded-2xl px-4"
            >
              <LucideIcon name="ChevronLeft" size={16} className="text-foreground" />
              <Text>Back</Text>
            </Button>
            <Button
              onPress={run.step === 1 ? () => setStep(2) : run.confirm}
              disabled={run.step === 1 ? busy : blocked}
              className="h-14 flex-1 gap-2 rounded-2xl"
            >
              {run.step === 2 ? (
                run.reviewActivity === "confirm" ? (
                  <ActivityIndicator size="small" color={theme.colors.primaryForeground} />
                ) : null
              ) : null}
              <Text>
                {run.step === 1
                  ? "Continue"
                  : run.reviewActivity === "confirm"
                    ? "Saving…"
                    : "Confirm & Save"}
              </Text>
            </Button>
          </View>
        )}
      </View>
    </AppScreen>
  );
}
