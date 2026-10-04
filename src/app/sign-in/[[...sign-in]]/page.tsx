import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-background-primary flex items-center justify-center px-4">
      {/* "/" redirects to pictures.london, so send admins to /admin after a direct sign-in. */}
      <SignIn fallbackRedirectUrl="/admin" />
    </div>
  );
}
