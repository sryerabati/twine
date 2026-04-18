import type { AnchorHTMLAttributes, ReactNode } from "react";

type MockLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children?: ReactNode;
  href: string;
};

export default function Link({ children, href, ...props }: MockLinkProps) {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}
