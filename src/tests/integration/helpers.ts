import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { registerUser } from "@/server/services/auth.service";
import { createOrganization } from "@/server/services/organization.service";
import { resolveTenantContext } from "@/server/services/tenant.service";
import type { TenantContext } from "@/server/context";

export const META = { ipAddress: "127.0.0.1", userAgent: "vitest", correlationId: "test" };

export async function makeUser(label = "u") {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const user = await registerUser({ name: `Usuário ${label}`, email, password: "SenhaForte123" }, META);
  return { ...user, email };
}

export async function makeOrgWithOwner(label = "org") {
  const owner = await makeUser(`${label}-owner`);
  const org = await createOrganization(owner.id, { name: `Escritório ${label} ${randomUUID().slice(0, 4)}`, timezone: "America/Sao_Paulo" }, META);
  const ctx = (await resolveTenantContext(owner.id, org.id, META)) as TenantContext;
  return { owner, org, ctx };
}

export async function roleByKey(organizationId: string, key: string) {
  return db.role.findFirstOrThrow({ where: { organizationId, key } });
}

/** Adiciona um usuário já existente ao escritório com o perfil informado (atalho de teste, sem convite). */
export async function addMember(organizationId: string, roleKey: string, label = "m") {
  const user = await makeUser(label);
  const role = await roleByKey(organizationId, roleKey);
  const membership = await db.membership.create({ data: { organizationId, userId: user.id, roleId: role.id } });
  const ctx = (await resolveTenantContext(user.id, organizationId, META)) as TenantContext;
  return { user, membership, ctx };
}
