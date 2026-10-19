import Svg, { ClipPath, Defs, Ellipse, G, LinearGradient, Path, Stop } from "react-native-svg";
import { withUnistyles } from "react-native-unistyles";
import { PaseoLogo } from "@/components/icons/paseo-logo";
import { webUiColorProps } from "./theme";

const ThemedPaseoLogo = withUnistyles(PaseoLogo);
const productLogoMapping = webUiColorProps("toolbarText");
const PRODUCT_LOGO_SIZE = 24;

/** The product logo cr-toolbar and cr-drawer put before the page title, where Chrome's is. */
export function WebUiProductLogo() {
  return <ThemedPaseoLogo size={PRODUCT_LOGO_SIZE} uniProps={productLogoMapping} />;
}

interface WebUiIconDefinition {
  viewBox: string;
  d: string;
}

/**
 * Icons of Chrome's WebUI pages: cr_elements' default (non-rounded) iconset and the
 * extensions page's own, drawn at the size the page uses.
 */
const WEBUI_ICONS = {
  search: {
    viewBox: "0 0 24 24",
    d: "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
  },
  cancelFilled: {
    viewBox: "0 0 24 24",
    d: "M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z",
  },
  menu: {
    viewBox: "0 0 20 20",
    d: "M2 4h16v2H2zM2 9h16v2H2zM2 14h16v2H2z",
  },
  openInNew: {
    viewBox: "0 -960 960 960",
    d: "M216-144q-29.7 0-50.85-21.15Q144-186.3 144-216v-528q0-29.7 21.15-50.85Q186.3-816 216-816h264v72H216v528h528v-264h72v264q0 29.7-21.15 50.85Q773.7-144 744-144H216Zm171-192-51-51 357-357H576v-72h240v240h-72v-117L387-336Z",
  },
  chevronRight: {
    viewBox: "0 0 24 24",
    d: "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
  },
  arrowBack: {
    viewBox: "0 0 24 24",
    d: "m7.824 13 5.602 5.602L12 20l-8-8 8-8 1.426 1.398L7.824 11H20v2Zm0 0",
  },
  myExtensions: {
    viewBox: "0 -960 960 960",
    d: "M216-135.869q-33.287 0-56.709-23.422-23.422-23.422-23.422-56.709v-172.304q37.609-2 63.218-28.424 25.608-26.424 25.608-63.272t-25.608-63.272q-25.609-26.424-63.218-28.424V-744q0-33.287 23.422-56.709 23.422-23.422 56.709-23.422h161.065q2.631-40.956 31.96-69.315 29.329-28.359 70.75-28.359t70.975 28.199q29.554 28.199 32.185 69.475H744q33.287 0 56.709 23.422 23.422 23.422 23.422 56.709v161.065q40.956 2.631 69.315 31.96 28.359 29.329 28.359 70.75t-28.199 70.975q-28.199 29.554-69.475 32.185V-216q0 33.287-23.422 56.709-23.422 23.422-56.709 23.422H216Zm2.87-83.001h522.26v-522.26H218.87v108.652q42.13 22.63 65.597 63.772 23.468 41.141 23.468 88.706 0 49.01-23.468 90.168Q261-348.674 218.87-327.283v108.413ZM480-480Z",
  },
  // Customize Chrome's own icons (side_panel/customize_chrome/icons/reset.svg and
  // lightbulb_outline.svg).
  reset: {
    viewBox: "0 0 16 16",
    d: "m7.898 12.5 1.704-1.7-1.684-1.698-.566.566.699.715c-.324 0-.637-.055-.942-.168a2.168 2.168 0 0 1-.808-.516 2.355 2.355 0 0 1-.516-.773A2.359 2.359 0 0 1 5.602 8c0-.18.015-.352.046-.516.036-.168.086-.328.153-.484l-.586-.582a3.419 3.419 0 0 0-.305.758A3 3 0 0 0 4.8 8c0 .422.079.832.243 1.227.16.394.39.738.691 1.039.32.324.68.558 1.075.71.394.149.812.223 1.257.223l-.734.735Zm2.887-2.918c.133-.242.235-.496.305-.758A3 3 0 0 0 11.2 8c0-.422-.083-.832-.25-1.227a3.185 3.185 0 0 0-.7-1.039 2.916 2.916 0 0 0-1.082-.691 3.376 3.376 0 0 0-1.27-.211l.77-.766-.566-.566-1.704 1.7 1.704 1.698.566-.566-.734-.73c.343 0 .664.054.957.164.296.113.566.289.808.535.223.222.395.48.516.773.125.297.183.606.183.926 0 .18-.015.352-.046.516a2.585 2.585 0 0 1-.153.484ZM8 14.398a6.192 6.192 0 0 1-2.484-.5 6.366 6.366 0 0 1-2.04-1.375 6.366 6.366 0 0 1-1.374-2.039A6.192 6.192 0 0 1 1.602 8c0-.89.164-1.719.5-2.492.332-.774.789-1.45 1.375-2.031a6.366 6.366 0 0 1 2.039-1.375A6.192 6.192 0 0 1 8 1.602c.89 0 1.719.164 2.492.5.774.332 1.45.789 2.031 1.375a6.375 6.375 0 0 1 1.375 2.03c.336.774.5 1.602.5 2.493 0 .879-.164 1.707-.5 2.484a6.366 6.366 0 0 1-1.375 2.04 6.375 6.375 0 0 1-2.03 1.374c-.774.336-1.602.5-2.493.5ZM8 13.2c1.445 0 2.672-.504 3.684-1.515 1.011-1.012 1.515-2.239 1.515-3.684 0-1.445-.504-2.672-1.515-3.684C10.672 3.305 9.445 2.801 8 2.801c-1.445 0-2.672.504-3.684 1.515C3.305 5.328 2.801 6.555 2.801 8c0 1.445.504 2.672 1.515 3.684C5.328 12.695 6.555 13.199 8 13.199ZM8 8Zm0 0",
  },
  lightbulb: {
    viewBox: "0 0 24 24",
    d: "M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z",
  },
  // chrome://downloads (downloads-spec §7.2): cr:more-vert and the page's own link, folder and
  // clear icons.
  moreVert: {
    viewBox: "0 0 24 24",
    d: "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
  },
  link: {
    viewBox: "0 0 24 24",
    d: "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z",
  },
  folderOpen: {
    viewBox: "0 0 24 24",
    d: "M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z",
  },
  clear: {
    viewBox: "0 0 24 24",
    d: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  },
  draftFilled: {
    viewBox: "0 0 24 24",
    d: "M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z",
  },
} as const satisfies Record<string, WebUiIconDefinition>;

