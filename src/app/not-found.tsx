import { ErrorPage } from "@/components/ErrorPage"

// Next answers with a real 404 for this file (static export: 404.html). It renders inside the root layout,
// so the shell is already there.
export default function NotFound() {
  return <ErrorPage mode="block" status={404} />
}
