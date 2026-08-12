import { eq } from "drizzle-orm";

import { db } from "../src/lib/db/client";
import { mediaItems, user } from "../src/lib/db/schema";

const DEV_USERNAME = "watchlist";

async function main() {
  if (process.env.SEED_DEVELOPMENT_DATA !== "true") {
    throw new Error("Development seed data can only run from the Specific dev environment.");
  }

  const developmentUser = await db.query.user.findFirst({
    where: eq(user.username, DEV_USERNAME),
  });

  if (!developmentUser) {
    throw new Error(`Development user ${DEV_USERNAME} does not exist. Run auth:bootstrap first.`);
  }

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  await db
    .insert(mediaItems)
    .values([
      {
        id: "dev-seed-the-matrix",
        userId: developmentUser.id,
        provider: "tmdb",
        externalId: 603,
        mediaType: "movie",
        title: "The Matrix",
        releaseYear: 1999,
        posterPath: "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
        overview: "A hacker discovers that the world he knows is a simulated reality.",
        status: "watchlist",
        watchlistNote: "A friend recommended this after we talked about sci-fi films.",
        addedAt: new Date(now),
        updatedAt: new Date(now),
      },
      {
        id: "dev-seed-attack-on-titan",
        userId: developmentUser.id,
        provider: "tmdb",
        externalId: 1429,
        mediaType: "tv",
        title: "Attack on Titan",
        releaseYear: 2013,
        posterPath: "/hTP1DtLGFamjfu8WqjnuQdP1n4i.jpg",
        overview: "Humanity fights for survival against towering creatures beyond its walls.",
        status: "watchlist",
        addedAt: new Date(now - day),
        updatedAt: new Date(now - day),
      },
      {
        id: "dev-seed-spirited-away",
        userId: developmentUser.id,
        provider: "tmdb",
        externalId: 129,
        mediaType: "movie",
        title: "Spirited Away",
        releaseYear: 2001,
        posterPath: "/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg",
        overview: "A young girl enters a mysterious world of spirits and must find her way home.",
        status: "watched",
        reviewNote: "Beautiful, strange, and completely absorbing.",
        rating: 9,
        addedAt: new Date(now - 4 * day),
        watchedAt: new Date(now - 2 * day),
        updatedAt: new Date(now - 2 * day),
      },
      {
        id: "dev-seed-the-bear",
        userId: developmentUser.id,
        provider: "tmdb",
        externalId: 136315,
        mediaType: "tv",
        title: "The Bear",
        releaseYear: 2022,
        posterPath: "/sHFlbKS3WLqMnp9t2ghADIJFnuQ.jpg",
        overview: "A chef returns home to run his family's sandwich shop.",
        status: "watched",
        addedAt: new Date(now - 6 * day),
        watchedAt: new Date(now - 3 * day),
        updatedAt: new Date(now - 3 * day),
      },
    ])
    .onConflictDoNothing();

  console.log("Development library is ready.");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
