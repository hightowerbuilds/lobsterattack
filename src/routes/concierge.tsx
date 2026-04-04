import { createFileRoute } from "@tanstack/react-router";
import { JsonPanel } from "../components/JsonPanel";
import { hospitalityDescriptor, protocolShapes } from "../lib/hospitality";

export const Route = createFileRoute("/concierge")({
  component: ConciergePage,
});

function ConciergePage() {
  return (
    <main className="page-shell">
      <section className="panel concierge-hero">
        <p className="section-label">Concierge</p>
        <h1>
          Bear Claw Inn guides visitors through the trust surface instead of exposing one giant
          agent endpoint.
        </h1>
        <p className="hero-lede">
          Concierge is the guided layer of Bear Claw Inn. It explains how arrivals move through
          observation, review, and bounded action without ever collapsing untrusted input, secrets,
          and side effects into the same path.
        </p>
      </section>

      <section className="two-up-grid">
        <JsonPanel
          label="Descriptor"
          title=".well-known hospitality shape"
          value={hospitalityDescriptor}
          caption="This is the public identity of Bear Claw Inn as a safe host."
        />
        <article className="panel contract-panel">
          <div className="panel-head">
            <div>
              <p className="section-label">Concierge Rules</p>
              <h2>House assumptions</h2>
            </div>
          </div>
          <ul className="flat-list">
            <li>`observe` may expose raw text, hidden markup, and embedded instructions.</li>
            <li>`review` must return structured output with taint labels and proposed actions.</li>
            <li>`execute` must reject freeform instructions and widened parameters.</li>
            <li>
              Approval artifacts are bounded to one action shape instead of broad agent authority.
            </li>
          </ul>
        </article>
      </section>

      <section className="three-up-grid">
        <JsonPanel
          label="Observe Contract"
          title="ObservationRecord"
          value={protocolShapes.ObservationRecord}
          caption="This tier acknowledges exposure to hostile content."
        />
        <JsonPanel
          label="Review Contract"
          title="ReviewRecord"
          value={protocolShapes.ReviewRecord}
          caption="This tier carries taint labels and approval readiness."
        />
        <JsonPanel
          label="Execute Contract"
          title="ExecuteRequest"
          value={protocolShapes.ExecuteRequest}
          caption="This tier accepts only typed, reviewed input."
        />
      </section>
    </main>
  );
}
