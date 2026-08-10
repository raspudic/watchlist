import { NextResponse } from "next/server";
import { z } from "zod";

import { getRequestUserId } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const querySchema = z.string().trim().min(1).max(100);

type TmdbSearchResult = {
  id: number;
  media_type: "movie" | "tv" | string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string | null;
  popularity?: number;
  vote_average?: number;
};

function releaseYear(date: string | undefined) {
  const match = date?.match(/^\d{4}/);
  return match ? Number(match[0]) : null;
}

export async function GET(request: Request) {
  const userId = await getRequestUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsedQuery = querySchema.safeParse(new URL(request.url).searchParams.get("q") ?? "");
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Enter a title to search for." }, { status: 400 });
  }

  const token = process.env.TMDB_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Search is not configured yet." }, { status: 503 });
  }

  const url = new URL("https://api.themoviedb.org/3/search/multi");
  url.searchParams.set("query", parsedQuery.data);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", "en-US");
  url.searchParams.set("page", "1");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Search is temporarily unavailable." }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: "Search is temporarily unavailable." }, { status: 502 });
  }

  const payload = (await response.json()) as { results?: TmdbSearchResult[] };
  const results = (payload.results ?? [])
    .filter((result) => (result.media_type === "movie" || result.media_type === "tv") && Number.isInteger(result.id))
    .map((result) => ({
      provider: "tmdb" as const,
      externalId: result.id,
      mediaType: result.media_type,
      title: result.media_type === "movie" ? result.title ?? "Untitled" : result.name ?? "Untitled",
      originalTitle:
        result.media_type === "movie" ? result.original_title ?? null : result.original_name ?? null,
      releaseYear: releaseYear(result.media_type === "movie" ? result.release_date : result.first_air_date),
      posterPath: result.poster_path ?? null,
      overview: result.overview?.trim() || null,
      popularity: typeof result.popularity === "number" ? result.popularity : 0,
      voteAverage: typeof result.vote_average === "number" ? result.vote_average : null,
    }));

  return NextResponse.json({ results });
}
