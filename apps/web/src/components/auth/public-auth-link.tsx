"use client";

import Link from "next/link";
import { AuthLoading, Authenticated, Unauthenticated } from "convex/react";

import { isConvexConfigured } from "@/lib/convex";

type PublicAuthLinkProps = {
  className: string;
  href?: string;
  authenticatedLabel?: string;
  unauthenticatedLabel?: string;
};

export function PublicAuthLink({
  className,
  href = "/app",
  authenticatedLabel = "Open dashboard",
  unauthenticatedLabel = "Log in",
}: PublicAuthLinkProps) {
  const renderLink = (label: string) => (
    <Link href={href} className={className}>
      {label}
    </Link>
  );

  if (!isConvexConfigured()) {
    return renderLink(unauthenticatedLabel);
  }

  return (
    <>
      <AuthLoading>{renderLink(unauthenticatedLabel)}</AuthLoading>
      <Unauthenticated>{renderLink(unauthenticatedLabel)}</Unauthenticated>
      <Authenticated>{renderLink(authenticatedLabel)}</Authenticated>
    </>
  );
}
