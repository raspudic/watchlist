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

secret "mateo_password_v2" {}

config "bootstrap_username" {
  default = "mateo"
}

service "web" {
  build   = build.web
  command = "pnpm auth:bootstrap && pnpm start"

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
    BOOTSTRAP_USERNAME    = config.bootstrap_username
    BOOTSTRAP_PASSWORD    = secret.mateo_password_v2
  }

  dev {
    command = "pnpm dev"

    env = {
      BETTER_AUTH_URL = "http://${service.web.public_url}"
    }
  }
}
