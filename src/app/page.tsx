import { redirect } from "next/navigation";

/** Einstiegspunkt – leitet auf das Dashboard (Middleware erzwingt Login). */
export default function Home() {
  redirect("/dashboard");
}
