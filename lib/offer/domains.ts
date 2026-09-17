// Pure domain helpers for spotting impersonation. No network.

/** Second-level suffixes under which the registrable domain has three labels. */
const MULTI_PART_SUFFIXES = new Set([
  'co.in', 'gov.in', 'nic.in', 'org.in', 'net.in', 'ac.in', 'edu.in', 'res.in', 'firm.in', 'gen.in', 'ind.in',
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk',
  'com.au', 'gov.au', 'com.sg', 'gov.sg', 'co.jp', 'com.br', 'co.za',
]);

const FREE_EMAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'ymail.com', 'outlook.com', 'hotmail.com',
  'live.com', 'msn.com', 'rediffmail.com', 'aol.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com',
  'zoho.com', 'zohomail.in', 'gmx.com', 'mail.com', 'yandex.com',
]);

/** Legitimate places a real job or scheme link may point to besides the organisation's own site. */
const KNOWN_PLATFORMS = new Set([
  'linkedin.com', 'naukri.com', 'indeed.com', 'foundit.in', 'glassdoor.com', 'glassdoor.co.in', 'internshala.com',
  'wellfound.com', 'instahyre.com', 'apna.co', 'shine.com', 'timesjobs.com', 'hirist.tech', 'cutshort.io',
  'myworkdayjobs.com', 'greenhouse.io', 'lever.co', 'smartrecruiters.com', 'successfactors.com', 'taleo.net',
  'ncs.gov.in',
]);

/** Lowercase host without port, `www.` or a trailing dot; undefined when it is not a plausible host. */
export function normaliseHost(input: string): string | undefined {
  let host = input.trim().toLowerCase();
  if (host.includes('@')) host = host.slice(host.lastIndexOf('@') + 1);
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#:]/)[0].replace(/\.$/, '').replace(/^www\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : undefined;
}

/** The part of a host an organisation registers: `careers.amazon.in` → `amazon.in`, `x.pmkisan.gov.in` → `pmkisan.gov.in`. */
export function registrableDomain(host: string): string | undefined {
  const h = normaliseHost(host);
  if (!h) return undefined;
  const labels = h.split('.');
  const take = labels.length >= 3 && MULTI_PART_SUFFIXES.has(labels.slice(-2).join('.')) ? 3 : 2;
  return labels.slice(-take).join('.');
}

/** The name part of a registrable domain: `amazon.in` → `amazon`, `pmkisan.gov.in` → `pmkisan`. */
export function domainName(host: string): string | undefined {
  return registrableDomain(host)?.split('.')[0];
}

export const isGovernmentDomain = (host: string) => {
  const d = registrableDomain(host);
  return !!d && (/\.(gov|nic)\.in$/.test(d) || d === 'gov.in' || d === 'nic.in' || /\.gov$/.test(d));
};

export const isFreeEmailDomain = (host: string) => FREE_EMAIL.has(registrableDomain(host) ?? '');

export const isKnownPlatform = (host: string) => KNOWN_PLATFORMS.has(registrableDomain(host) ?? '');

export const sameOrganisationSite = (host: string, officialDomain: string) =>
  registrableDomain(host) === registrableDomain(officialDomain);

/** Same name on another TLD (`amazon.jobs` for `amazon.com`); large organisations own many of these. */
export const sameNameOtherTld = (host: string, officialDomain: string) => {
  const name = domainName(host);
  return !!name && name === domainName(officialDomain) && !sameOrganisationSite(host, officialDomain);
};

/** Words that do not identify an organisation: "Infosys Limited" and "Amazon India" are Infosys and Amazon. */
const NAME_FILLER = new Set(['the', 'of', 'and', 'ltd', 'limited', 'pvt', 'private', 'inc', 'llp', 'co', 'corp', 'corporation', 'company', 'group', 'india']);

const words = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const nameTokens = (name: string) => words(name).filter((t) => !NAME_FILLER.has(t));

/** Initials keep "India" and drop only joining words: State Bank of India is sbi. */
const initials = (name: string) =>
  words(name)
    .filter((t) => !['the', 'of', 'and'].includes(t))
    .map((t) => t[0])
    .join('');

/**
 * Whether a domain is plausibly the named organisation's own: its name part is the whole name
 * (infosys.com), the initials (sbi.co.in for State Bank of India) or the first words run together
 * (pmkisan.gov.in for PM Kisan Samman Nidhi). A lone first word only counts for one-word names, so
 * "Bank of Baroda" never matches bank.in, and there is never a prefix match, which would accept amazon-careers.com.
 */
export function nameMatchesDomain(name: string, host: string): boolean {
  const domain = domainName(host)?.replace(/-/g, '');
  const tokens = nameTokens(name);
  if (!domain || tokens.length === 0) return false;
  const abbreviation = initials(name);
  if (abbreviation.length >= 2 && domain === abbreviation) return true;
  for (let k = tokens.length === 1 ? 1 : 2; k <= tokens.length; k++) {
    const joined = tokens.slice(0, k).join('');
    if (joined === domain && joined.length >= 3) return true;
  }
  return false;
}

/** Whether two organisation names are the same once filler words are dropped: "Infosys Limited" and "Infosys". */
export const sameOrganisationName = (a: string, b: string) => {
  const x = nameTokens(a).join('');
  return x.length >= 2 && x === nameTokens(b).join('');
};

/** Undo common look-alike substitutions so `amaz0n` and `rnicrosoft` compare equal to the real name. */
const unglyph = (s: string) =>
  s.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/0/g, 'o').replace(/[1l|]/g, 'i').replace(/3/g, 'e').replace(/5/g, 's').replace(/-/g, '');

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** Why a host imitates the official site, or undefined when it does not. */
export function lookalikeReason(host: string, officialDomain: string): string | undefined {
  const h = normaliseHost(host);
  const official = domainName(officialDomain);
  const name = h && domainName(h);
  if (!h || !official || !name) return undefined;
  if (sameOrganisationSite(h, officialDomain) || sameNameOtherTld(h, officialDomain) || isKnownPlatform(h)) return undefined;

  // The official name hidden in a subdomain: amazon.in.job-verify.com
  const subdomains = h.split('.').slice(0, -(registrableDomain(h)!.split('.').length));
  if (official.length >= 3 && subdomains.includes(official)) return `puts "${official}" in front of an unrelated domain`;

  if (official.length >= 4 && name !== official && name.replace(/-/g, '').includes(official)) {
    return `adds words to the official name "${official}"`;
  }
  if (official.length >= 5 && unglyph(name) === unglyph(official)) return `imitates "${official}" with look-alike characters`;
  if (official.length >= 6 && editDistance(name, official) <= 2) return `is a misspelling of "${official}"`;
  return undefined;
}

/** A non-government domain that dresses up as one, like `pmkisan-gov.online`. */
export function posesAsGovernment(host: string): boolean {
  const h = normaliseHost(host);
  if (!h || isGovernmentDomain(h)) return false;
  return h.split(/[.-]/).some((part) => part === 'gov' || part === 'govt');
}
