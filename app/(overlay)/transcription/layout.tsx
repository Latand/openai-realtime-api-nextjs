import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Transcription",
  description: "Live transcription window",
};

export default function TranscriptionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Return children only - the page component handles background transparency via useEffect
  return <>{children}</>;
}
