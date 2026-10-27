import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { isJsonObject, type JsonValue, type JsonObject } from "@/lib/tailoring/types";

const labels: Record<string, string> = {
  personalInfo: "Profile",
  workExperience: "Experience",
  personalProjects: "Projects",
  additional: "Skills & more",
  customSections: "Additional sections",
  technicalSkills: "Technical skills",
  certificationsTraining: "Certifications & training",
  ats_score: "ATS analysis",
  writing: "Writing feedback",
  keyword_placements: "Keywords included",
  forced_keywords: "Additional keywords",
  refinement_stats: "Keyword refinement",
  improvements: "Suggestions",
  detailed_changes: "Changes",
  overall_score: "ATS match score",
  sub_scores: "Score breakdown",
  before_score: "Original writing score",
  score: "Writing score",
  critic_notes: "Writing notes",
  findings: "Writing checks",
  missing_keywords: "Missing keywords",
  injectable_keywords: "Keywords supported by your original CV",
  recommendations: "Recommendations",
  original_value: "Before",
  new_value: "After",
  change_type: "Change",
  field_type: "Section",
  rejected_rewrites: "Rewrites held back",
  note: "Feedback",
  rule: "Writing check",
};
const hidden = new Set([
  "id",
  "sectionMeta",
  "descriptionStyles",
  "condensed",
  "path",
  "paths",
  "field_path",
  "rewritten_paths",
]);
export function readableLabel(key: string): string {
  if (labels[key]) return labels[key];
  const text = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
export function hasContent(value: JsonValue | undefined): value is Exclude<JsonValue, null> {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.some(hasContent);
  if (isJsonObject(value))
    return Object.entries(value).some(([key, item]) => !hidden.has(key) && hasContent(item));
  return true;
}
export type ReviewItem = { id: string; label: string; value: JsonValue };
function entries(key: string, value: JsonValue | undefined): ReviewItem[] {
  if (!hasContent(value)) return [];
  if (Array.isArray(value) && value.some(isJsonObject))
    return value
      .filter(hasContent)
      .map((item, index) => ({ id: key + index, label: readableLabel(key), value: item }));
  return [{ id: key, label: readableLabel(key), value }];
}
export function reviewItems(
  preview: JsonObject,
  tab: "resume" | "analysis" | "changes",
): ReviewItem[] {
  if (tab === "resume") {
    const resume = preview.resume_preview;
    return isJsonObject(resume)
      ? Object.entries(resume)
          .filter(([key]) => !hidden.has(key))
          .flatMap(([key, value]) => entries(key, value))
      : [];
  }
  const keys =
    tab === "analysis"
      ? ["ats_score", "keyword_placements", "forced_keywords", "writing", "refinement_stats"]
      : ["detailed_changes", "diff_summary", "improvements"];
  return keys.flatMap((key) => entries(key, preview[key]));
}

function ValueView({ value }: { value: JsonValue }) {
  if (!hasContent(value)) return null;
  if (Array.isArray(value))
    return (
      <View className="gap-3">
        {value.filter(hasContent).map((item, index) => (
          <View key={index} className={typeof item === "string" ? "flex-row gap-2" : "gap-2"}>
            {typeof item === "string" ? <Text className="text-body text-primary">•</Text> : null}
            <View className="flex-1">
              <ValueView value={item} />
            </View>
          </View>
        ))}
      </View>
    );
  if (isJsonObject(value))
    return (
      <View className="gap-4">
        {Object.entries(value)
          .filter(([key, item]) => !hidden.has(key) && hasContent(item))
          .map(([key, item]) => (
            <View key={key} className="gap-1.5">
              <Text className="text-caption text-muted-foreground">{readableLabel(key)}</Text>
              <ValueView value={item} />
            </View>
          ))}
      </View>
    );
  return (
    <Text selectable className="text-body leading-6 text-foreground">
      {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
    </Text>
  );
}

export function ReviewContent({ item }: { item: ReviewItem }) {
  const value = item.value;
  if (item.id === "personalInfo" && isJsonObject(value)) {
    const contact = [
      value.email,
      value.phone,
      value.location,
      value.website,
      value.linkedin,
      value.github,
    ].filter((v): v is string => typeof v === "string" && !!v);
    return (
      <View className="mb-6 gap-2 border-b border-border pb-6">
        {typeof value.name === "string" ? (
          <Text selectable className="text-h2 text-foreground">
            {value.name}
          </Text>
        ) : null}
        {typeof value.title === "string" && value.title ? (
          <Text className="text-body text-primary">{value.title}</Text>
        ) : null}
        {contact.length ? (
          <Text selectable className="text-caption leading-5 text-muted-foreground">
            {contact.join(" · ")}
          </Text>
        ) : null}
      </View>
    );
  }
  const isChange = item.id.startsWith("detailed_changes") && isJsonObject(value);
  return (
    <View className="mb-5 gap-4 rounded-2xl border border-border bg-card p-5">
      <Text accessibilityRole="header" className="text-h4 text-foreground">
        {isChange && typeof value.field_type === "string"
          ? readableLabel(value.field_type)
          : item.label}
      </Text>
      {isChange ? (
        <View className="gap-4">
          {hasContent(value.original_value) ? (
            <View className="gap-1.5 border-l-2 border-border pl-3">
              <Text className="text-caption text-muted-foreground">Before</Text>
              <ValueView value={value.original_value} />
            </View>
          ) : null}
          {hasContent(value.new_value) ? (
            <View className="gap-1.5 border-l-2 border-primary pl-3">
              <Text className="text-caption text-primary">After</Text>
              <ValueView value={value.new_value} />
            </View>
          ) : null}
          {typeof value.change_type === "string" ? (
            <Text className="text-caption text-muted-foreground">
              {readableLabel(value.change_type)}
            </Text>
          ) : null}
        </View>
      ) : (
        <ValueView value={value} />
      )}
    </View>
  );
}
