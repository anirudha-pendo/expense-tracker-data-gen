import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Avatar from "boring-avatars";
import { updateUser } from "@/lib/db/repositories/users.repo";
import { useAuthContext } from "@/features/auth/hooks/auth-context";

const profileSchema = z.object({
  displayName: z.string().min(1, "Display name is required").max(50),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export function ProfileForm() {
  const { user, refreshUser } = useAuthContext();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: user?.displayName ?? "" },
  });

  async function onSubmit(values: ProfileFormValues) {
    if (!user) return;
    try {
      const initials = values.displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

      await updateUser({ ...user, displayName: values.displayName, avatarInitials: initials });
      await refreshUser();
      toast.success("Profile updated");
    } catch {
      toast.error("Failed to update profile");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 shrink-0 flex items-center justify-center rounded-none overflow-hidden grayscale">
          <Avatar
            size={56}
            name={user?.displayName || "User"}
            variant="beam"
            colors={["#000000", "#333333", "#666666", "#999999", "#CCCCCC"]}
            square
          />
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-widest uppercase text-foreground">{user?.displayName}</p>
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground">@{user?.username}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Display Name</Label>
        <Input
          id="displayName"
          aria-invalid={!!errors.displayName}
          {...register("displayName")}
        />
        {errors.displayName && <p className="text-sm text-destructive">{errors.displayName.message}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <Label>Username</Label>
        <Input value={user?.username ?? ""} disabled />
        <p className="text-xs text-muted-foreground">Username cannot be changed.</p>
      </div>

      <Button type="submit" disabled={isSubmitting || !isDirty} className="self-start">
        {isSubmitting && <Loader2 data-icon="inline-start" className="animate-spin" />}
        Save changes
      </Button>
    </form>
  );
}
