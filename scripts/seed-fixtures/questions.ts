/**
 * Question banks and answer pools used ONLY to generate the response CSVs under
 * src/db/seed/responses/. Generation time only: the app reads the CSVs, never this.
 *
 * Every answer is invented. Pools are keyed by the sentiment the answer conveys so
 * the generator can hit a target overall outcome per study, and each pool mixes
 * short, medium, and long answers the way real verbatims do.
 */

export type Sentiment = "LIKE" | "DISLIKE" | "INDIFFERENT";

export interface QuestionDef {
  text: string;
  kind: "open" | "yesno";
  /** Probability a panelist skips this question (blank rows are normal in exports). */
  skipRate?: number;
  answers: Record<Sentiment, string[]>;
}

const YES: string[] = ["Yes", "Yes.", "Yes, definitely", "Yes I would", "Absolutely", "Yes - already planning to"];
const NO: string[] = ["No", "No.", "No, I would not", "Definitely not", "No thanks", "No, I'll stick with my usual"];
const MAYBE: string[] = ["Maybe", "Not sure", "It depends on the price", "Possibly", "Hard to say", "Only if it were on sale"];

const yesNo = (text: string, skipRate = 0.02): QuestionDef => ({
  text,
  kind: "yesno",
  skipRate,
  answers: { LIKE: YES, DISLIKE: NO, INDIFFERENT: MAYBE },
});

// ---------------------------------------------------------------------------
// Study 1: Sparkling water citrus reformulation
// ---------------------------------------------------------------------------
export const CITRUS_SPARKLING: QuestionDef[] = [
  {
    text: "What was your first impression of the sample you just tasted?",
    kind: "open",
    answers: {
      LIKE: [
        "Really crisp and clean.",
        "Bright citrus, very refreshing.",
        "Loved it right away.",
        "My first thought was that it actually tastes like real fruit instead of a candy version of it. The carbonation is fine and it does not burn the back of my throat.",
        "Immediately better than what I usually drink. There is a genuine lime note up front and the finish is clean, no lingering sweetness.",
        "Very pleasant. I was expecting something syrupy given the color, and instead it was light and dry, which is exactly what I want in a sparkling water. The bubbles are small and last, and the citrus reads as fresh rather than perfumed.",
      ],
      DISLIKE: [
        "Way too sweet.",
        "Tastes artificial.",
        "Flat and metallic.",
        "First impression was not good. There is a chemical citrus smell before you even drink it, and the taste follows through on that unfortunately.",
        "It reminded me of cleaning product, honestly. The citrus is harsh and there is a bitter edge underneath that I could not get past even after a few sips.",
        "My honest first impression was disappointment. The carbonation was aggressive and sharp, and behind it was a strange saline taste I associate with cheap seltzer. I would not have guessed this was meant to be a premium product.",
      ],
      INDIFFERENT: [
        "It was fine.",
        "Tastes like seltzer.",
        "Nothing stood out.",
        "First impression was neutral. It is a perfectly acceptable sparkling water and it tastes like most of the other ones I have had.",
        "No real reaction either way. There is a faint citrus note, the bubbles are normal, and that is about all I noticed.",
        "It is fine. I drank the whole sample without complaint but I also could not tell you what distinguished it from the store brand I buy. Pleasant enough, forgettable.",
      ],
    },
  },
  {
    text: "How would you describe the aftertaste?",
    kind: "open",
    skipRate: 0.05,
    answers: {
      LIKE: [
        "Clean, no aftertaste.",
        "Nice and dry at the finish.",
        "Barely any aftertaste, which I appreciate.",
        "The finish is the best part. It disappears cleanly instead of leaving a film in your mouth like a lot of flavored waters do.",
      ],
      DISLIKE: [
        "Bitter aftertaste.",
        "Lingering artificial sweetener taste.",
        "Chemical, stays with you.",
        "The aftertaste is the dealbreaker. It has that sharp fake-sweet note that sits on your tongue for a good twenty minutes afterward.",
        "Unpleasant. Slightly soapy, and it made me want to drink actual water to clear it out.",
      ],
      INDIFFERENT: [
        "Mild aftertaste.",
        "Not much either way.",
        "Normal for a seltzer.",
        "There is a slight aftertaste but nothing offensive. It fades in a minute or so and I did not think much about it.",
      ],
    },
  },
  yesNo("Would you purchase this product at your regular store?"),
  {
    text: "What, if anything, would you change about this product?",
    kind: "open",
    skipRate: 0.12,
    answers: {
      LIKE: [
        "Nothing, honestly.",
        "Maybe a bigger can size.",
        "I would not change the liquid at all. If anything I'd offer a multipack, because one can is not enough.",
        "Only suggestion is packaging - the can design is forgettable compared to how good the drink is.",
      ],
      DISLIKE: [
        "Cut the sweetener entirely.",
        "Start over with the flavor.",
        "Less carbonation and much less sweetness. Right now it is trying to be a soda and failing at being a sparkling water.",
        "Fix the aftertaste, that is the whole problem. The base is fine but whatever is providing the sweetness needs to go.",
      ],
      INDIFFERENT: [
        "More citrus maybe.",
        "Nothing comes to mind.",
        "Slightly stronger flavor would help it stand out, but it is fine as is.",
      ],
    },
  },
  yesNo("Did the product meet the expectations set by the description you were given?", 0.06),
];

