import { TeacherSetupPasswordForm } from "./teacher-setup-password-form";

type PageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function TeacherSetupPasswordPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] || "" : params.token || "";

  return <TeacherSetupPasswordForm token={token} />;
}
