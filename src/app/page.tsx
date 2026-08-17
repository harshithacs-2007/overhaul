import { WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import { RetrofitProvider } from "@/components/retrofit/RetrofitProvider";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

export default function HomePage() {
  return (
    <WorkspaceProvider>
      <RetrofitProvider>
        <WorkspaceShell />
      </RetrofitProvider>
    </WorkspaceProvider>
  );
}
