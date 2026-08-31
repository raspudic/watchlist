/** The media types that exist on the services we link out to. */
export type LinkableMediaType = "movie" | "tv";

export type TitleLink = { href: string; label: string };

/**
 * Where a title can be read about elsewhere.
 *
 * Only services we can point at the title itself get a link. Rotten Tomatoes
 * is absent on purpose: it publishes no id, and its URLs are editorial slugs
 * that guessing gets wrong on sequels and remakes, so the only honest link
 * would land on a search page rather than the film.
 */
export function titleLinks({
  imdbId,
  mediaType,
  tmdbId,
}: {
  imdbId: string | null;
  mediaType: LinkableMediaType;
  tmdbId: number;
}): TitleLink[] {
  const links: TitleLink[] = [];

  if (imdbId) links.push({ href: `https://www.imdb.com/title/${imdbId}/`, label: "IMDb" });

  links.push({ href: `https://www.themoviedb.org/${mediaType}/${tmdbId}`, label: "TMDB" });

  // Letterboxd resolves a TMDB id against its own catalogue, which is films
  // only: a series id there silently redirects to an unrelated film.
  if (mediaType === "movie") {
    links.push({ href: `https://letterboxd.com/tmdb/${tmdbId}/`, label: "Letterboxd" });
  }

  return links;
}
