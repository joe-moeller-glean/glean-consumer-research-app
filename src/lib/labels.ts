// Display labels for enum values — shared by charts, tables, and forms.

export const SEX_LABELS: Record<string, string> = {
  MALE: "Male",
  FEMALE: "Female",
  NONBINARY: "Non-binary",
  OTHER: "Other",
  PREFER_NOT_TO_SAY: "Prefer not to say",
};

export const RACE_LABELS: Record<string, string> = {
  AMERICAN_INDIAN_ALASKA_NATIVE: "American Indian / Alaska Native",
  ASIAN: "Asian",
  BLACK_AFRICAN_AMERICAN: "Black / African American",
  NATIVE_HAWAIIAN_PACIFIC_ISLANDER: "Native Hawaiian / Pacific Islander",
  WHITE: "White",
  MULTIRACIAL: "Multiracial",
  OTHER: "Other",
  PREFER_NOT_TO_SAY: "Prefer not to say",
};

export const INCOME_LABELS: Record<string, string> = {
  UNDER_25K: "Under $25k",
  K25_50K: "$25k–$50k",
  K50_75K: "$50k–$75k",
  K75_100K: "$75k–$100k",
  K100_150K: "$100k–$150k",
  K150_200K: "$150k–$200k",
  OVER_200K: "Over $200k",
  PREFER_NOT_TO_SAY: "Prefer not to say",
};

export const FAMILY_MAKEUP_LABELS: Record<string, string> = {
  SINGLE_NO_KIDS: "Single, no kids",
  SINGLE_WITH_KIDS: "Single, with kids",
  COUPLE_NO_KIDS: "Couple, no kids",
  COUPLE_WITH_KIDS: "Couple, with kids",
  MULTIGENERATIONAL: "Multigenerational household",
  ROOMMATES: "Roommates",
  OTHER: "Other",
  PREFER_NOT_TO_SAY: "Prefer not to say",
};

export const SENTIMENT_LABELS: Record<string, string> = {
  LIKE: "Like",
  DISLIKE: "Dislike",
  INDIFFERENT: "Indifferent",
};

export const STUDY_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  COLLECTING: "Collecting",
  PROCESSING: "Processing",
  ANALYZED: "Analyzed",
  ARCHIVED: "Archived",
};

export const UPLOAD_STATUS_LABELS: Record<string, string> = {
  UPLOADED: "Uploaded",
  PARSING: "Parsing",
  PARSED: "Parsed",
  PROCESSING: "Processing",
  COMPLETE: "Complete",
  FAILED: "Failed",
};

export const BATCH_STATUS_LABELS: Record<string, string> = {
  VALIDATING: "Validating",
  PENDING: "Pending",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
  EXPIRED: "Expired",
};

export const SENTIMENT_COLORS: Record<string, string> = {
  LIKE: "#16a34a",
  DISLIKE: "#dc2626",
  INDIFFERENT: "#9ca3af",
};
