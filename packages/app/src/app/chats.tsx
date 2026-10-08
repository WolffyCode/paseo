import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { ChatsScreen } from "@/chats/screen";

export default function ChatsRoute() {
  return (
    <HostRouteBootstrapBoundary>
      <ChatsScreen />
    </HostRouteBootstrapBoundary>
  );
}
