import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateWorkspace } from "@/lib/db/repositories/workspaces.repo";
import { useAuthContext } from "@/features/auth/hooks/auth-context";
import type { Workspace } from "@/types";

const workspaceSchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  currency: z.string().min(1),
  locale: z.string().min(1),
});

type WorkspaceFormValues = z.infer<typeof workspaceSchema>;

const CURRENCIES = [
  { code: "USD", label: "US Dollar (USD)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "GBP", label: "British Pound (GBP)" },
  { code: "INR", label: "Indian Rupee (INR)" },
  { code: "JPY", label: "Japanese Yen (JPY)" },
  { code: "CAD", label: "Canadian Dollar (CAD)" },
  { code: "AUD", label: "Australian Dollar (AUD)" },
  { code: "CHF", label: "Swiss Franc (CHF)" },
  { code: "CNY", label: "Chinese Yuan (CNY)" },
];

const LOCALES = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-IN", label: "English (India)" },
  { code: "de-DE", label: "German (Germany)" },
  { code: "fr-FR", label: "French (France)" },
  { code: "ja-JP", label: "Japanese (Japan)" },
  { code: "zh-CN", label: "Chinese (China)" },
];

export function WorkspaceForm() {
  const { workspace, setActiveWorkspace } = useAuthContext();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<WorkspaceFormValues>({
    resolver: zodResolver(workspaceSchema),
    defaultValues: {
      name: workspace?.name ?? "",
      currency: workspace?.currency ?? "USD",
      locale: workspace?.locale ?? "en-US",
    },
  });

  async function onSubmit(values: WorkspaceFormValues) {
    if (!workspace) return;
    try {
      const updated: Workspace = { ...workspace, ...values };
      await updateWorkspace(updated);
      setActiveWorkspace(updated);
      toast.success("Workspace settings saved");
    } catch {
      toast.error("Failed to save workspace settings");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="workspace-name">Workspace Name</Label>
        <Input id="workspace-name" aria-invalid={!!errors.name} {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="currency-setting">Currency</Label>
        <Select value={watch("currency")} onValueChange={(v) => setValue("currency", v, { shouldDirty: true })}>
          <SelectTrigger id="currency-setting">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="locale-setting">Number Format / Locale</Label>
        <Select value={watch("locale")} onValueChange={(v) => setValue("locale", v, { shouldDirty: true })}>
          <SelectTrigger id="locale-setting">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOCALES.map((l) => (
              <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" disabled={isSubmitting || !isDirty} className="self-start">
        {isSubmitting && <Loader2 data-icon="inline-start" className="animate-spin" />}
        Save changes
      </Button>
    </form>
  );
}
