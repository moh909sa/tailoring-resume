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
  "sectionType",
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
export type ReviewItem = {
  id: string;
  label: string;
  value: JsonValue;
  continuation?: boolean;
  profile?: boolean;
  custom?: boolean;
};
function entries(key: string, value: JsonValue | undefined): ReviewItem[] {
  if (!hasContent(value)) return [];
  if (Array.isArray(value) && value.some(isJsonObject))
    return value
      .filter(hasContent)
      .map((item, index) => ({ id: key + index, label: readableLabel(key), value: item }));
  return [{ id: key, label: readableLabel(key), value }];
}
// Presentation-only mapping: values are references to the original structured
// draft. Metadata controls ordering without rewriting or mutating the resume.
export function orderedResumeItems(resume: JsonObject): ReviewItem[] {
  const ranks: Record<string, number> = {
    personalInfo: 0,
    personalInformation: 0,
    summary: 1,
    professionalSummary: 1,
    workExperience: 2,
    experience: 2,
    education: 3,
    technicalSkills: 4,
    professionalSkills: 4,
    skills: 4,
    certificationsTraining: 5,
    certifications: 5,
    training: 5,
    personalProjects: 6,
    projects: 6,
    languages: 7,
  };
  const titles: Record<string, string> = {
    personalInfo: "Personal information",
    personalInformation: "Personal information",
    summary: "Professional Summary",
    professionalSummary: "Professional Summary",
    workExperience: "Work Experience",
    experience: "Work Experience",
    education: "Education",
    technicalSkills: "Technical Skills",
    professionalSkills: "Professional Skills",
    skills: "Skills",
    certificationsTraining: "Certifications and Training",
    certifications: "Certifications",
    training: "Training",
    personalProjects: "Projects",
    projects: "Projects",
    languages: "Languages",
  };
  const metadata = Array.isArray(resume.sectionMeta) ? resume.sectionMeta.filter(isJsonObject) : [];
  const sections: { key: string; field: string; value: JsonValue; custom: boolean }[] = [];
  for (const [key, value] of Object.entries(resume)) {
    if (hidden.has(key)) continue;
    if ((key === "additional" || key === "customSections") && isJsonObject(value)) {
      for (const [field, content] of Object.entries(value)) {
        if (!hidden.has(field))
          sections.push({
            key: key + "." + field,
            field,
            value: content,
            custom: key === "customSections",
          });
      }
    } else sections.push({ key, field: key, value, custom: false });
  }
  const positioned = sections
    .filter((section) => hasContent(section.value))
    .map((section, index) => {
      const exact = metadata.find((meta) => meta.key === section.key || meta.key === section.field);
      const meta = exact ?? metadata.find((meta) => meta.key === section.key.split(".")[0]);
      const order =
        typeof meta?.order === "number" && Number.isFinite(meta.order) ? meta.order : null;
      const rank = section.custom ? 8 : (ranks[section.field] ?? 9);
      const customId = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(section.field);
      const label =
        typeof exact?.displayName === "string" && exact.displayName.trim()
          ? exact.displayName
          : (titles[section.field] ??
            (customId ? "Additional section" : readableLabel(section.field)));
      return { ...section, label, order, rank, index };
    });
  positioned.sort((a, b) => {
    // Identity and contacts always introduce the CV. Honor explicit original
    // sectionMeta order for the remaining sections; use standard order otherwise.
    if (a.rank === 0 || b.rank === 0)
      return a.rank === b.rank ? a.index - b.index : a.rank === 0 ? -1 : 1;
    if (a.order !== null || b.order !== null) {
      const difference = (a.order ?? Infinity) - (b.order ?? Infinity);
      if (difference) return difference;
    }
    return a.rank - b.rank || a.index - b.index;
  });
  return positioned.flatMap((section) =>
    entries(section.key, section.value).map((item, index) => ({
      ...item,
      label: section.label,
      continuation: index > 0,
      profile: section.rank === 0,
      custom: section.custom,
    })),
  );
}

export function reviewItems(
  preview: JsonObject,
  tab: "resume" | "analysis" | "changes",
): ReviewItem[] {
  if (tab === "resume") {
    const resume = preview.resume_preview;
    return isJsonObject(resume) ? orderedResumeItems(resume) : [];
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
  if ((item.profile || item.id === "personalInfo") && isJsonObject(value)) {
    const nameKey = ["name", "fullName", "full_name"].find(
      (key) => typeof value[key] === "string" && hasContent(value[key]),
    );
    const titleKey = ["title", "professionalTitle", "professional_title"].find(
      (key) => typeof value[key] === "string" && hasContent(value[key]),
    );
    const contactKeys = ["email", "phone", "location", "website", "linkedin", "github"];
    const contact = contactKeys.filter(
      (key) => typeof value[key] === "string" && hasContent(value[key]),
    );
    const used = new Set([nameKey, titleKey, ...contact]);
    const remaining = Object.fromEntries(Object.entries(value).filter(([key]) => !used.has(key)));
    return (
      <View className="mb-6 gap-3 border-b border-border pb-6">
        {nameKey ? (
          <Text selectable className="text-h2 text-foreground">
            {String(value[nameKey])}
          </Text>
        ) : null}
        {titleKey ? (
          <Text selectable className="text-body text-primary">
            {String(value[titleKey])}
          </Text>
        ) : null}
        {contact.length ? (
          <Text selectable className="text-caption leading-5 text-muted-foreground">
            {contact.map((key) => String(value[key])).join(" · ")}
          </Text>
        ) : null}
        {hasContent(remaining) ? <ValueView value={remaining} /> : null}
      </View>
    );
  }
  const isChange = item.id.startsWith("detailed_changes") && isJsonObject(value);
  return (
    <View className="mb-5 gap-4 rounded-2xl border border-border bg-card p-5">
      {!item.continuation ? (
        <Text accessibilityRole="header" className="text-h4 text-foreground">
          {isChange && typeof value.field_type === "string"
            ? readableLabel(value.field_type)
            : item.label}
        </Text>
      ) : null}
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
      ) : item.custom && isJsonObject(value) ? (
        <View className="gap-4">
          {["text", "strings", "items"]
            .filter((key) => hasContent(value[key]))
            .map((key) => (
              <ValueView key={key} value={value[key]} />
            ))}
          <ValueView
            value={Object.fromEntries(
              Object.entries(value).filter(([key]) => !["text", "strings", "items"].includes(key)),
            )}
          />
        </View>
      ) : (
        <ValueView value={value} />
      )}
    </View>
  );
}
