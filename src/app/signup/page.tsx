import { redirect } from "next/navigation";

import { SignupForm } from "@/components/signup-form";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const session = await getSession();

  if (session) {
    redirect("/watchlist");
  }

  return (
    <main className="login-page signup-page">
      <section className="login-panel signup-panel">
        <div className="login-brand"><span>/</span> watchlist</div>
        <div className="login-copy">
          <h1>Create your account</h1>
          <p>Your library stays private to your sign-in.</p>
        </div>
        <SignupForm />
      </section>
    </main>
  );
}
