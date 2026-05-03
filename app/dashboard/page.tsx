"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="px-4 py-5 space-y-4">
      <h2 className="text-xl font-extrabold tracking-tight text-foreground">
        My Account
      </h2>

      <div className="flex flex-col gap-3">
        {/* My Players */}
        <Link href="/my-players">
          <Card className="rounded-2xl shadow-md cursor-pointer active:scale-[0.98] transition-transform border-l-[4px] border-l-cricket">
            <CardContent className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <svg className="h-6 w-6 text-cricket" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <div>
                  <p className="font-extrabold tracking-tight text-foreground leading-tight">
                    My Players
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    View and manage your registered children
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold text-muted-foreground">→</span>
            </CardContent>
          </Card>
        </Link>

        {/* My Profile */}
        <Link href="/profile">
          <Card className="rounded-2xl shadow-md cursor-pointer active:scale-[0.98] transition-transform border-l-[4px] border-l-blue-500">
            <CardContent className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <svg className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <div>
                  <p className="font-extrabold tracking-tight text-foreground leading-tight">
                    My Profile
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your contact details and account
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold text-muted-foreground">→</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
