'use client';

import { useEffect, useReducer, useState } from 'react';
import type { OfferDossier } from '@/lib/offer/types';
import { isFinalEvent, isOfferDossier, type AuditEvent, type Dossier, type EngineId, type Evidence, type Stage } from '@/lib/shared/types';

export interface AuditState {
  /** Known from the first stage event, or from the finished result. */
  kind?: 'media' | 'offer';
  stage?: Stage;
  evidence: Evidence[];
  credits: number;
  maxCredits?: number;
  creditLog: { engine: EngineId; cached: boolean }[];
  shortCircuit?: { afterTier: number; creditsSaved: number };
  notices: { id: number; code: string; message: string }[];
  dossier?: Dossier;
  offerDossier?: OfferDossier;
  fatal?: { code: string; message: string };
}

const OFFER_STAGE_IDS = new Set<Stage>(['read', 'identity', 'contacts', 'offer']);

const initial: AuditState = { evidence: [], credits: 0, creditLog: [], notices: [] };

function reducer(state: AuditState, e: AuditEvent): AuditState {
  switch (e.type) {
    case 'stage':
      return { ...state, stage: e.data.stage, kind: OFFER_STAGE_IDS.has(e.data.stage) ? 'offer' : (state.kind ?? 'media') };
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
    case 'dossier': {
      const done = { evidence: e.data.evidence, credits: e.data.metrics.credits, maxCredits: e.data.metrics.maxCredits };
      return isOfferDossier(e.data) ? { ...state, ...done, kind: 'offer', offerDossier: e.data } : { ...state, ...done, kind: 'media', dossier: e.data };
    }
    case 'error':
      return e.data.recoverable
        ? { ...state, notices: [...state.notices, { id: state.notices.length, code: e.data.code, message: e.data.message }] }
        : { ...state, fatal: { code: e.data.code, message: e.data.message } };
  }
}

const EVENT_TYPES: AuditEvent['type'][] = ['stage', 'evidence', 'signal', 'credit', 'short_circuit', 'dossier', 'error'];

/** Follows an audit over Server-Sent Events until the dossier or a fatal error arrives. */
export function useAuditStream(id: string, initialEvents: AuditEvent[] = []): AuditState {
  const [state, dispatch] = useReducer(reducer, initialEvents, (events) => events.reduce(reducer, initial));
  // Read once: the server's snapshot seeds the state, and the stream continues after it.
  const [snapshot] = useState(() => ({ count: initialEvents.length, finished: initialEvents.some(isFinalEvent) }));

  useEffect(() => {
    if (snapshot.finished) return;
    const es = new EventSource(`/api/investigate/${id}/stream?from=${snapshot.count}`);
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
  }, [id, snapshot]);

  return state;
}
