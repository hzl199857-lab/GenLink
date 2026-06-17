import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterFlow } from "@/components/auth/RegisterFlow";

export default function RegisterPage() {
  return (
    <AuthShell>
      <RegisterFlow />
    </AuthShell>
  );
}
