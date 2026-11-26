import { createRoot } from "react-dom/client";
import { AdminCompose, AdminHome, AdminListings, AdminShell, AdminSources, AdminUsers } from "@/components/admin";
import { AdminCases } from "@/components/support-admin";
import { Account } from "@/components/account";
import { BankId } from "@/components/bankid";
import { Connections } from "@/components/connections";
import { Feed } from "@/components/feed";
import { Filters } from "@/components/filters";
import { Inbox } from "@/components/inbox";
import { OfferScreen } from "@/components/offer";
import { ListingScreen } from "@/components/listing-screen";
import { Profile } from "@/components/profile";
import { Shell } from "@/components/shell";
import { Tracker } from "@/components/tracker";
import { Welcome } from "@/components/welcome";
import { Wizard } from "@/components/wizard";
import { StoreProvider } from "@/lib/store";
import { HashRouter, usePathname } from "./router";

function App() {
  const path = usePathname();

  if (path === "/" || path === "") return <Welcome />;
  if (path === "/konto") return <Account />;
  if (path === "/bankid") return <BankId />;
  if (path === "/guide") return <Wizard />;

  if (path === "/admin" || path.startsWith("/admin/")) {
    let page = <AdminHome />;
    if (path.startsWith("/admin/annonser")) page = <AdminListings />;
    else if (path.startsWith("/admin/kallor")) page = <AdminSources />;
    else if (path.startsWith("/admin/anvandare")) page = <AdminUsers />;
    else if (path.startsWith("/admin/utskick")) page = <AdminCompose />;
    else if (path.startsWith("/admin/arenden")) page = <AdminCases />;
    return <AdminShell>{page}</AdminShell>;
  }

  let page = <Feed />;
  if (path === "/filter") page = <Filters />;
  else if (path === "/koll") page = <Tracker />;
  else if (path === "/notiser") page = <Inbox />;
  else if (path === "/profil") page = <Profile />;
  else if (path === "/kopplingar") page = <Connections />;
  else if (path === "/bostad") page = <ListingScreen />;
  else if (path === "/erbjudande") page = <OfferScreen />;

  return <Shell>{page}</Shell>;
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <HashRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </HashRouter>,
  );
}
