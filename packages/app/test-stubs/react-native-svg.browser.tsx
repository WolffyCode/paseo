import * as React from "react";

type SvgElementProps = Record<string, unknown> & { children?: React.ReactNode };

function createSvgElement(tagName: string) {
  return function SvgElement({ children, ...props }: SvgElementProps) {
    return React.createElement(tagName, props, children);
  };
}

const Svg = createSvgElement("svg");

export default Svg;
export const Circle = createSvgElement("circle");
export const ClipPath = createSvgElement("clipPath");
export const Defs = createSvgElement("defs");
export const Ellipse = createSvgElement("ellipse");
export const G = createSvgElement("g");
export const Line = createSvgElement("line");
export const Mask = createSvgElement("mask");
export const Path = createSvgElement("path");
export const Polygon = createSvgElement("polygon");
export const Polyline = createSvgElement("polyline");
export const Rect = createSvgElement("rect");
export const Stop = createSvgElement("stop");
export const Symbol = createSvgElement("symbol");
export const Text = createSvgElement("text");
export const TSpan = createSvgElement("tspan");
export const Use = createSvgElement("use");

export function SvgXml({ xml }: { xml: string }) {
  return React.createElement("svg", { dangerouslySetInnerHTML: { __html: xml } });
}
