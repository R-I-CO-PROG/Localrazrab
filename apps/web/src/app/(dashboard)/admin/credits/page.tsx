import { redirect } from "next/navigation";

export default function AdminCreditsRedirectPage() {
  redirect("/admin/users");
}
