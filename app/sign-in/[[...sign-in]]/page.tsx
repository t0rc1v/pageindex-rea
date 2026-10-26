import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

/**
 * `<SignIn />` reads the URL with `usePathname()`, and this app runs with
 * `cacheComponents: true`, so the catch-all prebuilt component needs a Suspense
 * boundary of its own or `next build` refuses to prerender the route.
 */
export default function SignInPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-10">
      <Suspense>
        <SignIn />
      </Suspense>
    </div>
  );
}
