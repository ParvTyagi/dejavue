'use client';

/** What the audit page can show before the dossier arrives: the claim and media previews. */
export interface AuditIntro {
  claim: string;
  place?: string;
  kind: 'image' | 'video';
  previews: string[];
}

const key = (id: string) => `dejavue:audit:${id}`;

export function saveAuditIntro(id: string, intro: AuditIntro) {
  try {
    sessionStorage.setItem(key(id), JSON.stringify(intro));
  } catch {
    // Storage can be unavailable (private mode); the page still works without it.
  }
}

export function loadAuditIntro(id: string): AuditIntro | undefined {
  try {
    const raw = sessionStorage.getItem(key(id));
    return raw ? (JSON.parse(raw) as AuditIntro) : undefined;
  } catch {
    return undefined;
  }
}
