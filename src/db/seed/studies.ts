/**
 * Study and leg metadata for the demo seed.
 *
 * Questions and responses are NOT here: those live in the CSV files under
 * ./responses/, one file per leg, exactly as a study export would arrive.
 * Panelist records live in ./panelists.json.
 */

export interface LegDef {
  name: string;
  testVariant: string;
  /** CSV file under ./responses/ holding this leg's collected responses. */
  file: string;
}

export interface StudyDef {
  slug: string;
  name: string;
  product: string;
  productVersion: string;
  category: string;
  testCriteria: string;
  description: string;
  targetPanelSize: number;
  /** Dominant sentiment the collected responses produce. */
  expectedOutcome: "LIKE" | "DISLIKE" | "INDIFFERENT";
  legs: LegDef[];
}

/** Northwind Consumer Brands: a fictional consumer goods manufacturer. */
export const STUDIES: StudyDef[] = [
  {
    slug: "citrus-sparkling",
    name: "Sparkling water citrus reformulation",
    product: "Cascade Sparkling Water",
    productVersion: "v3.1 citrus blend",
    category: "Beverages",
    testCriteria:
      "Determine whether the reformulated citrus blend (natural flavor, reduced sodium) outperforms the current production formula and the leading competitor on taste, refreshment, and repurchase intent. Blind, unbranded samples.",
    description:
      "Three-leg blind taste test. Leg 1 is the current production formula as control, leg 2 is the reformulated blend, leg 3 is the leading national competitor.",
    targetPanelSize: 900,
    expectedOutcome: "LIKE",
    legs: [
      { name: "Leg 1: current formula (control)", testVariant: "Formula A - current production", file: "citrus-sparkling-leg1.csv" },
      { name: "Leg 2: reformulated citrus blend", testVariant: "Formula B - reformulated", file: "citrus-sparkling-leg2.csv" },
      { name: "Leg 3: competitor benchmark", testVariant: "Competitor national brand", file: "citrus-sparkling-leg3.csv" },
    ],
  },
  {
    slug: "plant-protein-bar",
    name: "Plant protein bar launch readiness",
    product: "Summit Plant Protein Bar",
    productVersion: "v1.4 cocoa almond",
    category: "Snacks & Nutrition",
    testCriteria:
      "Assess launch readiness of the cocoa almond plant protein bar. Evaluate taste, texture, satiety, perceived healthiness, and price acceptance at a $2.99 shelf price.",
    description:
      "Two-leg test comparing the current cocoa almond formulation against a softer-texture variant developed after early complaints about density.",
    targetPanelSize: 800,
    expectedOutcome: "LIKE",
    legs: [
      { name: "Leg 1: cocoa almond, standard texture", testVariant: "Standard texture", file: "plant-protein-bar-leg1.csv" },
      { name: "Leg 2: cocoa almond, softened texture", testVariant: "Softened texture", file: "plant-protein-bar-leg2.csv" },
    ],
  },
  {
    slug: "laundry-sheets",
    name: "Concentrated laundry sheet concept test",
    product: "PureFold Laundry Detergent Sheets",
    productVersion: "v0.9 pilot",
    category: "Home Care",
    testCriteria:
      "Evaluate the plastic-free concentrated detergent sheet against consumers' current liquid detergent on cleaning performance, dissolving behavior, scent, and willingness to switch.",
    description:
      "Single-leg in-home use test over two weeks. Panelists replaced their normal detergent with the pilot sheets.",
    targetPanelSize: 700,
    expectedOutcome: "DISLIKE",
    legs: [
      { name: "Leg 1: in-home use test", testVariant: "Pilot detergent sheets", file: "laundry-sheets-leg1.csv" },
    ],
  },
  {
    slug: "oat-creamer",
    name: "Oat creamer flavor extension",
    product: "Meadow Oat Coffee Creamer",
    productVersion: "v2.0 flavor extension",
    category: "Dairy Alternatives",
    testCriteria:
      "Test three candidate flavor extensions (vanilla bean, brown sugar cinnamon, unsweetened) for incremental appeal beyond the existing original flavor, measuring taste, mouthfeel in coffee, and sweetness acceptance.",
    description:
      "Three-leg sequential home test. Each leg is one candidate flavor, prepared in the panelist's usual coffee.",
    targetPanelSize: 850,
    expectedOutcome: "INDIFFERENT",
    legs: [
      { name: "Leg 1: vanilla bean", testVariant: "Vanilla bean", file: "oat-creamer-leg1.csv" },
      { name: "Leg 2: brown sugar cinnamon", testVariant: "Brown sugar cinnamon", file: "oat-creamer-leg2.csv" },
      { name: "Leg 3: unsweetened", testVariant: "Unsweetened", file: "oat-creamer-leg3.csv" },
    ],
  },
  {
    slug: "bamboo-paper-towel",
    name: "Bamboo paper towel durability study",
    product: "Everleaf Bamboo Paper Towels",
    productVersion: "v1.2 two-ply",
    category: "Paper & Cleaning",
    testCriteria:
      "Compare the two-ply bamboo paper towel against the consumer's current paper towel on absorbency, wet strength, sheet size adequacy, and value perception at parity pricing.",
    description:
      "Two-leg test: leg 1 uses the standard perforated roll, leg 2 uses the half-sheet perforation intended to reduce waste.",
    targetPanelSize: 750,
    expectedOutcome: "INDIFFERENT",
    legs: [
      { name: "Leg 1: standard sheet perforation", testVariant: "Standard sheets", file: "bamboo-paper-towel-leg1.csv" },
      { name: "Leg 2: half-sheet perforation", testVariant: "Half sheets", file: "bamboo-paper-towel-leg2.csv" },
    ],
  },
];
