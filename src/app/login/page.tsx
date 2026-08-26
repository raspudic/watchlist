import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { InlineMessage } from "@/components/ui/inline-message";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function safeReturnTo(value: string | string[] | undefined) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/watchlist";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const session = await getSession();
  const { deleted } = params;

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
        {deleted === "1" ? (
          <InlineMessage tone="success">Your account and library were permanently deleted.</InlineMessage>
        ) : null}
        <LoginForm returnTo={safeReturnTo(params.returnTo)} />
        <p className="auth-meta"><Link href="/about">About &amp; privacy</Link></p>
      </section>
    </main>
  );
}
