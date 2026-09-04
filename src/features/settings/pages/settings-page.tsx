import { AppLayout } from "@/shared/components/app-layout";
import { BpBox } from "@/shared/components/bp-box";
import { ProfileForm } from "../components/profile-form";
import { WorkspaceForm } from "../components/workspace-form";
import { CategoryManager } from "../components/category-manager";
import { DataExportImport } from "../components/data-export-import";
import { BudgetManager } from "@/features/budgets/components/budget-manager";

function Section({ label, description, children }: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <BpBox className="stagger-item">
      <div className="border-b border-border/40 px-5 py-3 flex items-baseline justify-between">
        <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/40">{description}</span>
      </div>
      <div className="p-5">{children}</div>
    </BpBox>
  );
}

export function SettingsPage() {
  return (
    <AppLayout title="Settings">
      <div className="w-full flex flex-col gap-8">
        <Section label="Profile" description="personal info">
          <ProfileForm />
        </Section>

        <Section label="Workspace" description="name · currency · locale">
          <WorkspaceForm />
        </Section>

        <Section label="Categories" description="manage">
          <CategoryManager />
        </Section>

        <Section label="Budgets" description="monthly limits">
          <BudgetManager />
        </Section>

        <Section label="Data" description="export · import">
          <DataExportImport />
        </Section>
      </div>
    </AppLayout>
  );
}
