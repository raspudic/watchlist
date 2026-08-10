import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    redirect("/watchlist");
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-brand"><span>/</span> watchlist</div>
        <div className="login-copy">
          <h1>Welcome back</h1>
          <p>Sign in to get to your list.</p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
