"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { uploadPlayerPhoto } from "@/lib/upload-photo";

// ── Types ──────────────────────────────────────────────────

type Role = "parent" | "mentor";
type SchoolYear = "Y3" | "Y4" | "Y5" | "Y6" | "Y7" | "Y8";

interface AuthFields {
  fullName: string;
  mobile: string;
  email: string;
  password: string;
}

interface ChildField {
  firstName: string;
  lastName: string;
  schoolYear: SchoolYear;
}

interface ParentStep2 {
  children: ChildField[];
}

const SCHOOL_YEARS: SchoolYear[] = ["Y3", "Y4", "Y5", "Y6", "Y7", "Y8"];

// ── Spinner ────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="inline h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ── Clock Icon ─────────────────────────────────────────────

function ClockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="12" cy="12" r="10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
    </svg>
  );
}

// ── Lock Icon ──────────────────────────────────────────────

function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-8 w-8"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path strokeLinecap="round" d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

// ── Check Icon ─────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg
      className="h-7 w-7"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ── Page ───────────────────────────────────────────────────

export default function RegisterPage() {
  const supabase = getSupabaseBrowserClient();

  const [deadline, setDeadline] = useState<Date | null>(null);
  const [deadlinePassed, setDeadlinePassed] = useState(false);

  useEffect(() => {
    supabase
      .from("settings")
      .select("value")
      .eq("key", "registration_deadline")
      .single()
      .then(({ data }) => {
        if (data) {
          const d = new Date(data.value);
          setDeadline(d);
          setDeadlinePassed(new Date() > d);
        }
      });
  }, [supabase]);

  const [role, setRole] = useState<Role>("parent");
  const [step, setStep] = useState<1 | 2>(1);
  const [parentUid, setParentUid] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Photo upload sub-step state (Step 3)
  const [showPhotos, setShowPhotos] = useState(false);
  const [playerIds, setPlayerIds] = useState<{ id: string; first_name: string; last_name: string; name: string }[]>([]);

  // Step 1 form
  const {
    register: regAuth,
    handleSubmit: handleAuth,
    formState: { errors: authErrors, isSubmitting: authSubmitting },
    reset: resetAuth,
  } = useForm<AuthFields>({ mode: "onSubmit" });

  // Step 2 form (parent children)
  const {
    register: regChild,
    handleSubmit: handleChildren,
    control,
    formState: { errors: childErrors, isSubmitting: childSubmitting },
    reset: resetChildren,
  } = useForm<ParentStep2>({
    defaultValues: { children: [{ firstName: "", lastName: "", schoolYear: "Y3" }] },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "children",
  });

  // ── Role switch ──────────────────────────────────────────

  function switchRole(r: Role) {
    setRole(r);
    setStep(1);
    setParentUid(null);
    setDone(false);
    setServerError(null);
    setShowPhotos(false);
    setPlayerIds([]);
    resetAuth();
    resetChildren({ children: [{ firstName: "", lastName: "", schoolYear: "Y3" }] });
  }

  // ── Step 1: Auth + Profile ───────────────────────────────

  async function onAuthSubmit(data: AuthFields) {
    setServerError(null);

    let authData;
    let authErr;
    try {
      const result = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
      });
      authData = result.data;
      authErr = result.error;
    } catch (e) {
      setServerError(
        e instanceof Error
          ? e.message
          : "Failed to connect to auth service. Check environment variables."
      );
      return;
    }

    if (authErr) {
      setServerError(authErr.message);
      return;
    }

    const uid = authData.user?.id;
    if (!uid) {
      setServerError("Signup succeeded but no user ID was returned.");
      return;
    }

    const { error: profileErr } = await supabase.from("profiles").insert({
      id: uid,
      role,
      full_name: data.fullName.trim(),
      mobile_number: data.mobile.trim(),
    });

    if (profileErr) {
      setServerError(profileErr.message);
      return;
    }

    if (role === "mentor") {
      setDone(true);
    } else {
      setParentUid(uid);
      setStep(2);
    }
  }

  // ── Step 2: Add Children ─────────────────────────────────

  async function onChildrenSubmit(data: ParentStep2) {
    setServerError(null);

    const rows = data.children.map((c) => ({
      parent_id: parentUid,
      first_name: c.firstName.trim(),
      last_name: c.lastName.trim(),
      name: `${c.firstName.trim()} ${c.lastName.trim()}`,
      age_group: c.schoolYear,
    }));

    const { data: inserted, error: insertErr } = await supabase
      .from("players")
      .insert(rows)
      .select("id, first_name, last_name, name");

    if (insertErr) {
      setServerError(insertErr.message);
      return;
    }

    // Transition to photo upload step
    setPlayerIds(inserted ?? []);
    setShowPhotos(true);
  }

  // ── Success ──────────────────────────────────────────────

  if (done) {
    return (
      <Shell>
        <div className="flex flex-col items-center py-4 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-cricket/10 text-cricket">
            <CheckIcon />
          </div>
          <h2 className="mb-2 text-xl font-extrabold tracking-tight text-foreground">
            You&apos;re all set!
          </h2>
          <p className="text-sm text-muted-foreground">
            {role === "parent"
              ? "Your account and players have been registered."
              : "Your mentor account has been created."}
          </p>

          <div className="mt-6 flex flex-col gap-3 w-full">
            <Link
              href="/home"
              className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity hover:opacity-90"
            >
              Go to Home
            </Link>
            <Link
              href="/profile"
              className="inline-flex h-12 w-full items-center justify-center rounded-2xl border-2 border-cricket bg-background px-6 text-base font-bold text-cricket shadow-md transition-opacity hover:opacity-90"
            >
              My Profile
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Deadline checks ──────────────────────────────────────

  if (deadlinePassed)
    return (
      <Shell>
        <div className="flex flex-col items-center py-4 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <LockIcon />
          </div>
          <h2 className="mb-2 text-xl font-extrabold tracking-tight text-foreground">
            Registration Closed
          </h2>
          <p className="text-sm text-muted-foreground">
            Registration closed on{" "}
            {deadline?.toLocaleDateString("en-AU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            . Contact the organisers if you need to register.
          </p>
        </div>
      </Shell>
    );

  // ── Render ───────────────────────────────────────────────

  return (
    <Shell>
      {/* Deadline notice */}
      {deadline && !deadlinePassed && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-border bg-cricket-light/60 px-4 py-3 text-sm text-foreground">
          <ClockIcon />
          <span>
            Registration closes on{" "}
            <span className="font-semibold">
              {deadline.toLocaleDateString("en-AU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            .
          </span>
        </div>
      )}

      {/* Title */}
      <h2 className="mb-5 text-xl font-extrabold tracking-tight text-foreground">
        Parent Registration
      </h2>

      {/* Step indicator (parent only) */}
      {role === "parent" && (
        <div className="mb-6 flex items-center gap-2">
          <StepDot active={step === 1} done={step === 2} label="1" />
          <div
            className={`h-0.5 flex-1 rounded transition-colors ${
              step === 2 ? "bg-cricket" : "bg-border"
            }`}
          />
          <StepDot active={step === 2 && !showPhotos} done={step === 2 && showPhotos} label="2" />
          <div
            className={`h-0.5 flex-1 rounded transition-colors ${
              showPhotos ? "bg-cricket" : "bg-border"
            }`}
          />
          <StepDot active={showPhotos} done={false} label="3" />
          <span className="ml-2 text-xs text-muted-foreground">
            {step === 1 ? "Your details" : showPhotos ? "Photos" : "Add children"}
          </span>
        </div>
      )}

      {/* Server error */}
      {serverError && (
        <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      {/* ── Step 1: Auth form ──────────────────────────── */}
      {step === 1 && (
        <form
          onSubmit={handleAuth(onAuthSubmit)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="fullName" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Full Name
            </Label>
            <Input
              id="fullName"
              type="text"
              placeholder="Jane Smith"
              className="h-12"
              {...regAuth("fullName", { required: "Full name is required." })}
            />
            {authErrors.fullName && (
              <p className="text-xs text-destructive">
                {authErrors.fullName.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mobile" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Mobile Number
            </Label>
            <Input
              id="mobile"
              type="tel"
              placeholder="04XX XXX XXX"
              className="h-12"
              {...regAuth("mobile", { required: "Mobile number is required." })}
            />
            {authErrors.mobile && (
              <p className="text-xs text-destructive">
                {authErrors.mobile.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="jane@example.com"
              className="h-12"
              {...regAuth("email", { required: "Email is required." })}
            />
            {authErrors.email && (
              <p className="text-xs text-destructive">
                {authErrors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="Min. 6 characters"
              className="h-12"
              {...regAuth("password", {
                required: "Password is required.",
                minLength: {
                  value: 6,
                  message: "Must be at least 6 characters.",
                },
              })}
            />
            {authErrors.password && (
              <p className="text-xs text-destructive">
                {authErrors.password.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={authSubmitting}
            className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {authSubmitting ? (
              <span className="flex items-center gap-2">
                <Spinner /> Please Wait
              </span>
            ) : role === "parent" ? (
              "Continue"
            ) : (
              "Complete Registration"
            )}
          </button>
        </form>
      )}

      {/* ── Step 3: Photo Upload (parent only) ─────────── */}
      {step === 2 && role === "parent" && showPhotos && (
        <div className="space-y-5">
          <div>
            <h3 className="text-base font-extrabold tracking-tight text-foreground">
              Add Player Photos
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Tap a circle to upload a photo. You can skip this and add photos later.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-5">
            {playerIds.map((player) => (
              <div
                key={player.id}
                className="flex flex-col items-center gap-2"
              >
                <AvatarUpload
                  size={80}
                  onUpload={(file) =>
                    uploadPlayerPhoto(supabase, parentUid!, player.id, file)
                  }
                />
                <span className="text-xs font-semibold text-foreground text-center max-w-[80px] truncate">
                  {player.first_name ?? player.name}
                </span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl border-2 border-cricket bg-background text-base font-bold text-cricket shadow-md transition-opacity hover:opacity-90"
              onClick={() => setDone(true)}
            >
              Skip
            </button>
            <button
              type="button"
              className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl bg-cricket text-base font-bold text-cricket-foreground shadow-md transition-opacity hover:opacity-90"
              onClick={() => setDone(true)}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Add Children (parent only) ─────────── */}
      {step === 2 && role === "parent" && !showPhotos && (
        <form
          onSubmit={handleChildren(onChildrenSubmit)}
          className="space-y-4"
          noValidate
        >
          <h3 className="text-base font-extrabold tracking-tight text-foreground">
            Add Your Children
          </h3>

          <div className="space-y-3">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="rounded-2xl border border-border bg-muted/40 shadow-md px-4 pt-4 pb-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-xs">
                    Child {index + 1}
                  </Badge>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-xs font-medium text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Input
                      type="text"
                      placeholder="First name"
                      className="h-12"
                      {...regChild(`children.${index}.firstName` as const, {
                        required: "First name is required.",
                      })}
                    />
                    {childErrors.children?.[index]?.firstName && (
                      <p className="text-xs text-destructive">
                        {childErrors.children[index].firstName?.message}
                      </p>
                    )}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <Input
                      type="text"
                      placeholder="Last name"
                      className="h-12"
                      {...regChild(`children.${index}.lastName` as const, {
                        required: "Last name is required.",
                      })}
                    />
                    {childErrors.children?.[index]?.lastName && (
                      <p className="text-xs text-destructive">
                        {childErrors.children[index].lastName?.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    School Year
                  </Label>
                  <Controller
                    control={control}
                    name={`children.${index}.schoolYear` as const}
                    render={({ field: controlledField }) => (
                      <Select
                        value={controlledField.value}
                        onValueChange={controlledField.onChange}
                      >
                        <SelectTrigger className="h-12 w-full">
                          <SelectValue placeholder="Select year" />
                        </SelectTrigger>
                        <SelectContent>
                          {SCHOOL_YEARS.map((g) => (
                            <SelectItem key={g} value={g}>
                              {g}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => append({ firstName: "", lastName: "", schoolYear: "Y3" })}
            className="w-full rounded-2xl border-2 border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition hover:border-cricket hover:text-cricket focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            + Add Another Child
          </button>

          <button
            type="submit"
            disabled={childSubmitting}
            className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {childSubmitting ? (
              <span className="flex items-center gap-2">
                <Spinner /> Please Wait
              </span>
            ) : (
              "Save & Continue"
            )}
          </button>
        </form>
      )}

      {/* Footer links */}
      <div className="mt-6 space-y-2 text-center text-sm text-muted-foreground">
        <p>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Sign In
          </Link>
        </p>
        <p>
          Registering as a mentor?{" "}
          <Link href="/register-mentor" className="font-semibold text-primary hover:underline">
            Mentor signup
          </Link>
        </p>
      </div>
    </Shell>
  );
}

// ── Layout shell ───────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-[#f5f5f5] px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        {/* Branding */}
        <div className="text-center">
          <p className="text-3xl">🏏</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">
            Junior 5-a-Side
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Youth Tournament Registration
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-background shadow-md px-6 py-7">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Step dot ───────────────────────────────────────────────

function StepDot({
  active,
  done,
  label,
}: {
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold transition-all ${
        done
          ? "bg-cricket text-cricket-foreground"
          : active
            ? "bg-cricket/10 text-cricket ring-2 ring-cricket"
            : "bg-muted text-muted-foreground"
      }`}
    >
      {done ? (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        label
      )}
    </span>
  );
}
