import type { DomainBundle } from "@/lib/data/catalog-helpers";
import { defineDomain } from "@/lib/data/catalog-helpers";
import { aiMachineLearning } from "@/lib/data/domains/ai-machine-learning";
import { cloudDevops } from "@/lib/data/domains/cloud-devops";
import { cybersecurity } from "@/lib/data/domains/cybersecurity";
import { dataAnalytics } from "@/lib/data/domains/data-analytics";
import { itSupport } from "@/lib/data/domains/it-support";
import { mobileDevelopment } from "@/lib/data/domains/mobile-development";
import { productManagement } from "@/lib/data/domains/product-management";
import { uxDesign } from "@/lib/data/domains/ux-design";
import { webDevelopment } from "@/lib/data/domains/web-development";
import { projectResources } from "@/lib/data/projects";

export type { DomainBundle };
export { defineDomain };

/**
 * The full seedable catalog. Adding a domain here is the only step needed for
 * the app to support it — nothing downstream hardcodes a domain id.
 */
export const domains: DomainBundle[] = [
  cybersecurity,
  dataAnalytics,
  webDevelopment,
  cloudDevops,
  aiMachineLearning,
  uxDesign,
  productManagement,
  mobileDevelopment,
  itSupport
];

/**
 * Projects span domains (a hunting platform is cyber, a RealWorld build is web),
 * so they are appended once rather than split across the bundles. Every catalog
 * rule still applies to them — the tests run over `allResources`.
 */
export const allResources = [...domains.flatMap((bundle) => bundle.resources), ...projectResources];
export const allSkills = domains.flatMap((bundle) => bundle.skills);
export const allRoles = domains.flatMap((bundle) => bundle.roles);
