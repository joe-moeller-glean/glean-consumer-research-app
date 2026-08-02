"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/input";
import { SEX_LABELS, RACE_LABELS, INCOME_LABELS, FAMILY_MAKEUP_LABELS } from "@/lib/labels";

export type PanelistFormValues = {
  panelistId: string;
  age: string;
  sex: string;
  race: string;
  country: string;
  state: string;
  city: string;
  householdIncome: string;
  familyMakeup: string;
  householdSize: string;
  childrenCount: string;
  notes: string;
};

export const EMPTY_PANELIST: PanelistFormValues = {
  panelistId: "",
  age: "",
  sex: "",
  race: "",
  country: "",
  state: "",
  city: "",
  householdIncome: "",
  familyMakeup: "",
  householdSize: "",
  childrenCount: "",
  notes: "",
};

/** Converts form strings into the API's typed, nullable payload. */
export function toPanelistPayload(v: PanelistFormValues, includeId: boolean) {
  const payload: Record<string, unknown> = {
    age: v.age ? Number(v.age) : null,
    sex: v.sex || null,
    race: v.race || null,
    country: v.country || null,
    state: v.state || null,
    city: v.city || null,
    householdIncome: v.householdIncome || null,
    familyMakeup: v.familyMakeup || null,
    householdSize: v.householdSize ? Number(v.householdSize) : null,
    childrenCount: v.childrenCount ? Number(v.childrenCount) : null,
    notes: v.notes || null,
  };
  if (includeId) payload.panelistId = v.panelistId;
  return payload;
}

function options(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}

export function PanelistFields({
  values,
  onChange,
  lockId,
  disabled,
}: {
  values: PanelistFormValues;
  onChange: (v: PanelistFormValues) => void;
  lockId?: boolean;
  disabled?: boolean;
}) {
  const set =
    (key: keyof PanelistFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      onChange({ ...values, [key]: e.target.value });

  return (
    <div className="space-y-4">
      <Field label="Panelist ID" hint={lockId ? "Immutable once created" : "Unique identifier used to match CSV rows"}>
        <Input value={values.panelistId} onChange={set("panelistId")} required disabled={lockId || disabled} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Age">
          <Input type="number" min={0} max={120} value={values.age} onChange={set("age")} disabled={disabled} />
        </Field>
        <Field label="Sex">
          <Select value={values.sex} onChange={set("sex")} disabled={disabled}>
            <option value="">Not specified</option>
            {options(SEX_LABELS)}
          </Select>
        </Field>
      </div>

      <Field label="Race">
        <Select value={values.race} onChange={set("race")} disabled={disabled}>
          <option value="">Not specified</option>
          {options(RACE_LABELS)}
        </Select>
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Country">
          <Input value={values.country} onChange={set("country")} disabled={disabled} />
        </Field>
        <Field label="State">
          <Input value={values.state} onChange={set("state")} disabled={disabled} />
        </Field>
        <Field label="City">
          <Input value={values.city} onChange={set("city")} disabled={disabled} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Household income">
          <Select value={values.householdIncome} onChange={set("householdIncome")} disabled={disabled}>
            <option value="">Not specified</option>
            {options(INCOME_LABELS)}
          </Select>
        </Field>
        <Field label="Family makeup">
          <Select value={values.familyMakeup} onChange={set("familyMakeup")} disabled={disabled}>
            <option value="">Not specified</option>
            {options(FAMILY_MAKEUP_LABELS)}
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Household size">
          <Input type="number" min={0} value={values.householdSize} onChange={set("householdSize")} disabled={disabled} />
        </Field>
        <Field label="Children">
          <Input type="number" min={0} value={values.childrenCount} onChange={set("childrenCount")} disabled={disabled} />
        </Field>
      </div>

      <Field label="Notes">
        <Textarea value={values.notes} onChange={set("notes")} disabled={disabled} />
      </Field>
    </div>
  );
}
