import { AuditView } from '@/components/audit/AuditView';

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AuditView id={id} />;
}