export type WebUiIconName = keyof typeof WEBUI_ICONS;

export function WebUiIcon({
  name,
  size,
  color,
}: {
  name: WebUiIconName;
  size: number;
  color: string;
}) {
  const icon: WebUiIconDefinition = WEBUI_ICONS[name];
  return (
    <Svg width={size} height={size} viewBox={icon.viewBox}>
      <Path d={icon.d} fill={color} />
    </Svg>
  );
}

const WEB_STORE_CARD =
  "M172 28H20v121.63c0 5.72 4.64 10.37 10.37 10.37h131.27c5.72 0 10.37-4.64 10.37-10.37V28z";

/** The Chrome Web Store's multicolor icon (extensions-icons:web_store-custom). */
export function ChromeWebStoreIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 192 192">
      <Defs>
        <ClipPath id="webStoreCard">
          <Path d={WEB_STORE_CARD} />
        </ClipPath>
        <LinearGradient
          id="webStoreRed"
          x1="39.161"
          x2="152.841"
          y1="125.013"
          y2="125.013"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#d93025" />
          <Stop offset="1" stopColor="#ea4335" />
        </LinearGradient>
        <LinearGradient
          id="webStoreGreen"
          x1="-3.897"
          x2="109.806"
          y1="36.608"
          y2="36.608"
          gradientTransform="rotate(-120 100 93.002)"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#1e8e3e" />
          <Stop offset="1" stopColor="#34a853" />
        </LinearGradient>
        <LinearGradient
          id="webStoreYellow"
          x1="96.791"
          x2="210.494"
          y1="8.387"
          y2="8.387"
          gradientTransform="rotate(120 88.856 76)"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#fbbc04" />
          <Stop offset="1" stopColor="#fcc934" />
        </LinearGradient>
      </Defs>
      <Path fill="#F1F3F4" d={WEB_STORE_CARD} />
      <Path fill="#E8EAED" d="M20 28h152v66.35H20z" />
      <Path
        fill="#FFF"
        d="M113.27 56.34H78.73c-3.82 0-6.91-3.09-6.91-6.91 0-3.82 3.09-6.91 6.91-6.91h34.54c3.82 0 6.91 3.09 6.91 6.91 0 3.81-3.09 6.91-6.91 6.91z"
      />
      <G clipPath="url(#webStoreCard)">
        <Path
          fill="url(#webStoreRed)"
          d="m39.16 116.8 9.05 27.61 19.38 21.63L96 116.81l56.84-.01C141.49 97.18 120.29 83.99 96 83.99c-24.29 0-45.49 13.19-56.84 32.81z"
        />
        <Path
          fill="url(#webStoreGreen)"
          d="m95.99 215.28 19.38-21.64 9.04-27.6H67.58L39.16 116.8c-11.31 19.64-12.14 44.61.01 65.65 12.14 21.04 34.17 32.81 56.82 32.83z"
        />
        <Path
          fill="url(#webStoreYellow)"
          d="M152.84 116.81H96l28.42 49.23L96 215.28c22.66-.02 44.69-11.79 56.83-32.83 12.15-21.04 11.32-46 .01-65.64z"
        />
        <Ellipse cx="96" cy="149.63" fill="#F1F3F4" rx="32.81" ry="32.82" />
        <Ellipse cx="96" cy="149.63" fill="#1A73E8" rx="26.66" ry="26.67" />
      </G>
    </Svg>
  );
}

