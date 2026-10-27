// Isolated test responses shaped like the deployed mobile contract. Never app data.
const tailoringId = "33333333-3333-4333-8333-333333333333";
function makeReview(previewId = "preview-1", score = 76, applied = [], history = [76]) {
  const changes = [
    {
      field_path: "summary",
      field_type: "summary",
      change_type: "modified",
      original_value: "Built industrial systems.",
      new_value: "Built reliable industrial systems.",
      confidence: "medium",
    },
    {
      field_path: "additional.technicalSkills",
      field_type: "skill",
      change_type: "added",
      original_value: null,
      new_value: "OPC-UA",
      confidence: "high",
    },
    {
      field_path: "additional.technicalSkills",
      field_type: "skill",
      change_type: "removed",
      original_value: "Legacy tools",
      new_value: null,
      confidence: "medium",
    },
    {
      field_path: "workExperience[0]",
      field_type: "experience",
      change_type: "modified",
      original_value: "Engineer",
      new_value: "Systems Engineer",
      confidence: "medium",
    },
    {
      field_path: "workExperience[0].description[0]",
      field_type: "description",
      change_type: "modified",
      original_value: "Built systems.",
      new_value: "Built reliable systems.",
      confidence: "medium",
    },
    {
      field_path: "additional.certificationsTraining",
      field_type: "certification",
      change_type: "added",
      original_value: null,
      new_value: "Automation certification",
      confidence: "high",
    },
  ];
  const ats = {
    overall_score: score,
    missing_keywords: ["OPC-UA", "PLC", "Python"],
    injectable_keywords: ["PLC", "Python"],
    recommendations: ["Review the job keywords."],
  };
  const placements = applied.map((keyword) => ({
    keyword,
    paths: ["summary", "additional.technicalSkills"],
  }));
  const warnings = ["Verify the added certification before saving."];
  return {
    tailoring_id: tailoringId,
    status: "draft",
    preview: {
      preview_id: previewId,
      preview_expires_at: "2099-12-31T23:59:59Z",
      resume_preview: {
        personalInfo: { name: "Review test", title: "Systems Engineer" },
        summary: `Built reliable industrial systems.${applied.length ? " " + applied.join(", ") + "." : ""}`,
        workExperience: [
          {
            title: "Systems Engineer",
            company: "Test company",
            description: ["Built reliable systems."],
          },
        ],
        additional: { technicalSkills: ["PLC", ...applied] },
      },
      ats_score: ats,
      keyword_placements: placements,
      warnings,
      writing: { score: 70 },
      detailed_changes: changes,
    },
    review: {
      step_order: ["keywords", "changes", "confirm"],
      preview_id: previewId,
      preview_expires_at: "2099-12-31T23:59:59Z",
      keyword_options: {
        supported: ["PLC", "Python"].filter((keyword) => !applied.includes(keyword)),
        needs_attestation: ["OPC-UA"].filter((keyword) => !applied.includes(keyword)),
        applied,
        remaining_slots: 30 - applied.length,
      },
      ats_score: ats,
      score_history: history,
      keyword_placements: placements,
      change_summary: {
        skills_added: 1,
        skills_removed: 1,
        certifications_added: 1,
        descriptions_modified: 1,
        high_risk_changes: 2,
        total_changes: 6,
      },
      change_sections: ["summary", "skill", "experience", "description", "certification"].map(
        (type) => ({ type, items: changes.filter((change) => change.field_type === type) }),
      ),
      warnings,
    },
  };
}
module.exports = { makeReview, tailoringId };
