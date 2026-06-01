import "server-only";
import type { Application } from "../../store";
import type { Profile } from "../../profile";
import type { Contact } from "../../contacts-store";
import type { StoredPlan, SkillStatus } from "../../skills-store";
import type { Notification } from "../../notifications";
import type { ModelSettings } from "../../model-settings";
import type { IntegrationSettings } from "../../integration-settings";
import type { CompanyTarget } from "../../company-targets";
import type { BatchState } from "../../batch-runner";

export interface ApplicationRepository {
  list(userEmail: string): Application[];
  get(userEmail: string, slug: string): Application | undefined;
  getById(userEmail: string, id: string): Application | undefined;
  save(userEmail: string, app: Application): void;
  update(userEmail: string, id: string, changes: Partial<Application>): void;
  delete(userEmail: string, id: string): void;
}

export interface ProfileRepository {
  get(userEmail: string): Profile | null;
  has(userEmail: string): boolean;
  save(userEmail: string, profile: Profile): void;
  seedIfEmpty(userEmail: string, adminEmail: string): void;
}

export interface ContactRepository {
  list(userEmail: string): Contact[];
  search(userEmail: string, query: string): Contact[];
  getByCompany(userEmail: string, company: string): Contact[];
  getByApplication(userEmail: string, slug: string): Contact[];
  add(userEmail: string, c: Omit<Contact, "id" | "createdAt" | "tags" | "applicationSlugs"> & { tags?: string[]; applicationSlugs?: string[] }): Contact;
  update(userEmail: string, id: string, changes: Partial<Contact>): void;
  delete(userEmail: string, id: string): void;
  attachToApplication(userEmail: string, contactId: string, slug: string): void;
}

export interface SkillRepository {
  getPlan(userEmail: string): StoredPlan | null;
  savePlan(userEmail: string, plan: StoredPlan): void;
  getStatuses(userEmail: string): Record<string, SkillStatus>;
  setStatus(userEmail: string, skillName: string, status: SkillStatus): void;
}

export interface NotificationRepository {
  list(userEmail: string): Notification[];
  add(userEmail: string, n: Omit<Notification, "id" | "createdAt" | "dismissed">): string;
  update(userEmail: string, id: string, changes: Partial<Notification>): void;
  dismiss(userEmail: string, id: string): void;
}

export interface SettingsRepository {
  getModelSettings(userEmail: string): ModelSettings;
  saveModelSettings(userEmail: string, s: ModelSettings): void;
  getIntegrationSettings(userEmail: string): IntegrationSettings;
  saveIntegrationSettings(userEmail: string, s: IntegrationSettings): void;
  getCompanyTargets(userEmail: string): CompanyTarget[];
  saveCompanyTargets(userEmail: string, targets: CompanyTarget[]): void;
  getBatchState(userEmail: string): BatchState | null;
  saveBatchState(userEmail: string, state: BatchState | null): void;
}
