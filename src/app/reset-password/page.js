import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/AuthForms";

export const metadata = { title: "Reset password" };

export default function Page() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
