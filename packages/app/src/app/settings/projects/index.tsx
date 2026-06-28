import ProjectsScreen from "@/screens/projects-screen";

const PROJECTS_VIEW = { kind: "projects" } as const;

export default function SettingsProjectsIndexRoute() {
  return <ProjectsScreen view={PROJECTS_VIEW} />;
}
