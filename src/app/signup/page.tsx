import { redirect } from "next/navigation";

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
        <div className="login-brand"><span>/</span> later</div>
        <div className="login-copy">
          <h1>Invitation required</h1>
          <p>Later accounts are created from single-use invitations.</p>
        </div>
        <p className="auth-switch">Have an invitation link? Open it to create your account.</p>
        <p className="auth-switch"><a href="/login">Return to sign in</a></p>
      </section>
    </main>
  );
}
