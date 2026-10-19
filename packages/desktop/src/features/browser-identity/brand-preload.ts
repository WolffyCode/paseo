import { contextBridge } from "electron";

// Runs in Electron's sandbox and is tsc-compiled (not bundled): it may load nothing but "electron".

// Chromium reports its brands as Chromium only; Chrome adds Google Chrome. Google's sites read
// navigator.userAgentData, so the browser lists Google Chrome at Chromium's version, matching
// the Sec-CH-UA headers the main process rewrites. navigator.userAgentData hands out a new
// object on every read, so the patch goes on the prototype.
function addGoogleChromeBrand(): void {
  interface Brand {
    brand: string;
    version: string;
  }
  interface UADataValues {
    brands?: Brand[];
    fullVersionList?: Brand[];
  }
  const brandName = "Google Chrome";
  const uaDataPrototype = (globalThis as { NavigatorUAData?: { prototype: object } })
    .NavigatorUAData?.prototype;
  if (!uaDataPrototype) {
    return;
  }
  const brandsDescriptor = Object.getOwnPropertyDescriptor(uaDataPrototype, "brands");
  const readBrands = brandsDescriptor?.get;
  const prototypeMethods = uaDataPrototype as {
    getHighEntropyValues?: (this: object, hints: string[]) => Promise<UADataValues>;
    toJSON?: (this: object) => UADataValues;
  };
  const readHighEntropyValues = prototypeMethods.getHighEntropyValues;
  const readJson = prototypeMethods.toJSON;
  if (!brandsDescriptor || !readBrands || !readHighEntropyValues || !readJson) {
    return;
  }
  const withGoogleChrome = (brands: readonly Brand[]): Brand[] => {
    const chromium = brands.find((entry) => entry.brand === "Chromium");
    if (!chromium || brands.some((entry) => entry.brand === brandName)) {
      return [...brands];
    }
    return [...brands, { brand: brandName, version: chromium.version }];
  };
  const withGoogleChromeValues = (values: UADataValues): UADataValues => ({
    ...values,
    ...(values.brands ? { brands: withGoogleChrome(values.brands) } : {}),
    ...(values.fullVersionList
      ? { fullVersionList: withGoogleChrome(values.fullVersionList) }
      : {}),
  });
  Object.defineProperty(uaDataPrototype, "brands", {
    ...brandsDescriptor,
    get(this: object) {
      return Object.freeze(withGoogleChrome(readBrands.call(this) as Brand[]));
    },
  });
  Object.defineProperty(uaDataPrototype, "getHighEntropyValues", {
    configurable: true,
    writable: true,
    value: async function getHighEntropyValues(this: object, hints: string[]) {
      return withGoogleChromeValues(await readHighEntropyValues.call(this, hints));
    },
  });
  Object.defineProperty(uaDataPrototype, "toJSON", {
    configurable: true,
    writable: true,
    value: function toJSON(this: object) {
      return withGoogleChromeValues(readJson.call(this));
    },
  });
}

contextBridge.executeInMainWorld({ func: addGoogleChromeBrand });
