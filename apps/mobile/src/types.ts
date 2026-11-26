export type Listing = {
  id: string;
  address: string;
  area: string;
  city: string;
  rent: number;
  sqm: number;
  rooms: number;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  bindingApply: boolean;
  messageApply: boolean;
  objectAdId: string;
  lagenhetId: string;
  annonsId: string;
  refid: string;
  qasaId: string;
};

export type Landlord = {
  id: string;
  name: string;
  acceptsPassword: boolean;
  acceptsCookie: boolean;
  requiresBankid: boolean;
  canCreate: boolean;
  bindingApply: boolean;
  messageApply: boolean;
};

export type Connection = {
  source_id: string;
  status: string;
  username?: string;
  last_login_at?: string | null;
  last_error?: string | null;
  landlord_requires_bankid?: boolean;
};

export type Notice = {
  id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  at?: string | null;
};

export type Entitlement = {
  plan: string;
  status: string;
  source?: string;
  trial?: boolean;
  autoApply?: boolean;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

export type ApplicationRow = {
  id: string;
  listingId?: string;
  status?: string;
  appliedAt?: string;
  note?: string;
  sourceId?: string | null;
};
