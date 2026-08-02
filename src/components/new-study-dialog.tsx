"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field, Select } from "@/components/ui/input";
import { apiRequest } from "@/lib/api-client";

const EMPTY = {
  name: "",
  product: "",
  productVersion: "",
  testCriteria: "",
  category: "",
  description: "",
  targetPanelSize: "",
  status: "DRAFT",
};

export function NewStudyDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await apiRequest<{ study: { id: string } }>("/api/studies", {
        method: "POST",
        body: {
          name: form.name,
          product: form.product,
          productVersion: form.productVersion,
          testCriteria: form.testCriteria,
          category: form.category || null,
          description: form.description || null,
          targetPanelSize: form.targetPanelSize ? Number(form.targetPanelSize) : null,
          status: form.status,
        },
      });
      setOpen(false);
      setForm(EMPTY);
      router.push(`/studies/${res.study.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>New study</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Create study"
        description="A first leg is created automatically so you can upload data right away."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Study name">
            <Input value={form.name} onChange={set("name")} required placeholder="Spring 2026 flavor test" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Product">
              <Input value={form.product} onChange={set("product")} required placeholder="Sparkling water" />
            </Field>
            <Field label="Product version">
              <Input value={form.productVersion} onChange={set("productVersion")} required placeholder="v2.3" />
            </Field>
          </div>
          <Field label="Test criteria">
            <Textarea
              value={form.testCriteria}
              onChange={set("testCriteria")}
              required
              placeholder="What this study is testing, e.g. taste preference of reformulated citrus flavor"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category (optional)">
              <Input value={form.category} onChange={set("category")} placeholder="Beverage" />
            </Field>
            <Field label="Target panel size (optional)">
              <Input type="number" min={1} value={form.targetPanelSize} onChange={set("targetPanelSize")} />
            </Field>
          </div>
          <Field label="Status">
            <Select value={form.status} onChange={set("status")}>
              <option value="DRAFT">Draft</option>
              <option value="COLLECTING">Collecting</option>
              <option value="ANALYZED">Analyzed</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </Field>
          <Field label="Description (optional)">
            <Textarea value={form.description} onChange={set("description")} />
          </Field>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating..." : "Create study"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
