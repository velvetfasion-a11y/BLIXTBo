export type DocKey = "contract" | "payslips" | "personbevis";

export type Requirement = DocKey | "letter";

export type EmploymentType =
  | ""
  | "tillsvidare"
  | "visstid"
  | "provanstallning"
  | "foretag"
  | "student"
  | "pension";

export type HousingType =
  | ""
  | "forstahand"
  | "andrahand"
  | "inneboende"
  | "foraldrar"
  | "annat";

export type DocumentFile = {
  name: string;
  addedAt: string;
};

export type Profile = {
  occupation: string;
  employer: string;
  employmentType: EmploymentType;
  monthlyIncome: number | null;
  adults: number;
  children: number;
  housingType: HousingType;
  currentCity: string;
  letter: string;
  phone: string;
  documents: Record<DocKey, DocumentFile | null>;
};

export type User = {
  name: string;
  email: string;
  method: "google" | "apple" | "email";
  demo: boolean;
  createdAt: string;
  profile: Profile;
};

export type Filters = {
  areas: string[];
  maxRent: number;
  rooms: "any" | "1" | "2" | "3" | "4" | "5+";
  minSqm: number;
  minFloor: number;
  moveIn: string;
};

export type Listing = {
  id: string;
  address: string;
  area: string;
  city: string;
  rent: number;
  sqm: number;
  rooms: number;
  floor: number;
  floors: number;
  moveIn: string;
  ageMinutes: number;
  deadlineHours: number | null;
  publishedAt: string;
  deadlineAt: string | null;
  sourceId: string;
  photos: string[];
  title: string;
  description: string;
  near: string;
  features: string[];
  requires: Requirement[];
  incomeMultiple: number;
  active: boolean;
};

export type SourceHealth = "ok" | "delayed";

export type Source = {
  id: string;
  name: string;
  kind: string;
  blurb: string;
  syncMin: number;
  health: SourceHealth;
  enabled: boolean;
  requiresBankId: boolean;
  applicationLimit?: number | null;
  plusLimit?: number | null;
  plusPriceKr?: number | null;
  plusUrl?: string;
};

export type Connection = {
  sourceId: string;
  status: "connected" | "none";
  email?: string;
  connectedAt?: string;
  bankIdSession?: boolean;
};

export type AppStatus = "skickad" | "visning" | "erbjuden" | "accepterad" | "avbojd" | "kontrakt" | "nekad" | "aterkallad";

export type WaitingSpot = {
  listingId: string;
  sourceId: string;
  savedAt: string;
};

export type Application = {
  id: string;
  listingId: string;
  status: AppStatus;
  appliedAt: string;
  eventAt: string;
  position: number;
  minutesAfterPublish: number;
  note: string;
  viewingAt?: string;
  viewingBooked?: boolean;
  respondBy?: string;
  contractStart?: string;
  depositKr?: number;
  nextSteps?: string[];
  affectsQueue?: boolean;
};

export type Queue = {
  id: string;
  sourceId: string;
  name: string;
  city: string;
  days: number | null;
  points: number | null;
  since: string;
  feeKr: number | null;
  feeDue: string | null;
  renewDue: string | null;
  lastRenewed?: string;
  nextRenewal?: string;
  block?: "fee" | "bankid" | null;
};

export type NoticeKind = "listing" | "status" | "fee" | "queue" | "system";

export type Notice = {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  at: string;
  read: boolean;
  href: string;
  deadlineAt?: string;
};

export type Prefs = {
  newListings: boolean;
  fees: boolean;
  status: boolean;
  keepQueues: boolean;
};

export type DirectoryUser = {
  id: string;
  name: string;
  email: string;
  city: string;
  completeness: number;
  applications: number;
  queues: number;
  queueWarning: boolean;
  joined: string;
  missing: string;
};

export type Push = {
  id: string;
  title: string;
  body: string;
  segment: string;
  sentAt: string;
  recipients: number;
};

export type Persisted = {
  version: 1;
  user: User | null;
  filters: Filters;
  connections: Record<string, Connection>;
  applications: Application[];
  waiting: WaitingSpot[];
  queues: Queue[];
  notifications: Notice[];
  dismissed: string[];
  listings: Listing[];
  sources: Source[];
  pushes: Push[];
  directory: DirectoryUser[];
  prefs: Prefs;
};