// chrome/browser/resources/downloads/images/no_downloads.svg, 237 × 289.
const NO_DOWNLOADS_PATH =
  "M162.632 77.011c3.31-5.735 10.656-7.693 16.379-4.389l51.978 30.01c5.735 3.31 7.693 10.656 4.389 16.379l-30.01 51.978c-3.31 5.735-10.656 7.693-16.379 4.389l-51.978-30.01c-5.735-3.31-7.693-10.656-4.389-16.379l30.01-51.978zm3.723 44.885 3.08 17.998 24.669-10.06 4.186 34.748-56.58-32.667 24.645-10.02zm-103.23-7.316L5.44 145.252c-4.532 2.41-6.269 8.09-3.859 12.623l30.672 57.686c2.41 4.532 8.09 6.269 12.623 3.859l57.686-30.672c4.532-2.41 6.269-8.09 3.859-12.623L75.748 118.44c-2.41-4.532-8.09-6.269-12.623-3.859zm-15.52 86.4c-2.623 1.395-5.91.39-7.304-2.233l-10.14-19.071c-6.993-13.152-1.988-29.523 11.163-36.516 13.152-6.992 29.523-1.987 36.516 11.164l10.14 19.072c1.395 2.622.39 5.909-2.233 7.303l-11.125 5.915-8.45-15.893 7.946-4.225-4.225-7.946c-4.669-8.781-15.563-12.112-24.343-7.443-8.781 4.669-12.112 15.563-7.443 24.343l4.225 7.947 7.947-4.225 8.45 15.893-11.125 5.915zM69.311.145c-4.671-.824-9.108 2.232-9.91 6.782L47.69 73.1c-.803 4.55 2.32 8.939 6.992 9.762l51.007 8.994c4.671.824 9.15-2.225 9.952-6.775l8.752-49.634-21.106-29.31L69.311.145zm24.704 34.819 4.168-23.636 19.468 27.803-23.636-4.167zm74.63 175.393 11.988 16.163-11.817 2.084-11.99-16.164-8.862 1.563 11.988 16.164-11.817 2.084-11.99-16.164-8.862 1.563 11.989 16.164-11.818 2.083-11.99-16.163-2.954.52c-5.14.907-8.147 5.378-7.3 10.427l8.856 50.225c.889 5.04 5.286 8.207 10.426 7.3l64.998-11.46c5.14-.907 8.189-5.386 7.3-10.427l-10.419-59.088-17.726 3.126z";
const NO_DOWNLOADS_WIDTH = 237;
const NO_DOWNLOADS_HEIGHT = 289;
// The illustration is gray in both themes (manager.css).
const NO_DOWNLOADS_COLOR = "#9AA0A6";

/** chrome://downloads' empty-state illustration, scaled to `height`. */
export function NoDownloadsIllustration({ height }: { height: number }) {
  const width = (height * NO_DOWNLOADS_WIDTH) / NO_DOWNLOADS_HEIGHT;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${NO_DOWNLOADS_WIDTH} ${NO_DOWNLOADS_HEIGHT}`}>
      <Path d={NO_DOWNLOADS_PATH} fill={NO_DOWNLOADS_COLOR} fillRule="evenodd" />
    </Svg>
  );
}
