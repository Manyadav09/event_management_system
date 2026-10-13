import WorkspaceClient, { type Workspace } from "./workspace-client";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const workspace = await getWorkspace();
  const initialData = JSON.parse(JSON.stringify(workspace)) as Workspace;
  return <WorkspaceClient initialData={initialData} />;
}
