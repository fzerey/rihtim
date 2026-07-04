"use client";
import { useParams } from "next/navigation";
import { ImageDetailView } from "@/components/ImageDetailView";

export default function ImageDetailPage() {
  const params = useParams<{ id: string }>();
  const imageId = decodeURIComponent(params.id);
  return <ImageDetailView imageId={imageId} />;
}
