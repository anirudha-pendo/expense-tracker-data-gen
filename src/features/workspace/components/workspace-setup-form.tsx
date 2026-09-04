import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const workspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required").max(50, "Name must be at most 50 characters"),
  currency: z.string().min(1, "Currency is required"),
  locale: z.string().min(1, "Locale is required"),
});

export type WorkspaceFormValues = z.infer<typeof workspaceSchema>;

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

interface WorkspaceSetupFormProps {
  onSubmit: (values: WorkspaceFormValues) => Promise<void>;
}

export function WorkspaceSetupForm({ onSubmit }: WorkspaceSetupFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<WorkspaceFormValues>({
    resolver: zodResolver(workspaceSchema),
    defaultValues: { currency: "USD", locale: "en-US" },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="workspace-name">Workspace Name</Label>
        <Input
          id="workspace-name"
          placeholder="My Finances"
          aria-invalid={!!errors.name}
          {...register("name")}
        />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="currency">Currency</Label>
        <Select value={watch("currency")} onValueChange={(v) => setValue("currency", v)}>
          <SelectTrigger id="currency" aria-invalid={!!errors.currency}>
            <SelectValue placeholder="Select currency" />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.currency && <p className="text-sm text-destructive">{errors.currency.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="locale">Number Format / Locale</Label>
        <Select value={watch("locale")} onValueChange={(v) => setValue("locale", v)}>
          <SelectTrigger id="locale" aria-invalid={!!errors.locale}>
            <SelectValue placeholder="Select locale" />
          </SelectTrigger>
          <SelectContent>
            {LOCALES.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.locale && <p className="text-sm text-destructive">{errors.locale.message}</p>}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 data-icon="inline-start" className="animate-spin" />}
        Create Workspace
      </Button>
    </form>
  );
}
