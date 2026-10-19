import { isElectronRuntime } from "@/desktop/host";
import { i18n } from "@/i18n/i18next";

/** Throws the user-facing reason this browser context cannot capture the microphone. */
export function assertMicrophoneEnvironment(): void {
  const hasGetUserMedia =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices) &&
    typeof navigator.mediaDevices.getUserMedia === "function";
  if (!hasGetUserMedia) {
    throw new Error(i18n.t("common.errors.microphoneUnsupported"));
  }

  const isSecureContext =
    typeof window === "undefined" ||
    typeof window.isSecureContext !== "boolean" ||
    window.isSecureContext;
  if (isSecureContext) {
    return;
  }

  const currentOrigin =
    typeof window !== "undefined" && window.location ? window.location.origin : "unknown";
  if (!isElectronRuntime()) {
    throw new Error(
      i18n.t("common.errors.microphoneRequiresSecureOrigin", { origin: currentOrigin }),
    );
  }
  // Desktop can report its app origin as insecure while still granting the microphone.
  console.warn(
    "[Microphone] Insecure context reported under Desktop; attempting getUserMedia anyway",
    {
      currentOrigin,
    },
  );
}
