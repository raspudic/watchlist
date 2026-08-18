import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description: "About Watchlist, privacy, and data credits.",
};

export default function AboutPage() {
  return (
    <main className="about-page">
      <article className="about-panel">
        <header className="about-header">
          <Link className="login-brand" href="/" aria-label="Watchlist home">
            <span aria-hidden="true">/</span> watchlist
          </Link>
          <Link className="about-return" href="/">Return to Watchlist</Link>
        </header>

        <div className="about-intro">
          <p className="eyebrow">About</p>
          <h1>A quiet place for what you want to watch.</h1>
          <p>Watchlist is a private, invitation-only app shared with friends.</p>
        </div>

        <section className="about-section" aria-labelledby="privacy-heading">
          <h2 id="privacy-heading">Privacy</h2>
          <ul className="about-list">
            <li>
              <strong>Stored here.</strong> Your account email, library and notes, plus session security details such as IP address and browser or device information.
            </li>
            <li>
              <strong>Sent to TMDB.</strong> When you search for a title, this server sends the search terms to TMDB to find matching movies and shows.
            </li>
            <li>
              <strong>Kept out of logs.</strong> Application code does not intentionally log passwords, authentication tokens, email addresses, search terms, notes, or other library content.
            </li>
            <li>
              <strong>Deleted on request.</strong> You can ask the administrator to remove your account and associated library data from the live database. Deleted data may remain in encrypted infrastructure backups until those backups expire.
            </li>
          </ul>
          <p className="about-usage">Automated or bulk use is not supported.</p>
        </section>

        <section className="about-section tmdb-attribution" aria-labelledby="credits-heading">
          <h2 id="credits-heading">Credits</h2>
          <a href="https://www.themoviedb.org">
            <Image
              alt="TMDB"
              className="tmdb-logo"
              height={36}
              src="/tmdb-logo.svg"
              unoptimized
              width={273}
            />
          </a>
          <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        </section>
      </article>
    </main>
  );
}
