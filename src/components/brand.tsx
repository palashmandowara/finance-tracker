import Link from "next/link";
import { AudioLines } from "lucide-react";
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Finance Tracker home">
      <AudioLines className="text-brand" aria-hidden="true" />
      Finance Tracker
    </Link>
  );
}
