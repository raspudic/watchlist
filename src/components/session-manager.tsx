"use client";

import { LogOut, MonitorSmartphone, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { Spinner } from "@/components/ui/spinner";
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

type Message = { text: string; tone: "error" | "success" } | null;

const RETURN_TO = "/login?returnTo=/settings";

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
  const [message, setMessage] = useState<Message>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let ignore = false;

    void authClient.listSessions().then((result) => {
      if (ignore) return;

      if (result.error) {
        if (result.error.status === 401) {
          router.replace(RETURN_TO);
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
    setMessage(null);
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

    router.replace(RETURN_TO);
    router.refresh();
  }

  async function revokeSession(token: string) {
    setPendingToken(token);
    setMessage(null);
    const result = await authClient.revokeSession({ token });

    if (result.error) {
      if (result.error.status === 401) {
        router.replace(RETURN_TO);
        router.refresh();
        return;
      }

      setMessage({
        text: result.error.status === 429
          ? "Too many requests. Wait a minute and try again."
          : "That session could not be signed out. Try again.",
        tone: "error",
      });
      setPendingToken(null);
      return;
    }

    setSessions((current) => current.filter((session) => session.token !== token));
    setPendingToken(null);
    setMessage({ text: "The device was signed out.", tone: "success" });
  }

  async function revokeOtherSessions() {
    setRevokingOthers(true);
    setMessage(null);
    const result = await authClient.revokeOtherSessions();

    if (result.error) {
      if (result.error.status === 401) {
        router.replace(RETURN_TO);
        router.refresh();
        return;
      }

      setMessage({
        text: result.error.status === 429
          ? "Too many requests. Wait a minute and try again."
          : "Your other sessions could not be signed out. Try again.",
        tone: "error",
      });
      setRevokingOthers(false);
      return;
    }

    setSessions((current) => current.filter((session) => session.id === currentSessionId));
    setRevokingOthers(false);
    setMessage({ text: "All other devices were signed out.", tone: "success" });
  }

  if (loading) {
    return (
      <div className="sessions-state" role="status">
        <Spinner size={19} /> Loading your devices…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="sessions-state sessions-error">
        <ShieldCheck aria-hidden="true" size={22} />
        <div>
          <h3>{loadError === "fresh" ? "Confirm it’s you" : "Devices are temporarily unavailable"}</h3>
          <p>
            {loadError === "fresh"
              ? "For your security, sign in again before viewing every device with access to your account."
              : loadError === "rate-limited"
                ? "Too many requests were made. Wait a minute, then try again."
                : "We couldn’t load your devices. Your current session is unaffected."}
          </p>
          {loadError === "fresh" ? (
            <Button loading={reauthenticating} loadingLabel="Signing out…" onClick={signInAgain} size="sm">
              Sign in again
            </Button>
          ) : (
            <Button onClick={retryLoad} size="sm" variant="secondary">
              <RefreshCw aria-hidden="true" size={15} /> Try again
            </Button>
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
                  <h3>{describeSession(session.userAgent)}</h3>
                  {current ? <Badge tone="accent" uppercase>This device</Badge> : null}
                </div>
                <dl>
                  <div><dt>Last active</dt><dd>{formatSessionDate(session.updatedAt)}</dd></div>
                  <div><dt>Signed in</dt><dd>{formatSessionDate(session.createdAt)}</dd></div>
                  <div><dt>Expires</dt><dd>{formatSessionDate(session.expiresAt)}</dd></div>
                  {network ? <div><dt>Network</dt><dd>{network}</dd></div> : null}
                </dl>
              </div>
              {current ? null : (
                <Button
                  className="session-revoke"
                  disabled={revokingOthers}
                  loading={pendingToken === session.token}
                  onClick={() => void revokeSession(session.token)}
                  size="sm"
                  variant="ghost"
                >
                  Sign out
                </Button>
              )}
            </article>
          );
        })}
      </div>

      {message ? <InlineMessage tone={message.tone}>{message.text}</InlineMessage> : null}

      <div className="settings-actions">
        <Button
          disabled={otherSessionCount === 0}
          loading={revokingOthers}
          loadingLabel="Signing out…"
          onClick={() => void revokeOtherSessions()}
          variant="secondary"
        >
          <LogOut aria-hidden="true" size={16} />
          Sign out everywhere else
        </Button>
      </div>
    </>
  );
}
