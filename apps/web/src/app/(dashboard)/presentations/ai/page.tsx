import { redirect } from "next/navigation";

export default function AiPresentationPage() {
  redirect("/proposals?tab=create");
}
