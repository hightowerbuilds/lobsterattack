import { Link, createFileRoute } from "@tanstack/react-router";
import { SignalPill } from "../components/SignalPill";

export const Route = createFileRoute("/")({
  component: BearClawInnPage,
});

function BearClawInnPage() {
  return (
    <main className="page-shell tavern-home">
      <section className="tavern-hero">
        <div className="tavern-copy">
          <p className="tavern-kicker">Frontier Tavern</p>
          <h1>Bear Claw Inn</h1>
          <p className="tavern-lede">
            A timber-and-firelight landing page built like a northern tavern: rough wood, fur-lined
            corners, lake canoes on the wall, and wide country photographs all around the room.
          </p>
          <div className="tavern-signal-row">
            <SignalPill tone="amber">wood smoke</SignalPill>
            <SignalPill tone="ink">canoe house</SignalPill>
            <SignalPill tone="teal">concierge inside</SignalPill>
          </div>
          <div className="tavern-link-row">
            <Link className="tavern-button-primary" to="/concierge">
              Enter Concierge
            </Link>
            <Link className="tavern-button-secondary" to="/lobster-attack">
              Visit Lobster Attack
            </Link>
          </div>
        </div>

        <article className="tavern-photo-frame">
          <img src="/images/bear-claw-inn/log-cabin-forest.jpg" alt="Log cabin in the forest" />
          <div className="tavern-photo-copy">
            <p className="tavern-card-kicker">Front Porch</p>
            <h2>Log walls and pine shadows</h2>
            <p>The inn opens like a lodge in the trees instead of a blue portal page.</p>
          </div>
        </article>
      </section>

      <section className="tavern-strip">
        <div className="tavern-strip-item">
          <strong>Firelight Room</strong>
          <span>Warm cedar boards, brass hooks, fur throws, and heavy timber trim.</span>
        </div>
        <div className="tavern-strip-item">
          <strong>Canoe Loft</strong>
          <span>Lake-country gear, paddles, waxed canvas, and old northern maps.</span>
        </div>
        <div className="tavern-strip-item">
          <strong>Outdoor Wall</strong>
          <span>Big landscape photos bring the mountains, water, and weather inside.</span>
        </div>
      </section>

      <section className="tavern-gallery">
        <article className="tavern-gallery-card tavern-gallery-card-large">
          <img src="/images/bear-claw-inn/canoe-lake.jpg" alt="Canoe Lake in Ontario" />
          <div className="tavern-gallery-copy">
            <p className="tavern-card-kicker">Canoe Wall</p>
            <h2>Paddles by the lake</h2>
            <p>
              The canoe image gives the inn its outfitter feel, like a tavern built for weathered
              jackets, wet boots, and long stories after the water.
            </p>
          </div>
        </article>

        <article className="tavern-gallery-card">
          <img
            src="/images/bear-claw-inn/banff-lake-mountains.jpg"
            alt="Lake and mountains in Banff National Park"
          />
          <div className="tavern-gallery-copy">
            <p className="tavern-card-kicker">High Country</p>
            <h2>Mountain air over the bar</h2>
            <p>
              A wide mountain-and-lake panel turns the page from generic lodge into something more
              like a frontier outpost with a view.
            </p>
          </div>
        </article>
      </section>

      <section className="tavern-grid">
        <article className="tavern-note-card">
          <p className="tavern-card-kicker">House Notes</p>
          <h2>How the inn works</h2>
          <ul className="flat-list">
            <li>Visitors arrive in the tavern and move deeper only when needed.</li>
            <li>Concierge handles the guided trust surfaces inside the house.</li>
            <li>Lobster Attack stays separate as a louder side room with its own tone.</li>
          </ul>
        </article>

        <article className="tavern-note-card tavern-note-card-dark">
          <p className="tavern-card-kicker">Materials</p>
          <h2>Wood, furs, and river gear</h2>
          <p>
            The styling leans on rough planks, hide tones, iron hardware, and camp textures rather
            than polished product UI.
          </p>
        </article>

        <article className="tavern-note-card">
          <p className="tavern-card-kicker">Photo Credits</p>
          <ul className="flat-list">
            <li>`CanoeLake.JPG` from Wikimedia Commons.</li>
            <li>`Lake_and_mountains_of_Banff_NP.jpg` from Wikimedia Commons.</li>
            <li>
              `Log_cabin_in_the_forests_of_Puget_Sound_LCCN2004665720.jpg` via Wikimedia Commons.
            </li>
          </ul>
        </article>
      </section>
    </main>
  );
}
