"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

// ── Types ──────────────────────────────────────────────────

type Role = "parent" | "mentor";
type AgeGroup = "Blue" | "Green" | "Red";

interface AuthFields {
  fullName: string;
  mobile: string;
  email: string;
  password: string;
}

interface ChildField {
  name: string;
  ageGroup: AgeGroup;
}

interface ParentStep2 {
  children: ChildField[];
}

const AGE_GROUPS: AgeGroup[] = ["Blue", "Green", "Red"];

// ── Spinner ────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="inline h-4 w-4 animate-spin text-white"
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

// ── Page ───────────────────────────────────────────────────

export default function RegisterPage() {
  const supabase = getSupabaseBrowserClient();

  const [role, setRole] = useState<Role>("parent");
  const [step, setStep] = useState<1 | 2>(1);
  const [parentUid, setParentUid] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Step 1 form
  const {
    register: regAuth,
    handleSubmit: handleAuth,
    formState: { errors: authErrors, isSubmitting: authSubmitting },
    reset: resetAuth,
  } = useForm<AuthFields>();

  // Step 2 form (parent children)
  const {
    register: regChild,
    handleSubmit: handleChildren,
    control,
    formState: { errors: childErrors, isSubmitting: childSubmitting },
    reset: resetChildren,
  } = useForm<ParentStep2>({
    defaultValues: { children: [{ name: "", ageGroup: "Blue" }] },
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
    resetAuth();
    resetChildren({ children: [{ name: "", ageGroup: "Blue" }] });
  }

  // ── Step 1: Auth + Profile ───────────────────────────────

  async function onAuthSubmit(data: AuthFields) {
    setServerError(null);

    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
    });

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
      name: c.name.trim(),
      age_group: c.ageGroup,
    }));

    const { error: insertErr } = await supabase.from("players").insert(rows);

    if (insertErr) {
      setServerError(insertErr.message);
      return;
    }

    setDone(true);
  }

  // ── Success ──────────────────────────────────────────────

  if (done) {
    return (
      <Shell>
        <div className="text-center py-6">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <svg
              className="h-7 w-7 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            You&apos;re all set!
          </h2>
          <p className="text-sm text-gray-500">
            {role === "parent"
              ? "Your account and players have been registered."
              : "Your mentor account has been created."}
          </p>
        </div>
      </Shell>
    );
  }

  // ── Shared styles ────────────────────────────────────────

  const inputClass =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition";

  const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500";

  const errorClass = "mt-1 text-xs text-red-500";

  // ── Render ───────────────────────────────────────────────

  return (
    <Shell>
      {/* Role toggle */}
      <div className="mb-8">
        <div className="flex rounded-xl bg-gray-100 p-1">
          {(["parent", "mentor"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => switchRole(r)}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                role === r
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {r === "parent" ? "Register as Parent" : "Register as Mentor"}
            </button>
          ))}
        </div>
      </div>

      {/* Step indicator (parent only) */}
      {role === "parent" && (
        <div className="mb-6 flex items-center gap-2">
          <StepDot active={step === 1} done={step === 2} label="1" />
          <div className={`h-px flex-1 ${step === 2 ? "bg-emerald-400" : "bg-gray-200"}`} />
          <StepDot active={step === 2} done={false} label="2" />
          <span className="ml-2 text-xs text-gray-400">
            {step === 1 ? "Your details" : "Add children"}
          </span>
        </div>
      )}

      {/* Server error */}
      {serverError && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {serverError}
        </div>
      )}

      {/* ── Step 1: Auth form ──────────────────────────── */}
      {step === 1 && (
        <form onSubmit={handleAuth(onAuthSubmit)} className="space-y-5" noValidate>
          <div>
            <label className={labelClass}>Full Name</label>
            <input
              type="text"
              placeholder="Jane Smith"
              className={inputClass}
              {...regAuth("fullName", { required: "Full name is required." })}
            />
            {authErrors.fullName && (
              <p className={errorClass}>{authErrors.fullName.message}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>Mobile Number</label>
            <input
              type="tel"
              placeholder="04XX XXX XXX"
              className={inputClass}
              {...regAuth("mobile", { required: "Mobile number is required." })}
            />
            {authErrors.mobile && (
              <p className={errorClass}>{authErrors.mobile.message}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              placeholder="jane@example.com"
              className={inputClass}
              {...regAuth("email", { required: "Email is required." })}
            />
            {authErrors.email && (
              <p className={errorClass}>{authErrors.email.message}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>Password</label>
            <input
              type="password"
              placeholder="Min. 6 characters"
              className={inputClass}
              {...regAuth("password", {
                required: "Password is required.",
                minLength: { value: 6, message: "Must be at least 6 characters." },
              })}
            />
            {authErrors.password && (
              <p className={errorClass}>{authErrors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={authSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {authSubmitting ? (
              <>
                <Spinner /> Please Wait
              </>
            ) : role === "parent" ? (
              "Continue"
            ) : (
              "Complete Registration"
            )}
          </button>
        </form>
      )}

      {/* ── Step 2: Add Children (parent only) ─────────── */}
      {step === 2 && role === "parent" && (
        <form onSubmit={handleChildren(onChildrenSubmit)} className="space-y-5" noValidate>
          <h3 className="text-base font-bold text-gray-800">
            Add Your Children
          </h3>

          <div className="space-y-3">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="rounded-xl border border-gray-200 bg-gray-50/50 p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400">
                    Child {index + 1}
                  </span>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="rounded-md px-2 py-0.5 text-xs text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <input
                      type="text"
                      placeholder="Child's name"
                      className={inputClass}
                      {...regChild(`children.${index}.name` as const, {
                        required: "Name is required.",
                      })}
                    />
                    {childErrors.children?.[index]?.name && (
                      <p className={errorClass}>
                        {childErrors.children[index].name?.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>Age Group</label>
                    <select
                      className={inputClass}
                      {...regChild(`children.${index}.ageGroup` as const)}
                    >
                      {AGE_GROUPS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => append({ name: "", ageGroup: "Blue" })}
            className="w-full rounded-xl border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-400 transition hover:border-emerald-400 hover:text-emerald-600"
          >
            + Add Another Child
          </button>

          <button
            type="submit"
            disabled={childSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {childSubmitting ? (
              <>
                <Spinner /> Please Wait
              </>
            ) : (
              "Complete Registration"
            )}
          </button>
        </form>
      )}
    </Shell>
  );
}

// ── Layout shell ───────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f7f4] px-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">
            Cricket Club
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Youth Tournament Registration
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
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
      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition ${
        done
          ? "bg-emerald-500 text-white"
          : active
            ? "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500"
            : "bg-gray-200 text-gray-400"
      }`}
    >
      {done ? (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        label
      )}
    </span>
  );
}
