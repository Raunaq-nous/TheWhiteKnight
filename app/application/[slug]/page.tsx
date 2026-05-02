import { applications } from "../../data";
import SlugRedirect from "./redirect";

export function generateStaticParams() {
  return applications.map(a => ({ slug: a.slug }));
}

export default async function ApplicationSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SlugRedirect slug={slug} />;
}
