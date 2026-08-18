function parseOrigin(value: string | null) {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function expectedOrigin(request: Request) {
  const configuredUrl = process.env.BETTER_AUTH_URL?.trim();
  return configuredUrl ? parseOrigin(configuredUrl) : parseOrigin(request.url);
}

function isJsonRequest(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  return mediaType === "application/json";
}

export function validateStateChangingApiRequest(request: Request) {
  const origin = parseOrigin(request.headers.get("origin"));

  if (!origin || origin !== expectedOrigin(request)) {
    return Response.json(
      { error: "Request origin is not allowed." },
      { status: 403 },
    );
  }

  if (!isJsonRequest(request)) {
    return Response.json(
      { error: "Content-Type must be application/json." },
      { status: 415 },
    );
  }

  return null;
}
