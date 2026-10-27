import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import LucideIcon from "@/lib/icons/LucideIcon";
import { cn } from "@/lib/utils";
import type { Resume } from "@/lib/cv/types";

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? (bytes / (1024 * 1024)).toFixed(1) + " MB"
    : Math.max(1, Math.round(bytes / 1024)) + " KB";
}

export function CvRow({
  resume,
  selected = false,
  actions,
}: {
  resume: Resume;
  selected?: boolean;
  actions?: ReactNode;
}) {
  const failed = resume.processing_status === "failed" || resume.recovery_required;
  const ready = resume.processing_status === "ready" && !failed;
  const status = failed
    ? "Processing failed"
    : ready
      ? "Ready"
      : resume.processing_status === "pending"
        ? "Queued"
        : "Processing";
  const date = new Date(resume.created_at);
  return (
    <View
      className={cn(
        "mb-3 flex-row items-center gap-3 rounded-2xl border bg-card p-4",
        selected ? "border-primary" : "border-border",
      )}
    >
      <View className="h-11 w-11 items-center justify-center rounded-xl bg-primary/5">
        <LucideIcon name="FileText" size={23} strokeWidth={1.6} className="text-primary" />
      </View>
      <View className="flex-1 gap-1.5">
        <Text className="text-h5 text-foreground" numberOfLines={2}>
          {resume.original_filename}
        </Text>
        <Text className="text-caption text-muted-foreground">
          {fileSize(resume.file_size_bytes)}
          {Number.isNaN(date.getTime())
            ? ""
            : " · " + date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <LucideIcon
            name={failed ? "CircleAlert" : ready ? "CircleCheck" : "Clock3"}
            size={12}
            className={failed ? "text-destructive" : ready ? "text-success" : "text-primary"}
          />
          <Text
            className={cn(
              "text-caption",
              failed ? "text-destructive" : ready ? "text-success" : "text-primary",
            )}
          >
            {status}
          </Text>
        </View>
        {failed ? (
          <Text className="text-caption text-muted-foreground">Your original CV is saved.</Text>
        ) : null}
      </View>
      {selected ? <LucideIcon name="CircleCheck" size={21} className="text-primary" /> : null}
      {actions}
    </View>
  );
}
