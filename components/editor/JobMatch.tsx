import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import Icon from "@/lib/icons/LucideIcon";
import type { EditorAnalysis } from "@/lib/editor/types";

export type JobMatchProps = {
  analysis: EditorAnalysis | null;
  revision: number;
  dirty: boolean;
  loading: boolean;
  error?: string | null;
  jobDescription: string;
  confirmedSkills: string[];
  onRefresh: () => void;
  onAddSkill: (skill: string) => void;
  onEdit: (section: string) => void;
};

const metricNames: Record<string, string> = {
  keyword_match: "Job keywords", keyword_coverage: "Job keywords", keywords: "Job keywords",
  skills: "Skills alignment", skills_match: "Skills alignment", skill_match: "Skills alignment", skill_coverage: "Skills alignment",
  title_alignment: "Role alignment", title_match: "Role alignment", title: "Role alignment",
  section_completeness: "Section completeness", sections: "Section completeness",
  date_consistency: "Date consistency", dates: "Date consistency",
};

export function JobMatch({ analysis, revision, dirty, loading, error, jobDescription, confirmedSkills, onRefresh, onAddSkill, onEdit }: JobMatchProps) {
  const [showJob, setShowJob] = useState(false);
  const [showMatched, setShowMatched] = useState(false);
  const current = !dirty && analysis?.status === "current" && analysis.revision === revision;
  const score = analysis?.score;
  const confirmed = new Set(confirmedSkills.map(skill => skill.toLocaleLowerCase()));
  const required = new Set(analysis?.required_skills.map(skill => skill.toLocaleLowerCase()));
  const missing = [...new Set(analysis?.missing_keywords ?? [])];
  return (
    <View className="gap-5">
      <View className="gap-4 rounded-2xl border border-border bg-card p-5">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-h4 text-foreground">Job match estimate</Text>
          <Text className={current ? "text-caption text-success" : "text-caption text-muted-foreground"}>{current ? "Up to date" : score ? "Needs updating" : "Not calculated"}</Text>
        </View>
        <View className="flex-row items-end gap-2">
          <Text className="text-h1 text-foreground">{score ? Math.round(score.overall_score) : "—"}</Text>
          {score ? <Text className="pb-1 text-body text-muted-foreground">/ 100{current ? "" : " · previous result"}</Text> : null}
        </View>
        <Text className="text-body text-muted-foreground">{current ? "An estimate of how clearly this CV reflects the job description. It does not predict an employer’s decision." : analysis?.status === "unavailable" ? analysis.reason || "Job-match analysis is unavailable for this document." : "Update the match after editing to check your latest saved CV against this job."}</Text>
        {current && analysis ? <Text className="text-caption text-muted-foreground">{analysis.matched_count} of {analysis.total_keywords} job keywords found · saved version {analysis.revision}</Text> : null}
        <Button disabled={loading} onPress={onRefresh} className="rounded-xl">
          {loading ? <ActivityIndicator accessibilityLabel="Updating job match" /> : <Text>{dirty ? "Save & update match" : "Update match"}</Text>}
        </Button>
        {error ? <Text accessibilityRole="alert" className="text-body text-destructive">{error}</Text> : null}
      </View>

      {score ? <View className="gap-3 rounded-2xl border border-border bg-card p-5">
        <Text className="text-h4 text-foreground">Match breakdown</Text>
        {!current ? <Text className="text-caption text-muted-foreground">Based on the previous analysis. Update to include your edits.</Text> : null}
        {Object.entries(score.sub_scores).map(([key, value]) => <View key={key} className="flex-row items-center justify-between gap-4 py-1">
          <Text className="flex-1 text-body text-muted-foreground">{metricNames[key] ?? key.replace(/_/g, " ").replace(/^./, c => c.toUpperCase())}</Text>
          <Text className="text-body text-foreground">{value === null ? "Not available" : `${Math.round(value)} / 100`}</Text>
        </View>)}
      </View> : null}

      {missing.length ? <View className="gap-3">
        <Text className="text-h4 text-foreground">Skills & keywords to consider</Text>
        <Text className="text-body text-muted-foreground">Add skills you personally have, even if they weren’t in your original CV. Only include experience and qualifications that are yours.</Text>
        {!current ? <Text className="text-caption text-muted-foreground">These suggestions are from the previous analysis.</Text> : null}
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          {missing.map((skill, index) => {
            const added = confirmed.has(skill.toLocaleLowerCase());
            return <View key={skill} className={`gap-2 p-4 ${index ? "border-t border-border" : ""}`}>
              <View className="flex-row items-center justify-between gap-3">
                <Text className="flex-1 text-body text-foreground">{skill}</Text>
                {required.has(skill.toLocaleLowerCase()) ? <Text className="text-caption text-muted-foreground">Required in job</Text> : null}
              </View>
              {added ? <View className="flex-row items-center gap-2"><Icon name="Check" className="h-4 w-4 text-success" /><Text className="text-caption text-success">You confirmed this skill</Text></View> : <Button variant="secondary" size="sm" className="self-start rounded-lg" onPress={() => onAddSkill(skill)} accessibilityLabel={`I have ${skill}, add to Skills`}><Text>I have this · Add to Skills</Text></Button>}
            </View>;
          })}
        </View>
      </View> : current && score ? <View className="gap-2 rounded-2xl border border-border bg-card p-5"><Text className="text-h4 text-foreground">No missing keywords found</Text><Text className="text-body text-muted-foreground">Focus on clear examples and accurate achievements in your experience.</Text></View> : null}

      {score?.recommendations.length ? <View className="gap-3 rounded-2xl border border-border bg-card p-5">
        <Text className="text-h4 text-foreground">Where to focus</Text>
        {score.recommendations.map((recommendation, index) => <View key={`${index}-${recommendation}`} className="flex-row gap-3"><Icon name="ArrowUpRight" className="mt-1 h-4 w-4 text-primary" /><Text className="flex-1 text-body text-muted-foreground">{recommendation}</Text></View>)}
        <View className="flex-row flex-wrap gap-2"><Button variant="outline" size="sm" onPress={() => onEdit("workExperience")}><Text>Edit experience</Text></Button><Button variant="outline" size="sm" onPress={() => onEdit("skills")}><Text>Edit skills</Text></Button></View>
      </View> : null}

      {analysis?.matched_keywords.length ? <View className="gap-3 rounded-2xl border border-border bg-card p-5">
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showMatched }} onPress={() => setShowMatched(!showMatched)} className="min-h-11 flex-row items-center justify-between"><Text className="text-h5 text-foreground">Keywords already included</Text><Icon name={showMatched ? "ChevronUp" : "ChevronDown"} className="h-5 w-5 text-muted-foreground" /></Pressable>
        {showMatched ? <Text className="text-body leading-6 text-muted-foreground">{analysis.matched_keywords.join(" · ")}</Text> : null}
      </View> : null}
      <View className="gap-3 rounded-2xl border border-border bg-card p-5">
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showJob }} onPress={() => setShowJob(!showJob)} className="min-h-11 flex-row items-center justify-between"><Text className="text-h5 text-foreground">View job description</Text><Icon name={showJob ? "ChevronUp" : "ChevronDown"} className="h-5 w-5 text-muted-foreground" /></Pressable>
        {showJob ? <Text selectable className="text-body leading-6 text-muted-foreground">{jobDescription || "The job description is unavailable for this CV."}</Text> : null}
      </View>
    </View>
  );
}
