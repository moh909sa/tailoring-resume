import { ActivityIndicator } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import LucideIcon from "@/lib/icons/LucideIcon";
import { useTheme } from "@/theming/ThemeProvider";

export function CvActionsMenu({
  filename,
  disabled,
  deleting,
  onDelete,
}: {
  filename: string;
  disabled: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  const { theme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          accessibilityLabel={deleting ? "Deleting " + filename : "Options for " + filename}
          accessibilityState={{ disabled, busy: deleting }}
          className="h-11 w-11 rounded-xl"
        >
          {deleting ? (
            <ActivityIndicator size="small" color={theme.colors.mutedForeground} />
          ) : (
            <LucideIcon name="Ellipsis" size={21} className="text-muted-foreground" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="rounded-xl p-1.5">
        <DropdownMenuItem onPress={onDelete} className="min-h-11 rounded-lg px-3">
          <LucideIcon name="Trash2" size={17} className="text-destructive" />
          <Text className="text-body text-destructive">Delete CV</Text>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
