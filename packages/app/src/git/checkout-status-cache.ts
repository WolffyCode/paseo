import type { QueryClient } from "@tanstack/react-query";
import type { CheckoutStatusResponse, CheckoutStatusUpdate } from "@getpaseo/protocol/messages";
import { checkoutPrStatusQueryKey, checkoutStatusQueryKey } from "@/git/query-keys";
import { expireStaleDiffModeOverrides } from "@/review/store";

export type CheckoutStatusPayload = CheckoutStatusResponse["payload"];
export type CheckoutPrStatusPayload = NonNullable<CheckoutStatusUpdate["payload"]["prStatus"]>;

export interface CheckoutStatusClient {
  getCheckoutStatus: (cwd: string) => Promise<CheckoutStatusPayload>;
}

// Checkout status enters the app through exactly two doors: daemon pushes
// (applyCheckoutStatusUpdateFromEvent) and query fetches (fetchCheckoutStatus). Both run
// the dirty-state reactions, so they hold regardless of which screens are mounted.

export async function fetchCheckoutStatus({
  client,
  serverId,
  cwd,
}: {
  client: CheckoutStatusClient;
  serverId: string;
  cwd: string;
}): Promise<CheckoutStatusPayload> {
  const payload = await client.getCheckoutStatus(cwd);
  expireStaleDiffModeOverrides({ serverId, cwd, isDirty: payload.isGit && payload.isDirty });
  return payload;
}

export function applyCheckoutStatusUpdateFromEvent({
  queryClient,
  serverId,
  message,
}: {
  queryClient: QueryClient;
  serverId: string;
  message: CheckoutStatusUpdate;
}): void {
  const { payload } = message;
  queryClient.setQueryData(checkoutStatusQueryKey(serverId, payload.cwd), payload);
  expireStaleDiffModeOverrides({
    serverId,
    cwd: payload.cwd,
    isDirty: payload.isGit && payload.isDirty,
  });

  const prStatus = payload.prStatus;
  if (!prStatus) {
    return;
  }

  // Keep the workspace PR status cache fresh so the sidebar PR hint reflects pushed updates.
  queryClient.setQueryData(checkoutPrStatusQueryKey(serverId, prStatus.cwd), prStatus);
}
