import { resource } from "@/lib/data/catalog-helpers";
import type { LearningResource } from "@/lib/types";

/**
 * Build-it-yourself work, kept in one file rather than scattered through the
 * domain catalogs.
 *
 * The catalog had 225 rows and not one of type `project`, even though
 * `EVENT_WEIGHTS` in lib/adaptation/mastery weighs a reviewed project above
 * every other kind of evidence — the heaviest signal in the product was
 * unreachable because nothing could produce it.
 *
 * Every URL below returned HTTP 200 on 2026-09-08. One candidate
 * (blueteamvillage/Project-Obsidian) returned 404 and was dropped rather than
 * seeded, which is the rule the rest of the catalog follows.
 */
const VERIFIED = "2026-09-08";

export const projectResources: LearningResource[] = [
  resource({
    id: "helk-hunting-platform",
    title: "HELK — build a threat hunting platform",
    provider: "Cyb3rWard0g (GitHub)",
    url: "https://github.com/Cyb3rWard0g/HELK",
    resourceType: "project",
    skillTags: ["siem-querying", "log-analysis"],
    prerequisites: ["linux-fundamentals"],
    difficulty: "advanced",
    durationMinutes: 600,
    qualityScore: 0.86,
    evidenceType: "hunting-platform-writeup",
    lastVerifiedAt: VERIFIED,
    description:
      "Stand up an Elasticsearch, Logstash and Kibana hunting stack, ship real telemetry into it, and write the queries that surface suspicious behaviour."
  }),
  resource({
    id: "metasploitable3-lab",
    title: "Metasploitable3 — build and break a vulnerable host",
    provider: "Rapid7 (GitHub)",
    url: "https://github.com/rapid7/metasploitable3",
    resourceType: "project",
    skillTags: ["web-security-basics"],
    prerequisites: ["linux-fundamentals", "networking-basics"],
    difficulty: "intermediate",
    durationMinutes: 420,
    qualityScore: 0.84,
    evidenceType: "pentest-lab-report",
    lastVerifiedAt: VERIFIED,
    description:
      "Provision a deliberately vulnerable machine, work through its flaws, and document each finding with the evidence and remediation."
  }),
  resource({
    id: "owasp-wrongsecrets",
    title: "OWASP WrongSecrets — find the leaked credentials",
    provider: "OWASP (GitHub)",
    url: "https://github.com/OWASP/wrongsecrets",
    resourceType: "project",
    skillTags: ["web-security-basics", "cloud-fundamentals"],
    prerequisites: ["linux-fundamentals"],
    difficulty: "intermediate",
    durationMinutes: 300,
    qualityScore: 0.83,
    evidenceType: "secrets-audit-writeup",
    lastVerifiedAt: VERIFIED,
    description:
      "A run of challenges hiding secrets in code, containers and cloud config. Each one you solve is a concrete example of how credentials leak in practice."
  }),
  resource({
    id: "realworld-fullstack-app",
    title: "RealWorld — build the same app the professionals build",
    provider: "Thinkster (GitHub)",
    url: "https://github.com/gothinkster/realworld",
    resourceType: "project",
    skillTags: ["web-react", "web-http-apis"],
    prerequisites: ["web-javascript"],
    difficulty: "intermediate",
    durationMinutes: 900,
    qualityScore: 0.9,
    evidenceType: "deployed-app-and-repo",
    lastVerifiedAt: VERIFIED,
    description:
      "A full Medium-style application specified down to the API contract, so your build can be compared against a reference rather than graded on vibes."
  }),
  resource({
    id: "project-based-learning",
    title: "Project-Based Learning — build it from scratch",
    provider: "practical-tutorials (GitHub)",
    url: "https://github.com/practical-tutorials/project-based-learning",
    resourceType: "project",
    skillTags: ["web-javascript"],
    prerequisites: ["web-html-css"],
    difficulty: "beginner",
    durationMinutes: 480,
    qualityScore: 0.82,
    evidenceType: "project-repository",
    lastVerifiedAt: VERIFIED,
    description:
      "Curated build-from-nothing tutorials — a text editor, a shell, a web server — where the deliverable is working code you wrote line by line."
  }),
  resource({
    id: "ds-ipython-notebooks",
    title: "Data science notebooks — analyse a real dataset end to end",
    provider: "donnemartin (GitHub)",
    url: "https://github.com/donnemartin/data-science-ipython-notebooks",
    resourceType: "project",
    skillTags: ["python-pandas", "data-visualization"],
    prerequisites: ["python-basics"],
    difficulty: "intermediate",
    durationMinutes: 420,
    qualityScore: 0.85,
    evidenceType: "analysis-notebook",
    lastVerifiedAt: VERIFIED,
    description:
      "Worked notebooks covering pandas, cleaning and plotting. Reproduce one on a dataset of your own and the notebook becomes the artefact."
  }),
  resource({
    id: "ms-data-science-beginners",
    title: "Data Science for Beginners — a project a lesson",
    provider: "Microsoft (GitHub)",
    url: "https://github.com/microsoft/Data-Science-For-Beginners",
    resourceType: "project",
    skillTags: ["data-cleaning", "data-storytelling"],
    prerequisites: ["spreadsheet-fundamentals"],
    difficulty: "beginner",
    durationMinutes: 600,
    qualityScore: 0.87,
    evidenceType: "analysis-notebook",
    lastVerifiedAt: VERIFIED,
    description:
      "Twenty lessons that each end in a small build: cleaning a messy set, choosing a chart that does not mislead, and writing up what it means."
  }),
  resource({
    id: "ms-ml-for-beginners",
    title: "ML for Beginners — train and evaluate your own models",
    provider: "Microsoft (GitHub)",
    url: "https://github.com/microsoft/ML-For-Beginners",
    resourceType: "project",
    skillTags: ["ml-supervised", "ml-model-evaluation"],
    prerequisites: ["ml-python"],
    difficulty: "beginner",
    durationMinutes: 720,
    qualityScore: 0.88,
    evidenceType: "trained-model-writeup",
    lastVerifiedAt: VERIFIED,
    description:
      "Classic ML built from scratch across twelve weeks of lessons, each ending in a model you trained and an honest evaluation of where it fails."
  }),
  resource({
    id: "kubernetes-examples",
    title: "Kubernetes examples — deploy a real workload",
    provider: "Kubernetes (GitHub)",
    url: "https://github.com/kubernetes/examples",
    resourceType: "project",
    skillTags: ["devops-kubernetes"],
    prerequisites: ["devops-containers"],
    difficulty: "intermediate",
    durationMinutes: 360,
    qualityScore: 0.84,
    evidenceType: "manifest-and-cluster-writeup",
    lastVerifiedAt: VERIFIED,
    description:
      "Reference applications — a guestbook, a stateful database, a job queue — to deploy and then explain: what each manifest declares and why."
  })
];
