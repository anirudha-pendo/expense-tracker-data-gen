import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BpBox } from "@/shared/components/bp-box";
import { useAuthContext } from "../hooks/auth-context";
import { SignInForm } from "../components/sign-in-form";
import type { SignInFormValues } from "../schemas/auth.schema";

export function SignInPage() {
  const { signIn, hasWorkspace } = useAuthContext();
  const navigate = useNavigate();

  async function handleSignIn(values: SignInFormValues) {
    try {
      await signIn(values.username, values.password);
      navigate(hasWorkspace ? "/" : "/setup-workspace", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    }
  }

  return (
    <div className="min-h-svh bg-background flex flex-col items-center justify-center p-12">
      {/* Brand mark */}
      <div className="mb-10 flex flex-col items-center gap-1 section-enter">
        <span className="font-mono text-[11px] tracking-[0.35em] uppercase text-muted-foreground">
          — Ledger —
        </span>
        <p className="font-mono text-[10px] text-muted-foreground/60 tracking-wider">
          Local finance tracking
        </p>
      </div>

      <BpBox className="w-full max-w-[360px] section-enter" style={{ animationDelay: "40ms" }}>
        {/* Header strip */}
        <div className="border-b border-foreground px-5 py-3 flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            Sign In
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/40">v1.0</span>
        </div>

        <div className="p-5">
          <SignInForm onSubmit={handleSignIn} />
        </div>

        <div className="border-t border-foreground px-5 py-3">
          <p className="font-mono text-[10px] text-muted-foreground">
            No account?{" "}
            <Link
              to="/sign-up"
              className="text-foreground underline underline-offset-2 hover:no-underline transition-all duration-150"
            >
              Create one
            </Link>
          </p>
        </div>
      </BpBox>

      <p className="mt-8 font-mono text-[10px] text-muted-foreground/40 tracking-wider section-enter" style={{ animationDelay: "80ms" }}>
        Data stored locally. No servers.
      </p>
    </div>
  );
}
