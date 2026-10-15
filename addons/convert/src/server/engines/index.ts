import type { EngineId } from "../../lib/registry/edges";
import { data } from "./data";
import { ffmpeg } from "./ffmpeg";
import { imagemagick } from "./imagemagick";
import { libreoffice } from "./office";
import { pandoc } from "./pandoc";
import { popplerPng, popplerText } from "./poppler";
import { rsvg } from "./rsvg";
import type { Engine } from "./types";

export const ENGINES: Record<EngineId, Engine> = {
  imagemagick, rsvg, ffmpeg, libreoffice, pandoc, data,
  "poppler-png": popplerPng,
  "poppler-text": popplerText,
};

export const ENGINE_LABEL: Record<EngineId, string> = {
  imagemagick: "image converter", rsvg: "SVG renderer", ffmpeg: "media converter", libreoffice: "document converter",
  pandoc: "document converter", "poppler-png": "PDF renderer", "poppler-text": "PDF text extractor", data: "data converter",
};
