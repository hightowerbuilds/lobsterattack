import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/lobster-attack")({
  component: LobsterAttackPage,
});

function LobsterAttackPage() {
  return (
    <main className="page-shell aquarium-page">
      <section className="aquarium-hero">
        <div className="aquarium-hero-copy">
          <p className="aquarium-kicker">Special Exhibition</p>
          <h1>Lobster Attack</h1>
          <p className="aquarium-lede">
            An aquarium-style route built like a splashy attraction campaign, with real underwater
            photography and glowing reef panels.
          </p>
          <div className="aquarium-button-row">
            <Link className="aquarium-button-primary" to="/">
              Enter Bear Claw Inn
            </Link>
            <Link className="aquarium-button-secondary" to="/concierge">
              Visit Concierge
            </Link>
          </div>
        </div>

        <div className="aquarium-hero-media">
          <img
            className="aquarium-main-photo"
            src="/images/lobster-attack/coral-reef-red-sea.jpg"
            alt="Underwater coral reef in the Red Sea"
          />
        </div>
      </section>

      <section className="aquarium-stats-grid">
        <article className="aquarium-stat-card">
          <p className="aquarium-stat-label">Featured Event</p>
          <h2>Glow tank after dark</h2>
          <p>
            A page with the tone of a ticketed aquarium spectacular instead of a generic info route.
          </p>
        </article>
        <article className="aquarium-stat-card">
          <p className="aquarium-stat-label">Visual Mix</p>
          <h2>Real reef photography</h2>
          <p>Large underwater images provide the realism and scale that an aquarium page needs.</p>
        </article>
        <article className="aquarium-stat-card">
          <p className="aquarium-stat-label">House Mood</p>
          <h2>Quiet blue spectacle</h2>
          <p>The route now leans fully into underwater photography and aquarium-ad atmosphere.</p>
        </article>
      </section>

      <section className="aquarium-gallery-grid">
        <article className="aquarium-photo-card aquarium-photo-card-large">
          <img
            src="/images/lobster-attack/ocean-coral-reef.jpg"
            alt="Ocean coral reef underwater scene"
          />
          <div className="aquarium-photo-copy">
            <p className="aquarium-card-kicker">Main Tank</p>
            <h2>Reef chamber</h2>
            <p>
              A wide coral reef scene sets the depth, color, and hush of the page before the user
              reaches any copy.
            </p>
          </div>
        </article>

        <article className="aquarium-photo-card">
          <img
            src="/images/lobster-attack/living-on-a-coral-reef.jpg"
            alt="A fish living on a coral reef"
          />
          <div className="aquarium-photo-copy">
            <p className="aquarium-card-kicker">Close Encounter</p>
            <h2>Living coral detail</h2>
            <p>A tighter reef photograph gives the route the feel of a gallery wall.</p>
          </div>
        </article>

        <article className="aquarium-attribution-card">
          <p className="aquarium-card-kicker">Photo Credits</p>
          <ul className="flat-list">
            <li>`Ocean_coral_reef.jpg` from Wikimedia Commons.</li>
            <li>`Coral_Reef_in_the_Red_Sea.JPG` from Wikimedia Commons.</li>
            <li>`Living_on_a_Coral_Reef_(8397328768).jpg` from Wikimedia Commons.</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
