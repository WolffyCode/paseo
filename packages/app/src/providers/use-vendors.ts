import { useCallback, useMemo, useState } from "react";
import type { Vendor } from "@getpaseo/protocol/provider-config";
import { useDaemonConfig } from "@/hooks/use-daemon-config";

export type VendorCli = "claude" | "codex";

export interface UseVendorsResult {
  selectedCli: VendorCli;
  setSelectedCli: (cli: VendorCli) => void;
  vendorsForSelectedCli: Vendor[];
  vendorCountByCli: Record<VendorCli, number>;
  deleteVendor: (cli: VendorCli, vendorId: string) => Promise<void>;
  upsertVendor: (cli: VendorCli, vendor: Vendor) => Promise<void>;
  isWritable: boolean;
}

export function useVendors(serverId: string): UseVendorsResult {
  const { config, patchConfig } = useDaemonConfig(serverId);
  const [selectedCli, setSelectedCli] = useState<VendorCli>("claude");

  const claudeVendors = useMemo<Vendor[]>(
    () => config?.vendors?.claude ?? [],
    [config?.vendors?.claude],
  );
  const codexVendors = useMemo<Vendor[]>(
    () => config?.vendors?.codex ?? [],
    [config?.vendors?.codex],
  );

  const vendorsForSelectedCli = useMemo<Vendor[]>(
    () => (selectedCli === "claude" ? claudeVendors : codexVendors),
    [selectedCli, claudeVendors, codexVendors],
  );

  const vendorCountByCli = useMemo<Record<VendorCli, number>>(
    () => ({
      claude: claudeVendors.length,
      codex: codexVendors.length,
    }),
    [claudeVendors.length, codexVendors.length],
  );

  const deleteVendor = useCallback(
    async (cli: VendorCli, vendorId: string) => {
      const current = cli === "claude" ? claudeVendors : codexVendors;
      const next = current.filter((v) => v.id !== vendorId);
      await patchConfig({ vendors: { [cli]: next } });
    },
    [claudeVendors, codexVendors, patchConfig],
  );

  const upsertVendor = useCallback(
    async (cli: VendorCli, vendor: Vendor) => {
      const current = cli === "claude" ? claudeVendors : codexVendors;
      const idx = current.findIndex((v) => v.id === vendor.id);
      const next =
        idx >= 0 ? current.map((v, i) => (i === idx ? vendor : v)) : [...current, vendor];
      await patchConfig({ vendors: { [cli]: next } });
    },
    [claudeVendors, codexVendors, patchConfig],
  );

  const isWritable = config !== null;

  return {
    selectedCli,
    setSelectedCli,
    vendorsForSelectedCli,
    vendorCountByCli,
    deleteVendor,
    upsertVendor,
    isWritable,
  };
}
