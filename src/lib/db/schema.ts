import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    username: text("username"),
    displayUsername: text("display_username"),
    role: text("role").default("user").notNull(),
    region: text("region"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_email_unique").on(table.email),
    uniqueIndex("user_username_unique").on(table.username),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: text("accepted_by"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("invitations_token_hash_unique").on(table.tokenHash),
    index("invitations_email_idx").on(table.email),
    index("invitations_expires_at_idx").on(table.expiresAt),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("session_token_unique").on(table.token),
    index("session_user_id_idx").on(table.userId),
  ],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_unique").on(table.providerId, table.accountId),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const rateLimit = pgTable(
  "rate_limit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("rate_limit_key_unique").on(table.key)],
);

export const apiRateLimitBuckets = pgTable(
  "api_rate_limit_buckets",
  {
    key: text("key").primaryKey(),
    count: integer("count").default(1).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("api_rate_limit_buckets_expires_at_idx").on(table.expiresAt)],
);

export const tmdbSearchCache = pgTable(
  "tmdb_search_cache",
  {
    key: text("key").primaryKey(),
    payload: text("payload").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("tmdb_search_cache_expires_at_idx").on(table.expiresAt)],
);

export const tmdbWatchProviderCache = pgTable(
  "tmdb_watch_provider_cache",
  {
    // Unlike the search cache the key is not hashed: a TMDB id and a country
    // code are not user-authored text, and a readable key is worth more here.
    key: text("key").primaryKey(),
    payload: text("payload").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("tmdb_watch_provider_cache_expires_at_idx").on(table.expiresAt)],
);

/**
 * Shared, authoritative TMDB metadata. Media items deliberately keep their
 * original snapshots, so custom titles and the library remain useful while a
 * catalog refresh is unavailable.
 */
export const catalogTitles = pgTable(
  "catalog_titles",
  {
    id: text("id").primaryKey(),
    provider: text("provider").default("tmdb").notNull(),
    externalId: integer("external_id").notNull(),
    mediaType: text("media_type").notNull(),
    title: text("title").notNull(),
    originalTitle: text("original_title"),
    releaseDate: date("release_date"),
    releaseYear: integer("release_year"),
    posterPath: text("poster_path"),
    overview: text("overview"),
    runtimeMinutes: integer("runtime_minutes"),
    voteAverage: real("vote_average"),
    voteCount: integer("vote_count"),
    popularity: real("popularity"),
    metadataRefreshedAt: timestamp("metadata_refreshed_at", { withTimezone: true }),
    availabilityRefreshedAt: timestamp("availability_refreshed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("catalog_titles_provider_identity_unique").on(
      table.provider,
      table.mediaType,
      table.externalId,
    ),
    index("catalog_titles_metadata_refreshed_at_idx").on(table.metadataRefreshedAt),
    index("catalog_titles_availability_refreshed_at_idx").on(table.availabilityRefreshedAt),
  ],
);

export const catalogTitleGenres = pgTable(
  "catalog_title_genres",
  {
    catalogTitleId: text("catalog_title_id")
      .notNull()
      .references(() => catalogTitles.id, { onDelete: "cascade" }),
    genreId: integer("genre_id").notNull(),
    name: text("name").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.catalogTitleId, table.genreId] }),
    index("catalog_title_genres_name_idx").on(table.name),
  ],
);

export const streamingProviders = pgTable(
  "streaming_providers",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    logoPath: text("logo_path"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

export const streamingProviderRegions = pgTable(
  "streaming_provider_regions",
  {
    providerId: integer("provider_id")
      .notNull()
      .references(() => streamingProviders.id, { onDelete: "cascade" }),
    region: text("region").notNull(),
    mediaType: text("media_type").notNull(),
    displayPriority: integer("display_priority").default(9_999).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.providerId, table.region, table.mediaType] }),
    index("streaming_provider_regions_region_idx").on(table.region, table.mediaType),
  ],
);

/** One row records the regional link even when the title has no offers there. */
export const catalogAvailability = pgTable(
  "catalog_availability",
  {
    catalogTitleId: text("catalog_title_id")
      .notNull()
      .references(() => catalogTitles.id, { onDelete: "cascade" }),
    region: text("region").notNull(),
    link: text("link"),
  },
  (table) => [primaryKey({ columns: [table.catalogTitleId, table.region] })],
);

export const catalogAvailabilityServices = pgTable(
  "catalog_availability_services",
  {
    catalogTitleId: text("catalog_title_id")
      .notNull()
      .references(() => catalogTitles.id, { onDelete: "cascade" }),
    region: text("region").notNull(),
    providerId: integer("provider_id")
      .notNull()
      .references(() => streamingProviders.id, { onDelete: "cascade" }),
    accessType: text("access_type").notNull(),
    displayPriority: integer("display_priority").default(9_999).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.catalogTitleId, table.region, table.providerId] }),
    index("catalog_availability_services_provider_idx").on(table.providerId, table.region),
  ],
);

export const userStreamingServices = pgTable(
  "user_streaming_services",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: integer("provider_id")
      .notNull()
      .references(() => streamingProviders.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.providerId] })],
);

export const mediaItems = pgTable(
  "media_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").default("tmdb").notNull(),
    externalId: integer("external_id"),
    mediaType: text("media_type").notNull(),
    title: text("title").notNull(),
    originalTitle: text("original_title"),
    releaseYear: integer("release_year"),
    posterPath: text("poster_path"),
    overview: text("overview"),
    status: text("status").default("watchlist").notNull(),
    watchlistNote: text("watchlist_note"),
    reviewNote: text("review_note"),
    rating: integer("rating"),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
    watchedAt: timestamp("watched_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("media_items_user_status_idx").on(table.userId, table.status),
    uniqueIndex("media_items_provider_identity_unique").on(
      table.userId,
      table.provider,
      table.mediaType,
      table.externalId,
    ),
  ],
);

export type MediaItem = typeof mediaItems.$inferSelect;
export type NewMediaItem = typeof mediaItems.$inferInsert;
