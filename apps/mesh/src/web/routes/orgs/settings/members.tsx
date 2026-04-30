import OrgMembers from "@/web/routes/orgs/members";
import { RequireCapability } from "@/web/components/require-capability";

export default function MembersRoute() {
  return (
    <RequireCapability capability="members:manage" area="members">
      <OrgMembers />
    </RequireCapability>
  );
}
