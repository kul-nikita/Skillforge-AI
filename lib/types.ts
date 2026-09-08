export type CostType = "free" | "paid" | "freemium";
export type ResourceType = "course" | "lab" | "doc" | "project" | "video";
export type Difficulty = "beginner" | "intermediate" | "advanced";

/** Domains are data: nothing in lib/ may hardcode a domain or role id. */
export type Domain = {
  id: string;
  name: string;
  description: string;
};

export type Role = {
  id: string;
  domainId: string;
  title: string;
  description: string;
  requiredSkills: Array<{
    skillId: string;
    importance: number;
  }>;
};

export type Skill = {
  id: string;
  domainId: string;
  name: string;
  category: string;
  description: string;
  prerequisites: string[];
};

export type SkillGraph = {
  skills: Skill[];
};

export type MasteryMap = Record<string, number>;

export type LearningResource = {
  id: string;
  title: string;
  provider: string;
  url: string;
  resourceType: ResourceType;
  skillTags: string[];
  difficulty: Difficulty;
  durationMinutes: number;
  costType: CostType;
  language: string;
  qualityScore: number;
  isCurated: boolean;
  prerequisites: string[];
  evidenceType: string | null;
  lastVerifiedAt: string;
  description: string;
};

export type LearnerPreferences = {
  /** Preferred session length. Soft signal — feeds TimeFit, never a hard filter. */
  maxHoursPerStep: number;
  cost: CostType | "any";
  format: ResourceType | "any";
};

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export type LearningStyle =
  | "hands-on"
  | "visual"
  | "reading"
  | "mixed"
  | "unknown";

export type LearnerProfile = {
  learnerId: string;

  targetRoleId: string;
  careerObjective: string;

  experienceLevel: ExperienceLevel;
  currentSkills: string[];
  interests: string[];
  learningHistory: string[];
  preferredTechnologies: string[];
  learningStyle: LearningStyle;

  timelineWeeks: number;
  weeklyHours: number;
  preferences: LearnerPreferences;

  consentGiven: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Gap = {
  skill: Skill;
  importance: number;
  currentMastery: number;
  reason: string;
};

export type Evidence = {
  id: string;
  learnerId: string;
  skillId: string;
  resourceId: string;
  /** What the learner actually did, in their own words. */
  summary: string;
  evidenceType: string;
  /** Null until the learner uploads the artifact — never fake a link. */
  artifactUrl: string | null;
  rubricScore: number;
  validatedCapabilities: string[];
  createdAt: string;
  /** HMAC over the record's own fields, checked by /verify/<id>. */
  signature: string;
};

export type ScoreBreakdown = {
  gapMatch: number;
  prereqReadiness: number;
  quality: number;
  preferenceFit: number;
  timeFit: number;
  costFit: number;
  total: number;
};
