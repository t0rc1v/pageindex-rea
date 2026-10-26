import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

/** Catch-all prebuilt component: needs a Suspense boundary under Cache Components. */
export default function SignUpPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-10">
      <Suspense>
        <SignUp />
      </Suspense>
    </div>
  );
}
