'use client';

import { useEffect, useReducer } from 'react';
import { isFinalEvent, type AuditEvent, type Dossier, type EngineId, type Evidence, type Stage } from '@/lib/shared/types';

export interface AuditState {
  stage?: Stage;
  evidence: Evidence[];
  credits: number;
  maxCredits?: number;
  creditLog: { engine: EngineId; cached: boolean }[];
  shortCircuit?: { afterTier: number; creditsSaved: number };
  notices: { id: number; code: string; message: string }[];
  dossier?: Dossier;
  fatal?: { code: string; message: string };
}

const initial: AuditState = { evidence: [], credits: 0, creditLog: [], notices: [] };

function reducer(state: AuditState, e: AuditEvent): AuditState {
  switch (e.type) {
    case 'stage':
      return { ...state, stage: e.data.stage };
    case 'evidence':
      return { ...state, evidence: [...state.evidence, e.data] };
    case 'credit':
      return {
        ...state,
        credits: e.data.totalCredits,
        maxCredits: e.data.maxCredits,
        creditLog: [...state.creditLog, { engine: e.data.engine, cached: e.data.cached }],
      };
    case 'short_circuit':
      return { ...state, shortCircuit: e.data };
    case 'signal':
      return state;
    case 'dossier':
      return { ...state, dossier: e.data, evidence: e.data.evidence, credits: e.data.metrics.credits, maxCredits: e.data.metrics.maxCredits };
    case 'error':
      return e.data.recoverable
        ? { ...state, notices: [...state.notices, { id: state.notices.length, code: e.data.code, message: e.data.message }] }
        : { ...state, fatal: { code: e.data.code, message: e.data.message } };
  }
}

const EVENT_TYPES: AuditEvent['type'][] = ['stage', 'evidence', 'signal', 'credit', 'short_circuit', 'dossier', 'error'];

/** Follows an audit over Server-Sent Events until the dossier or a fatal error arrives. */
export function useAuditStream(id: string): AuditState {
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    const es = new EventSource(`/api/investigate/${id}/stream`);
    let finished = false;
    for (const type of EVENT_TYPES) {
      es.addEventListener(type, (msg) => {
        const event = { type, data: JSON.parse((msg as MessageEvent).data) } as AuditEvent;
        dispatch(event);
        if (isFinalEvent(event)) {
          finished = true;
          es.close();
        }
      });
    }
    es.onerror = () => {
      if (finished) return;
      if (es.readyState === EventSource.CLOSED) {
        dispatch({ type: 'error', data: { code: 'STREAM_LOST', message: 'Lost connection to the audit.', recoverable: false } });
      }
    };
    return () => es.close();
  }, [id]);

  return state;
}