// ---------------------------------------------------------------------------
// Study 2: Plant protein bar
// ---------------------------------------------------------------------------
export const PLANT_PROTEIN_BAR: QuestionDef[] = [
  {
    text: "Describe the taste and texture of the bar.",
    kind: "open",
    answers: {
      LIKE: [
        "Chewy and rich, really good.",
        "Tastes like a brownie, not chalk.",
        "Great cocoa flavor and the almond pieces give it a nice crunch.",
        "The texture is exactly right for me - dense enough to feel substantial but not so hard that it hurts to chew. Real cocoa flavor rather than the fake protein-powder sweetness.",
        "Genuinely impressed. Most plant bars I have tried are gritty and taste like sand, and this one is smooth with actual chocolate character. The almonds are toasted properly, which adds a lot.",
      ],
      DISLIKE: [
        "Dry and chalky.",
        "Like eating cardboard.",
        "Way too dense, hurt my jaw.",
        "The texture is the problem. It is crumbly and dry, and it sucks all the moisture out of your mouth so you need water with every bite.",
        "Bad. Gritty texture, and the cocoa tastes burnt rather than rich. I ate half and gave up, which is unusual for me.",
      ],
      INDIFFERENT: [
        "It's an okay bar.",
        "Standard protein bar taste.",
        "Fine texture, average flavor.",
        "It tastes like most protein bars. Slightly chalky but not badly so, and the chocolate is present without being interesting.",
      ],
    },
  },
  {
    text: "How full did you feel after eating the bar, and for how long?",
    kind: "open",
    skipRate: 0.04,
    answers: {
      LIKE: [
        "Full for hours.",
        "Kept me going until lunch, about three hours.",
        "Very satisfying - I had it at 9am after a workout and did not think about food again until well past noon.",
        "This is where it really delivered. I usually need a snack ninety minutes after a bar and I made it almost four hours.",
      ],
      DISLIKE: [
        "Not filling at all.",
        "Hungry again in 30 minutes.",
        "It did not hold me at all. For the calorie count I expected far more staying power than about half an hour.",
      ],
      INDIFFERENT: [
        "About an hour or two.",
        "Reasonably full, nothing remarkable.",
        "Kept me satisfied for a normal amount of time - maybe two hours, same as any other bar.",
      ],
    },
  },
  yesNo("Would you pay $2.99 for this bar?"),
  yesNo("Would you recommend this bar to a friend?", 0.03),
  {
    text: "Does this feel like a healthy product to you? Why or why not?",
    kind: "open",
    skipRate: 0.08,
    answers: {
      LIKE: [
        "Yes, the ingredient list is short and recognizable.",
        "It does. Real nuts, plant protein, and not a mile-long list of additives.",
        "Yes - it feels like real food rather than a supplement pretending to be a snack, and the fiber content shows in how full I felt.",
      ],
      DISLIKE: [
        "No, too much sugar.",
        "Not really, it is a candy bar with protein added.",
        "No. Sixteen grams of sugar is dessert territory no matter how much protein you put next to it, and the ingredient list is long.",
      ],
      INDIFFERENT: [
        "Somewhat.",
        "Healthier than a candy bar, less healthy than actual food.",
        "It is middle of the road. Decent protein, more sugar than I would like, so I would call it a fine occasional option.",
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Study 3: Laundry detergent sheets (negative outcome)
// ---------------------------------------------------------------------------
export const LAUNDRY_SHEETS: QuestionDef[] = [
  {
    text: "How well did the sheets clean your laundry compared to your usual detergent?",
    kind: "open",
    answers: {
      LIKE: [
        "Just as well, honestly surprised.",
        "Clothes came out clean and fresh.",
        "Better than expected - my gym clothes came out genuinely odor free, which my liquid detergent does not always manage.",
      ],
      DISLIKE: [
        "Much worse.",
        "Did not clean at all.",
        "Stains stayed put.",
        "Noticeably worse than my usual detergent. Everyday dirt came out fine but anything actually stained - grass, oil, coffee - was still there after the cycle.",
        "Poor. I ran a normal load of my kids' clothes and had to rewash the whole thing with my regular detergent. The sheets left the clothes smelling faintly musty rather than clean.",
        "This was a real letdown. Over two weeks I ran about a dozen loads and the pattern was consistent: lightly soiled items were acceptable, and anything with real soil came out disappointing. Towels lost their softness and started to smell sour after a few days in the closet, which tells me residue is being left behind. I ended up rewashing several loads.",
      ],
      INDIFFERENT: [
        "About the same.",
        "Comparable, no real difference.",
        "Roughly equivalent for normal loads. I did not test anything heavily stained so I cannot say beyond that.",
      ],
    },
  },
  {
    text: "Did the sheets dissolve completely in your machine?",
    kind: "open",
    answers: {
      LIKE: [
        "Yes, completely.",
        "Dissolved fine every time.",
        "No issues at all, even on cold cycles.",
      ],
      DISLIKE: [
        "No, found pieces stuck to clothes.",
        "Never fully dissolved.",
        "Left gummy residue in the drum.",
        "This was the biggest problem. On cold water - which is most of my loads - the sheets left visible white flakes stuck to dark clothing, and I had to pick them off by hand.",
        "Absolutely not. I found partially dissolved sheet stuck to the inside of the drum after nearly every load, and twice a whole sheet came out the other end essentially intact and wrapped around a sleeve.",
        "No, and this ruined the product for me. My machine is a front loader on the eco cycle, which uses less water, and the sheets simply could not handle it. Every load came out with gelatinous residue somewhere - on the clothes, in the drum seal, or in the detergent drawer. I had to run an empty hot cycle twice during the test just to clean the machine.",
      ],
      INDIFFERENT: [
        "Mostly.",
        "Usually yes, occasionally not.",
        "On warm cycles yes, on cold sometimes not quite. Manageable if you plan around it.",
      ],
    },
  },
  yesNo("Would you switch from your current detergent to this product?"),
  yesNo("Was the scent level acceptable to you?", 0.05),
  {
    text: "What would need to improve before you would consider buying this?",
    kind: "open",
    skipRate: 0.1,
    answers: {
      LIKE: [
        "Nothing major, maybe a larger pack.",
        "Just make it easier to find in stores.",
      ],
      DISLIKE: [
        "The dissolving problem, first and foremost.",
        "Cleaning power has to actually match liquid detergent.",
        "Fix the residue, fix the cleaning, and lower the price. Right now it costs more than my liquid detergent and does a worse job, so there is no reason to switch.",
        "It needs to work in cold water. That is not a nice-to-have, that is how most people wash clothes now, and the product plainly was not tested for it.",
      ],
      INDIFFERENT: [
        "Cheaper price.",
        "Slightly better cleaning and I would consider it.",
        "If the price dropped below what I pay now I would probably give it another look.",
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Study 4: Oat creamer flavor extension (indifferent outcome)
// ---------------------------------------------------------------------------
export const OAT_CREAMER: QuestionDef[] = [
  {
    text: "How did this creamer taste in your usual coffee?",
    kind: "open",
    answers: {
      LIKE: [
        "Really creamy, loved it.",
        "Blended beautifully, no separation.",
        "It made my regular drip coffee taste like something from a cafe. Genuinely creamy without the oat flavor taking over.",
      ],
      DISLIKE: [
        "Curdled in my coffee.",
        "Overpoweringly sweet.",
        "Thin and watery.",
        "It separated almost immediately and floated in little clumps on top. Whatever the taste might have been, I could not get past the appearance.",
      ],
      INDIFFERENT: [
        "Fine, does the job.",
        "Tastes like oat milk in coffee.",
        "It was okay. Slightly thinner than dairy creamer, a bit of oat flavor coming through, nothing offensive.",
        "Perfectly serviceable. It lightened the coffee, added a little sweetness, and otherwise did not make much of an impression on me either way.",
        "Neutral overall. I finished the bottle over the week and my honest assessment is that it is neither better nor worse than the original flavor I already buy, which makes the flavor extension feel a bit pointless.",
      ],
    },
  },
  {
    text: "Was the sweetness level right for you?",
    kind: "open",
    skipRate: 0.04,
    answers: {
      LIKE: [
        "Perfect amount.",
        "Just right - sweet enough to skip sugar entirely.",
      ],
      DISLIKE: [
        "Far too sweet.",
        "Cloying, like dessert syrup.",
        "Much too sweet for coffee. Two tablespoons and my cup tasted like a milkshake, and I could not taste the coffee at all anymore.",
      ],
      INDIFFERENT: [
        "A bit sweet but fine.",
        "Close to right.",
        "Slightly sweeter than I would make it myself, but within a range I can live with.",
      ],
    },
  },
  yesNo("Would you buy this flavor in addition to the original?"),
  {
    text: "Would this replace your current creamer, or sit alongside it?",
    kind: "open",
    skipRate: 0.07,
    answers: {
      LIKE: [
        "Replace it entirely.",
        "This becomes my main one.",
      ],
      DISLIKE: [
        "Neither, I would not buy it.",
        "Sticking with what I have.",
      ],
      INDIFFERENT: [
        "Alongside, occasionally.",
        "Probably alongside - a change of pace but not an everyday thing.",
        "Honestly neither. It is fine but not different enough from the original for me to make room for it in the fridge.",
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Study 5: Bamboo paper towels (indifferent outcome)
// ---------------------------------------------------------------------------
export const BAMBOO_PAPER_TOWEL: QuestionDef[] = [
  {
    text: "How did the towels perform on absorbency?",
    kind: "open",
    answers: {
      LIKE: [
        "Soaked up everything fast.",
        "Very absorbent, one sheet did the job.",
        "Impressive - I spilled most of a glass of juice and a single sheet handled it without falling apart.",
      ],
      DISLIKE: [
        "Barely absorbed anything.",
        "Pushed water around instead of soaking it.",
        "Poor. It took four sheets to deal with a small spill, which defeats the environmental point entirely.",
      ],
      INDIFFERENT: [
        "Adequate.",
        "About the same as my usual brand.",
        "Fine. Not noticeably better or worse than what I already buy, which is the honest answer.",
        "It performed acceptably. I used it for the normal range of kitchen messes over the test period and it handled them, though never in a way that made me stop and notice.",
      ],
    },
  },
  {
    text: "Did the towels hold up when wet?",
    kind: "open",
    skipRate: 0.05,
    answers: {
      LIKE: [
        "Yes, very strong.",
        "Held together even scrubbing a counter.",
        "Yes - I wrung one out and reused it, which I would never attempt with my normal towels.",
      ],
      DISLIKE: [
        "Fell apart immediately.",
        "Shredded on the first wipe.",
        "No. The moment it got wet it turned to pulp and left bits of fiber all over the countertop.",
      ],
      INDIFFERENT: [
        "Well enough.",
        "Held up okay for light use.",
        "Reasonably. They are not the strongest I have used but they did not disintegrate either.",
      ],
    },
  },
  yesNo("Is the sheet size right for how you use paper towels?", 0.04),
  yesNo("Would you buy these at the same price as your current brand?"),
  {
    text: "Any other comments about the product?",
    kind: "open",
    skipRate: 0.35,
    answers: {
      LIKE: [
        "Nice that it is bamboo.",
        "Really glad to find a sustainable option that actually works.",
      ],
      DISLIKE: [
        "The texture is rough on skin.",
        "Feels like sandpaper, and the roll is smaller than it looks on the shelf.",
      ],
      INDIFFERENT: [
        "No further comments.",
        "The bamboo angle is a nice bonus but it would not drive my decision on its own.",
        "Just that it is a perfectly fine product. I do not have strong feelings, which I realize is not very useful feedback.",
      ],
    },
  },
];

export const QUESTION_BANKS: Record<string, QuestionDef[]> = {
  "citrus-sparkling": CITRUS_SPARKLING,
  "plant-protein-bar": PLANT_PROTEIN_BAR,
  "laundry-sheets": LAUNDRY_SHEETS,
  "oat-creamer": OAT_CREAMER,
  "bamboo-paper-towel": BAMBOO_PAPER_TOWEL,
};
