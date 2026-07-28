// Card id -> component. The ids come from packages/shared/src/shot-cards.json,
// which is the SAME file the API serves to the UI — there is no second registry.
//
// The consistency check below runs at module load: if a card is marked
// `implemented: true` in the shared JSON but has no component here (or vice
// versa), the render fails immediately with a precise message instead of
// silently drawing a fallback for 1,086 frames.

import type { ComponentType } from "react";
import shotCardsDoc from "@remotion-promo-video-pipeline/shared/src/shot-cards.json";

import type { ShotProps } from "../lib/types";
import { BeatCutMoves } from "./beat-cut-moves";
import { CrashZoomPunch } from "./crash-zoom-punch";
import { DeckDealFlyin } from "./deck-deal-flyin";
import { OdometerDigitRoll } from "./odometer-digit-roll";
import { PaperTitleCard } from "./paper-title-card";
import { RowEmbed } from "./row-embed";
import { SpotlightHeroCard } from "./spotlight-hero-card";
import { TypewriterMoves } from "./typewriter-moves";
import { UiToBrandMorph } from "./ui-to-brand-morph";
import { WipeTransitions } from "./wipe-transitions";

export const CARD_COMPONENTS: Record<string, ComponentType<ShotProps>> = {
  "spotlight-hero-card": SpotlightHeroCard,
  "paper-title-card": PaperTitleCard,
  "typewriter-moves": TypewriterMoves,
  "deck-deal-flyin": DeckDealFlyin,
  "row-embed": RowEmbed,
  "crash-zoom-punch": CrashZoomPunch,
  "odometer-digit-roll": OdometerDigitRoll,
  "beat-cut-moves": BeatCutMoves,
  "wipe-transitions": WipeTransitions,
  "ui-to-brand-morph": UiToBrandMorph,
};

interface SharedCard {
  id: string;
  implemented: boolean;
}

const declared = (shotCardsDoc as { cards: SharedCard[] }).cards
  .filter((card) => card.implemented)
  .map((card) => card.id);

const missing = declared.filter((id) => !CARD_COMPONENTS[id]);
const extra = Object.keys(CARD_COMPONENTS).filter((id) => !declared.includes(id));

if (missing.length > 0 || extra.length > 0) {
  throw new Error(
    "Shot-card registry drift between packages/shared/src/shot-cards.json and " +
      "packages/remotion/src/cards/index.ts — " +
      `declared but not implemented: [${missing.join(", ")}]; ` +
      `implemented but not declared: [${extra.join(", ")}]`,
  );
}

/** Fallback for a storyboard that names an unknown card. */
export const DEFAULT_CARD = "paper-title-card";

export function cardComponent(id: string): ComponentType<ShotProps> {
  return CARD_COMPONENTS[id] ?? CARD_COMPONENTS[DEFAULT_CARD];
}
