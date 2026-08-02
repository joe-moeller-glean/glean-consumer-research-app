"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api-client";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "RESEARCHER" | "VIEWER";
  active: boolean;
  createdAt: string;
};

const EMPTY = { email: "", name: "", password: "", role: "RESEARCHER" };

const ROLE_HINTS: Record<string, string> = {
  ADMIN: "Full access, including user management",
  RESEARCHER: "Create and edit studies, panelists, and analysis",
  VIEWER: "Read-only access",
};

export function UserManager({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest<{ users: UserRow[] }>("/api/users");
      setUsers(res.users);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/users", { method: "POST", body: form });
      setOpen(false);
      setForm(EMPTY);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function update(id: string, body: Record<string, unknown>) {
    setError("");
    try {
      await apiRequest(`/api/users/${id}`, { method: "PATCH", body });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(user: UserRow) {
    if (!confirm(`Delete ${user.email}?`)) return;
    setError("");
    try {
      await apiRequest(`/api/users/${user.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">Manage who can access the application and what they can do</p>
        </div>
        <Button onClick={() => setOpen(true)}>New user</Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Email</TH>
            <TH>Role</TH>
            <TH>Status</TH>
            <TH>Created</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {users.map((u) => (
            <TR key={u.id}>
              <TD className="font-medium">
                {u.name}
                {u.id === currentUserId && (
                  <Badge tone="blue" className="ml-2">
                    you
                  </Badge>
                )}
              </TD>
              <TD className="text-muted-foreground">{u.email}</TD>
              <TD>
                <Select
                  value={u.role}
                  onChange={(e) => update(u.id, { role: e.target.value })}
                  className="h-8 w-36 text-xs"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="RESEARCHER">Researcher</option>
                  <option value="VIEWER">Viewer</option>
                </Select>
              </TD>
              <TD>
                <Badge tone={u.active ? "green" : "gray"}>{u.active ? "Active" : "Disabled"}</Badge>
              </TD>
              <TD className="text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TD>
              <TD>
                <div className="flex gap-2">
                  <button
                    onClick={() => update(u.id, { active: !u.active })}
                    className="text-xs text-primary hover:underline"
                  >
                    {u.active ? "Disable" : "Enable"}
                  </button>
                  {u.id !== currentUserId && (
                    <button onClick={() => remove(u)} className="text-xs text-destructive hover:underline">
                      Delete
                    </button>
                  )}
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <Dialog open={open} onClose={() => setOpen(false)} title="New user">
        <form onSubmit={create} className="space-y-4">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </Field>
          <Field label="Password" hint="At least 8 characters">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
              minLength={8}
            />
          </Field>
          <Field label="Role" hint={ROLE_HINTS[form.role]}>
            <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="ADMIN">Admin</option>
              <option value="RESEARCHER">Researcher</option>
              <option value="VIEWER">Viewer</option>
            </Select>
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating..." : "Create user"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
