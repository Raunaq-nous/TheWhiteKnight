"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SlugRedirect({ slug }: { slug: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/application/?slug=${slug}`);
  }, [slug, router]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", fontSize: "0.875rem" }}>
      REDIRECTING...
    </div>
  );
}
