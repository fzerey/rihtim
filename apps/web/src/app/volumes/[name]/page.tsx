"use client";
import { useParams } from "next/navigation";
import { VolumeDetailView } from "@/components/VolumeDetailView";

export default function VolumeDetailPage() {
  const params = useParams<{ name: string }>();
  const volumeName = decodeURIComponent(params.name);
  return <VolumeDetailView volumeName={volumeName} />;
}
