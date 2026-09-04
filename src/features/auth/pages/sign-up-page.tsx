import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BpBox } from "@/shared/components/bp-box";
import { useAuthContext } from "../hooks/auth-context";
import { SignUpForm } from "../components/sign-up-form";
import type { SignUpFormValues } from "../schemas/auth.schema";

export function SignUpPage() {
  const { signUp } = useAuthContext();
  const navigate = useNavigate();

  async function handleSignUp(values: SignUpFormValues) {
    try {
      await signUp(values.username, values.displayName, values.password);
      navigate("/setup-workspace", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed");
    }
  }

  return (
    <div className="min-h-svh bg-background flex flex-col items-center justify-center p-12">
      <div className="mb-10 flex flex-col items-center gap-1 section-enter">
        <span className="font-mono text-[11px] tracking-[0.35em] uppercase text-muted-foreground">
          — Ledger —
        </span>
        <p className="font-mono text-[10px] text-muted-foreground/60 tracking-wider">
          Local finance tracking
        </p>
      </div>

      <BpBox className="w-full max-w-[380px] section-enter" style={{ animationDelay: "40ms" }}>
        <div className="border-b border-foreground px-5 py-3 flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            Create Account
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/40">new user</span>
        </div>

        <div className="p-5">
          <SignUpForm onSubmit={handleSignUp} />
        </div>

        <div className="border-t border-foreground px-5 py-3">
          <p className="font-mono text-[10px] text-muted-foreground">
            Already have an account?{" "}
            <Link
              to="/sign-in"
              className="text-foreground underline underline-offset-2 hover:no-underline transition-all duration-150"
            >
              Sign in
            </Link>
          </p>
        </div>
      </BpBox>

      <p className="mt-8 font-mono text-[10px] text-muted-foreground/40 tracking-wider section-enter" style={{ animationDelay: "80ms" }}>
        Data stays on this device — no servers, no tracking.
      </p>
    </div>
  );
}
