build "web" {
  dockerfile = "Dockerfile"
}

postgres "main" {
  reshape {
    enabled        = true
    migrations_dir = "migrations"
  }
}

secret "tmdb_read_access_token" {}

secret "better_auth_secret" {
  generated = true
}

service "web" {
  build   = build.web
  command = "pnpm start"

  endpoint {
    public = true

    health_check {
      path = "/api/health"
    }
  }

  env = {
    PORT                  = port
    DATABASE_URL          = postgres.main.url
    TMDB_ACCESS_TOKEN     = secret.tmdb_read_access_token
    BETTER_AUTH_SECRET    = secret.better_auth_secret
    BETTER_AUTH_URL       = "https://${service.web.public_url}"
  }

  dev {
    command = "pnpm auth:bootstrap && pnpm dev:seed && pnpm dev"

    env = {
      BETTER_AUTH_URL       = "http://${service.web.public_url}"
      BOOTSTRAP_USERNAME    = "watchlist"
      BOOTSTRAP_PASSWORD    = "watchlist-local-2026!"
      SEED_DEVELOPMENT_DATA = "true"
    }
  }
}
