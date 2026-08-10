// Portfolio repo location — hardcoded rather than a settings field, since
// this integration is inherently scoped to one person's one portfolio
// (unlike the other IntegrationSettings entries, which are generic
// third-party API keys). Only the access token is user-configured
// (lib/integration-settings.ts).
export const PORTFOLIO_REPO = {
  owner: "Raunaq-nous",
  repo: "raunaq-portfolio",
  branch: "main",
  paths: {
    builds: "src/data/builds.ts",
    battles: "src/data/battles.ts",
    skills: "src/data/skills.ts",
    research: "src/data/research.ts",
    curiosities: "src/data/curiosities.ts",
  },
} as const;
