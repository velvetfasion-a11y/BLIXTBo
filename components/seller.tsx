import { COMPANY_NAME, ORG_NR, SUPPORT_EMAIL } from "@/lib/company";

export function SellerIdentity() {
  return (
    <>
      <p>Blixtbo drivs av {COMPANY_NAME}.</p>
      {ORG_NR ? <p>Org.nr {ORG_NR}</p> : null}
      <p>
        E-post:{" "}
        <a className="font-medium text-ink" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
      </p>
      <p>
        Webbplats:{" "}
        <a className="font-medium text-ink" href="https://blixtbo.se">
          blixtbo.se
        </a>
      </p>
    </>
  );
}
