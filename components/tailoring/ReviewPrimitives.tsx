import { Fragment, useMemo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import LucideIcon, { type IconName } from "@/lib/icons/LucideIcon";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theming/ThemeProvider";
import {
  atsScore,
  type ChangeSummary,
  type ResumeChange,
  type ReviewStep,
  type TailoringReview,
} from "@/lib/tailoring/types";
import { compareWords } from "@/lib/tailoring/diff";
import { readableLabel } from "@/components/tailoring/ReviewContent";

const steps = ["Keywords", "Changes", "Save"];
export function ReviewStepper({ step }: { step: ReviewStep }) {
  return (
    <View
      accessibilityLabel={`Step ${step + 1} of 3: ${steps[step]}`}
      className="flex-row items-center px-6 pb-5 pt-1"
    >
      {steps.map((label, index) => (
        <Fragment key={label}>
          {index > 0 ? (
            <View className={cn("mx-2 h-px flex-1", index <= step ? "bg-primary" : "bg-border")} />
          ) : null}
          <View className="flex-row items-center gap-2">
            <View
              className={cn(
                "h-7 w-7 items-center justify-center rounded-full",
                index <= step ? "bg-primary" : "bg-secondary",
              )}
            >
              {index < step ? (
                <LucideIcon name="Check" size={14} className="text-primary-foreground" />
              ) : (
                <Text
                  className={cn(
                    "text-caption",
                    index === step ? "text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {index + 1}
                </Text>
              )}
            </View>
            <Text
              className={cn(
                "text-caption",
                index === step ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </Text>
          </View>
        </Fragment>
      ))}
    </View>
  );
}
export const formatScore = (score: number) => String(Number(score.toFixed(1)));
export function AtsScoreCard({ review }: { review: TailoringReview }) {
  const score = atsScore(review);
  const history = review.score_history;
  const delta =
    history.length > 1 ? history[history.length - 1] - history[history.length - 2] : null;
  return (
    <View
      accessibilityLiveRegion="polite"
      className="gap-4 rounded-3xl border border-primary/30 bg-primary/5 p-5"
    >
      <View className="flex-row items-center justify-between gap-4">
        <View className="flex-1 gap-1.5">
          <View className="flex-row items-center gap-2">
            <LucideIcon name="ChartNoAxesCombined" size={16} className="text-primary" />
            <Text className="text-h6 text-foreground">ATS match score</Text>
          </View>
          <Text className="text-caption leading-5 text-muted-foreground">
            Estimated for this job description.
          </Text>
        </View>
        <View className="flex-row items-baseline gap-1">
          <Text className="text-h1 tabular-nums tracking-tight text-foreground">
            {score === null ? "—" : formatScore(score)}
          </Text>
          {score !== null ? <Text className="text-caption text-muted-foreground">/100</Text> : null}
        </View>
      </View>
      {score !== null ? (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: score }}
          className="h-1.5 overflow-hidden rounded-full bg-secondary"
        >
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
          />
        </View>
      ) : (
        <Text className="text-caption text-muted-foreground">
          The service did not return a score for this draft.
        </Text>
      )}
      {delta !== null ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <View
            className={cn(
              "flex-row items-center gap-1 rounded-full px-2.5 py-1",
              delta > 0 ? "bg-success/10" : delta < 0 ? "bg-destructive/10" : "bg-secondary",
            )}
          >
            <LucideIcon
              name={delta > 0 ? "ArrowUpRight" : delta < 0 ? "ArrowDownRight" : "Minus"}
              size={13}
              className={
                delta > 0
                  ? "text-success"
                  : delta < 0
                    ? "text-destructive"
                    : "text-muted-foreground"
              }
            />
            <Text
              className={cn(
                "text-caption",
                delta > 0
                  ? "text-success"
                  : delta < 0
                    ? "text-destructive"
                    : "text-muted-foreground",
              )}
            >
              {delta > 0 ? "+" : ""}
              {formatScore(delta)} points
            </Text>
          </View>
          <Text className="text-caption text-muted-foreground">since the last application</Text>
        </View>
      ) : null}
      {history.length > 1 ? (
        <Text selectable className="text-caption leading-5 text-muted-foreground">
          Score history: {history.map(formatScore).join(" → ")}
        </Text>
      ) : null}
    </View>
  );
}
export function SafetyNote({ message, highRisk = false }: { message: string; highRisk?: boolean }) {
  return (
    <View
      className={cn(
        "flex-row items-start gap-2.5 rounded-2xl border px-4 py-3.5",
        highRisk ? "border-destructive/25 bg-destructive/5" : "border-warning/25 bg-warning/5",
      )}
    >
      <LucideIcon
        name={highRisk ? "ShieldAlert" : "TriangleAlert"}
        size={17}
        className={highRisk ? "text-destructive" : "text-foreground"}
      />
      <Text className="text-caption flex-1 leading-5 text-foreground">{message}</Text>
    </View>
  );
}
const metrics: {
  key: keyof ChangeSummary;
  label: string;
  icon: IconName;
  color: string;
  tint: string;
}[] = [
  {
    key: "skills_added",
    label: "Skills Added",
    icon: "ListPlus",
    color: "text-success",
    tint: "bg-success/10",
  },
  {
    key: "skills_removed",
    label: "Skills Removed",
    icon: "ListMinus",
    color: "text-destructive",
    tint: "bg-destructive/10",
  },
  {
    key: "certifications_added",
    label: "Certifications Added",
    icon: "BadgeCheck",
    color: "text-tertiary",
    tint: "bg-tertiary/10",
  },
  {
    key: "descriptions_modified",
    label: "Descriptions Modified",
    icon: "TextCursorInput",
    color: "text-primary",
    tint: "bg-primary/10",
  },
  {
    key: "high_risk_changes",
    label: "High Risk Changes",
    icon: "ShieldAlert",
    color: "text-destructive",
    tint: "bg-destructive/10",
  },
];
export function ChangeSummaryCards({ summary }: { summary: ChangeSummary }) {
  return (
    <View className="flex-row flex-wrap gap-2.5">
      {metrics.map(({ key, label, icon, color, tint }, index) => (
        <View
          key={key}
          className={cn(
            "gap-3 rounded-2xl border border-border bg-card p-4",
            index === 4 ? "w-full flex-row items-center" : "w-[47%] grow",
            index === 4 &&
              (summary.high_risk_changes ?? 0) > 0 &&
              "border-destructive/30 bg-destructive/5",
          )}
        >
          {index === 4 ? (
            <>
              <View className={cn("h-8 w-8 items-center justify-center rounded-xl", tint)}>
                <LucideIcon name={icon} size={17} className={color} />
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-h6 text-foreground">{label}</Text>
                <Text className="text-caption leading-4 text-muted-foreground">
                  Check these claims carefully
                </Text>
              </View>
              <Text
                className={cn(
                  "text-h2 tabular-nums text-foreground",
                  (summary.high_risk_changes ?? 0) > 0 && "text-destructive",
                )}
              >
                {summary[key] ?? "—"}
              </Text>
            </>
          ) : (
            <>
              <View className="flex-row items-center justify-between gap-3">
                <View className={cn("h-8 w-8 items-center justify-center rounded-xl", tint)}>
                  <LucideIcon name={icon} size={17} className={color} />
                </View>
                <Text className="text-h2 tabular-nums text-foreground">{summary[key] ?? "—"}</Text>
              </View>
              <Text className="text-caption leading-4 text-muted-foreground">{label}</Text>
            </>
          )}
        </View>
      ))}
    </View>
  );
}
export const sectionLabels: Record<string, string> = {
  summary: "Summary",
  skill: "Skills",
  experience: "Experience",
  description: "Descriptions",
  education: "Education",
  project: "Projects",
  certification: "Certifications",
  language: "Languages",
  award: "Awards",
};
export function sectionTitle(type: string): string {
  return sectionLabels[type] ?? readableLabel(type);
}
export function fieldLocation(path: string): string {
  return path
    .replace(/\[(\d+)\]/g, (_, index: string) => ` ${Number(index) + 1}`)
    .split(".")
    .map((part) => readableLabel(part))
    .join(" · ");
}
export function SectionToggle({
  title,
  subtitle,
  open,
  onPress,
  icon = "FileText",
  highRisk = false,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onPress: () => void;
  icon?: IconName;
  highRisk?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ expanded: open }}
      aria-expanded={open}
      className={cn(
        "min-h-16 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 active:bg-secondary",
        highRisk && "border-destructive/25",
      )}
    >
      <LucideIcon
        name={icon}
        size={19}
        className={highRisk ? "text-destructive" : "text-primary"}
      />
      <View className="flex-1 gap-1">
        <Text className="text-h6 text-foreground">{title}</Text>
        {subtitle ? <Text className="text-caption text-muted-foreground">{subtitle}</Text> : null}
      </View>
      <LucideIcon
        name={open ? "ChevronUp" : "ChevronDown"}
        size={18}
        className="text-muted-foreground"
      />
    </Pressable>
  );
}
export function KeywordOption({
  keyword,
  attestation,
  selected,
  disabled,
  onPress,
}: {
  keyword: string;
  attestation: boolean;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const rowStyle = {
    borderColor: selected ? theme.colors.primary : theme.colors.border,
    opacity: disabled ? 0.6 : 1,
  };
  const checkboxStyle = {
    borderColor: selected ? theme.colors.primary : theme.colors.mutedForeground,
    backgroundColor: selected ? theme.colors.primary : "transparent",
  };
  const checkStyle = { opacity: selected ? 1 : 0 };
  // Keep NativeWind classes stable when toggling; selection only changes RN styles.
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={attestation ? `I have this skill: ${keyword}` : keyword}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-16 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5"
      style={rowStyle}
    >
      <Text className="text-h6 flex-1 leading-5 text-foreground">{keyword}</Text>
      {attestation ? (
        <Text
          className="text-caption text-muted-foreground"
          style={{ color: selected ? theme.colors.primary : theme.colors.mutedForeground }}
        >
          I have this
        </Text>
      ) : null}
      <View
        className="h-6 w-6 items-center justify-center rounded-lg border border-muted-foreground/50"
        style={checkboxStyle}
      >
        <LucideIcon name="Check" size={15} className="text-primary-foreground" style={checkStyle} />
      </View>
    </Pressable>
  );
}
export function ChangeComparison({ change }: { change: ResumeChange }) {
  const diff = useMemo(
    () => compareWords(change.original_value ?? "", change.new_value ?? ""),
    [change.original_value, change.new_value],
  );
  const highRisk = change.confidence === "high";
  return (
    <View
      className={cn(
        "gap-4 rounded-2xl border border-border bg-card p-4",
        highRisk && "border-destructive/30",
      )}
    >
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="text-h6 text-foreground">
          {change.change_type === "added"
            ? "Added"
            : change.change_type === "removed"
              ? "Removed"
              : "Modified wording"}
        </Text>
        {highRisk ? (
          <View className="flex-row items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1">
            <LucideIcon name="ShieldAlert" size={12} className="text-destructive" />
            <Text className="text-caption text-destructive">High risk</Text>
          </View>
        ) : null}
      </View>
      {change.field_path ? (
        <Text className="text-caption leading-5 text-muted-foreground">
          {fieldLocation(change.field_path)}
        </Text>
      ) : null}
      <View className="gap-2 border-l-2 border-destructive/40 pl-3">
        <Text className="text-caption text-muted-foreground">Before</Text>
        <Text selectable className="text-body leading-6 text-foreground">
          {diff.before.length ? (
            diff.before.map((part, i) => (
              <Text
                key={i}
                className={part.changed ? "bg-destructive/10 text-destructive line-through" : ""}
              >
                {part.text}
              </Text>
            ))
          ) : (
            <Text className="text-muted-foreground">Not included</Text>
          )}
        </Text>
      </View>
      <View className="gap-2 border-l-2 border-primary pl-3">
        <Text className="text-caption text-primary">After</Text>
        <Text selectable className="text-body leading-6 text-foreground">
          {diff.after.length ? (
            diff.after.map((part, i) => (
              <Text
                key={i}
                className={
                  part.changed
                    ? change.change_type === "added"
                      ? "bg-success/10 text-success"
                      : "bg-primary/10 text-primary"
                    : ""
                }
              >
                {part.text}
              </Text>
            ))
          ) : (
            <Text className="text-muted-foreground">Not included</Text>
          )}
        </Text>
      </View>
      {highRisk ? (
        <Text className="text-caption leading-5 text-destructive">
          Verify this claim is accurate and supported by your experience before saving.
        </Text>
      ) : null}
    </View>
  );
}
