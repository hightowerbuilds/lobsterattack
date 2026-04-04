import { useSyncExternalStore } from "react";
import {
  buildObservationRecord,
  buildReviewRecord,
  createSessionFromScenario,
  executeReviewedAction,
  scenarioTemplates,
  type ExecuteResult,
  type ExecutionRecord,
  type ObservationRecord,
  type ReviewRecord,
  type Session,
} from "./hospitality";

type HospitalityState = {
  scenarios: typeof scenarioTemplates;
  currentSessionId: string | null;
  sessions: Record<string, Session>;
  ledger: ExecutionRecord[];
};

const listeners = new Set<() => void>();

let state: HospitalityState = {
  scenarios: scenarioTemplates,
  currentSessionId: null,
  sessions: {},
  ledger: [],
};

function emitChange() {
  listeners.forEach((listener) => listener());
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function updateState(nextState: HospitalityState) {
  state = nextState;
  emitChange();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  return state;
}

export function useHospitalityStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getCurrentSession(currentState: HospitalityState) {
  if (!currentState.currentSessionId) {
    return null;
  }

  return currentState.sessions[currentState.currentSessionId] ?? null;
}

export function getCurrentObservation(currentState: HospitalityState): ObservationRecord | null {
  const session = getCurrentSession(currentState);
  return session ? buildObservationRecord(session) : null;
}

export function getCurrentReview(currentState: HospitalityState): ReviewRecord | null {
  const session = getCurrentSession(currentState);
  return session ? buildReviewRecord(session) : null;
}

export async function startScenarioSession(scenarioId: string) {
  await delay(240);
  const template =
    scenarioTemplates.find((scenario) => scenario.id === scenarioId) ?? scenarioTemplates[0];

  const session = createSessionFromScenario(template);

  updateState({
    ...state,
    currentSessionId: session.sessionId,
    sessions: {
      ...state.sessions,
      [session.sessionId]: session,
    },
  });

  return session;
}

function applyExecutionToSession(session: Session, execution: ExecutionRecord) {
  return {
    ...session,
    executions: [execution, ...session.executions],
  };
}

export async function runExecutionAttempt(
  sessionId: string,
  actionId: string,
  options?: {
    tamper?: boolean;
  },
): Promise<ExecuteResult> {
  await delay(180);
  const session = state.sessions[sessionId];

  if (!session) {
    return {
      status: "rejected",
      trustTier: "execute",
      message: "Execute refused the request.",
      error: "Session not found",
    };
  }

  const action = session.reviewActions.find((candidate) => candidate.actionId === actionId);

  if (!action) {
    return {
      status: "rejected",
      trustTier: "execute",
      message: "Execute refused the request.",
      error: "Action not found",
    };
  }

  const result = executeReviewedAction(
    session,
    actionId,
    options?.tamper ? "tampered-proof" : action.approvalBundle.token,
    options?.tamper
      ? {
          ...action.approvalBundle.approvedParams,
          tampered: true,
        }
      : action.approvalBundle.approvedParams,
  );

  if (result.status === "accepted") {
    updateState({
      ...state,
      sessions: {
        ...state.sessions,
        [session.sessionId]: applyExecutionToSession(session, result.execution),
      },
      ledger: [result.execution, ...state.ledger],
    });
  }

  return result;
}
