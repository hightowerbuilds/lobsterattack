import type { ReviewAction } from "../lib/hospitality";
import { SignalPill } from "./SignalPill";

type ActionCardProps = {
  action: ReviewAction;
  busy: boolean;
  onExecute: () => void;
  onTamper: () => void;
};

export function ActionCard({ action, busy, onExecute, onTamper }: ActionCardProps) {
  return (
    <article className="action-card">
      <div className="panel-head">
        <div>
          <p className="section-label">Proposed Action</p>
          <h3>{action.actionType}</h3>
        </div>
        <SignalPill tone={action.riskLevel === "critical" ? "red" : "amber"}>
          {action.riskLevel}
        </SignalPill>
      </div>
      <p className="panel-copy">{action.reason}</p>
      <div className="pill-row">
        {action.requiredCapabilities.map((capability) => (
          <SignalPill key={capability} tone="ink">
            {capability}
          </SignalPill>
        ))}
      </div>
      <pre className="mini-json">{JSON.stringify(action.params, null, 2)}</pre>
      <div className="button-row">
        <button className="primary-button" disabled={busy} onClick={onExecute}>
          {busy ? "Executing..." : "Execute approved action"}
        </button>
        <button className="ghost-button" disabled={busy} onClick={onTamper}>
          {busy ? "Testing..." : "Try tampered execute"}
        </button>
      </div>
    </article>
  );
}
