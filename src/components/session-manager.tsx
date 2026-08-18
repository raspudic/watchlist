"use client";

import { LoaderCircle, LogOut, MonitorSmartphone, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { describeSession, formatSessionDate, maskIpAddress } from "@/lib/session-display";

interface ActiveSession {
  id: string;
  token: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  expiresAt: Date | string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

type LoadError = "fresh" | "rate-limited" | "unknown" | null;

function isFreshSessionError(error: { code?: string; status?: number } | null) {
  return error?.code === "SESSION_NOT_FRESH" || error?.status === 403;
}

export function SessionManager({ currentSessionId }: { currentSessionId: string }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loadError, setLoadError] = useState<LoadError>(null);
  const [loading, setLoading] = useState(true);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [reauthenticating, setReauthenticating] = useState(false);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [message, setMessage] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let ignore = false;

    void authClient.listSessions().then((result) => {
      if (ignore) return;

      if (result.error) {
        if (result.error.status === 401) {
          router.replace("/login?returnTo=/account/sessions");
          router.refresh();
          return;
        }

        setLoadError(
          isFreshSessionError(result.error)
            ? "fresh"
            : result.error.status === 429
              ? "rate-limited"
              : "unknown",
        );
        setLoading(false);
        return;
      }

      setSessions((result.data ?? []) as ActiveSession[]);
      setLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [reloadCount, router]);

  function retryLoad() {
    setLoading(true);
    setLoadError(null);
    setMessage("");
    setReloadCount((count) => count + 1);
  }

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => {
      if (a.id === currentSessionId) return -1;
      if (b.id === currentSessionId) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }),
    [currentSessionId, sessions],
  );
  const otherSessionCount = sessions.filter((session) => session.id !== currentSessionId).length;

  async function signInAgain() {
    setReauthenticating(true);
    const result = await authClient.signOut();
    if (result.error) {
      setReauthenticating(false);
      setLoadError(result.error.status === 429 ? "rate-limited" : "unknown");
      return;
    }

    router.replace("/login?returnTo=/account/sessions");
    router.refresh();
  }

  async function revokeSession(token: string) {
    setPendingToken(token);
    setMessage("");
    const result = await authClient.revokeSession({ token });

    if (result.error) {
      if (result.error.status === 401) {
        router.replace("/login?returnTo=/account/sessions");
        router.refresh();
        return;
      }

      setMessage(
        result.error.status === 429
          ? "Too many requests. Wait a minute and try again."
          : "That session could not be signed out. Try again.",
      );
      setPendingToken(null);
      return;
    }

    setSessions((current) => current.filter((session) => session.token !== token));
    setPendingToken(null);
    setMessage("The device was signed out.");
  }

  async function revokeOtherSessions() {
    setRevokingOthers(true);
    setMessage("");
    const result = await authClient.revokeOtherSessions();

    if (result.error) {
      if (result.error.status === 401) {
        router.replace("/login?returnTo=/account/sessions");
        router.refresh();
        return;
      }

      setMessage(
        result.error.status === 429
          ? "Too many requests. Wait a minute and try again."
          : "Your other sessions could not be signed out. Try again.",
      );
      setRevokingOthers(false);
      return;
    }

    setSessions((current) => current.filter((session) => session.id === currentSessionId));
    setRevokingOthers(false);
    setMessage("All other devices were signed out.");
  }

  if (loading) {
    return (
      <div className="sessions-state" role="status">
        <LoaderCircle aria-hidden="true" className="spin" size={19} /> Loading active sessions…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="sessions-state sessions-error">
        <ShieldCheck aria-hidden="true" size={22} />
        <div>
          <h2>{loadError === "fresh" ? "Confirm it’s you" : "Sessions are temporarily unavailable"}</h2>
          <p>
            {loadError === "fresh"
              ? "For your security, sign in again before viewing every device with access to your account."
              : loadError === "rate-limited"
                ? "Too many requests were made. Wait a minute, then try again."
                : "We couldn’t load your sessions. Your current session is unaffected."}
          </p>
          {loadError === "fresh" ? (
            <button className="primary-button" disabled={reauthenticating} onClick={signInAgain} type="button">
              {reauthenticating ? <LoaderCircle aria-hidden="true" className="spin" size={15} /> : null}
              {reauthenticating ? "Signing out…" : "Sign in again"}
            </button>
          ) : (
            <button className="secondary-button" onClick={retryLoad} type="button"><RefreshCw size={15} /> Try again</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="session-list">
        {sortedSessions.map((session) => {
          const current = session.id === currentSessionId;
          const network = maskIpAddress(session.ipAddress);
          return (
            <article className="session-row" key={session.id}>
              <div className="session-icon" aria-hidden="true">
                {/Android|iPhone|iPad|iPod/.test(session.userAgent ?? "") ? <Smartphone size={19} /> : <MonitorSmartphone size={19} />}
              </div>
              <div className="session-copy">
                <div className="session-title">
                  <h2>{describeSession(session.userAgent)}</h2>
                  {current ? <span>Current device</span> : null}
                </div>
                <dl>
                  <div><dt>Last active</dt><dd>{formatSessionDate(session.updatedAt)}</dd></div>
                  <div><dt>Signed in</dt><dd>{formatSessionDate(session.createdAt)}</dd></div>
                  <div><dt>Expires</dt><dd>{formatSessionDate(session.expiresAt)}</dd></div>
                  {network ? <div><dt>Network</dt><dd>{network}</dd></div> : null}
                </dl>
              </div>
              {current ? null : (
                <button
                  className="session-revoke"
                  disabled={pendingToken === session.token || revokingOthers}
                  onClick={() => void revokeSession(session.token)}
                  type="button"
                >
                  {pendingToken === session.token ? <LoaderCircle aria-hidden="true" className="spin" size={15} /> : <LogOut aria-hidden="true" size={15} />}
                  Sign out
                </button>
              )}
            </article>
          );
        })}
      </div>

      {message ? <p className="sessions-message" role="status">{message}</p> : null}

      <div className="sessions-actions">
        <button
          className="secondary-button"
          disabled={otherSessionCount === 0 || revokingOthers}
          onClick={() => void revokeOtherSessions()}
          type="button"
        >
          {revokingOthers ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : <LogOut aria-hidden="true" size={16} />}
          {revokingOthers ? "Signing out…" : "Sign out everywhere else"}
        </button>
        <Link href="/watchlist">Back to watchlist</Link>
      </div>
    </>
  );
}
