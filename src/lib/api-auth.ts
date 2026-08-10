import "server-only";

import { auth } from "@/lib/auth";

export async function getRequestUserId(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  return session?.user?.id ?? null;
}
