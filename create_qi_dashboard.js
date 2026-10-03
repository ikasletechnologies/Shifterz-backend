import fs from "fs";

const code = `"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Camera,
  Clock,
  Search,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Car
} from "lucide-react";
import { apiCall } from "@/lib/api";
import { StatCard } from "./StatCard";

export function QualityInspectorDashboard() {
  const [qcJobs, setQcJobs] = useState<any[]>([]);
  const [cars, setCars] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [qcRes, carinRes] = await Promise.all([
        apiCall("/qc/queue").catch(() => []),
        apiCall("/carin").catch(() => [])
      ]);
      setQcJobs(Array.isArray(qcRes) ? qcRes : []);
      setCars(Array.isArray(carinRes) ? carinRes : []);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-gray-500">
        <RefreshCw className="w-6 h-6 animate-spin mr-2 text-yellow-500" />
        <span>Loading Quality Inspector Dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <div className="font-bold">Error loading dashboard</div>
        <div className="text-sm mt-1">{error}</div>
        <button
          onClick={fetchData}
          className="mt-3 px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  // Calculate metrics
  const totalQcJobs = qcJobs.length;
  const awaitingReview = qcJobs.filter((j) =>
    ["Waiting for Quality Check", "Waiting QC", "QC Pending", "Completed", "Work Completed"].includes(j.status)
  ).length;
  const inInspection = qcJobs.filter((j) => j.status === "Inspecting").length;
  const qcPassed = qcJobs.filter((j) => j.status === "QC Passed").length;
  const reworkRequired = qcJobs.filter((j) =>
    ["Rework Required", "QC Failed"].includes(j.status)
  ).length;

  const totalEvaluated = qcPassed + reworkRequired;
  const passRate = totalEvaluated > 0 ? Math.round((qcPassed / totalEvaluated) * 100) : 100;

  const pendingInspections = cars.filter((c) => !c.inspectionCompleted && c.status !== "Completed").length;

  // Filter top pending jobs
  const pendingJobsList = qcJobs
    .filter((j) => ["Waiting for Quality Check", "Waiting QC", "QC Pending", "Inspecting", "Rework Required"].includes(j.status))
    .slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Top Banner / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 to-slate-800 p-6 rounded-2xl text-white shadow-md">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-6 h-6 text-yellow-400" />
            <h1 className="text-xl font-bold tracking-tight">Quality Inspector Overview</h1>
          </div>
          <p className="text-slate-400 text-xs">
            Monitor quality control audits, checklist evaluations, and vehicle inspections
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/qc"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-bold text-xs transition shadow-sm"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Open QC Queue ({totalQcJobs})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/dashboard/vehicle-inspection"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs transition border border-slate-600"
          >
            <Camera className="w-4 h-4 text-emerald-400" />
            <span>Vehicle Inspection</span>
          </Link>
        </div>
      </div>

      {/* QC Key Stats */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-yellow-600" />
          Quality Control (QC) Metrics
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard title="Total QC Jobs" value={totalQcJobs} icon={ShieldCheck} color="yellow" />
          <StatCard title="Awaiting Review" value={awaitingReview} icon={Clock} color="blue" />
          <StatCard title="Inspecting" value={inInspection} icon={Search} color="purple" />
          <StatCard title="QC Passed" value={qcPassed} icon={CheckCircle} color="green" />
          <StatCard title="Rework Required" value={reworkRequired} icon={AlertTriangle} color="red" />
        </div>
      </section>

      {/* Vehicle Inspection Stats */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Camera className="w-5 h-5 text-emerald-600" />
          Vehicle Inspection & Pass Rate
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title="Total Vehicles Checked In" value={cars.length} icon={Car} color="blue" />
          <StatCard title="Pending Inspection" value={pendingInspections} icon={Clock} color="orange" />
          <StatCard title="QC Pass Rate" value={`${passRate}%`} icon={CheckCircle} color="green" />
        </div>
      </section>

      {/* Recent Actionable Items Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending QC Jobs */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-yellow-500" />
              <h3 className="font-bold text-gray-900 text-sm">Pending QC Jobs</h3>
            </div>
            <Link
              href="/dashboard/qc"
              className="text-xs font-semibold text-yellow-600 hover:text-yellow-700 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {pendingJobsList.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-xs">
              No jobs currently awaiting quality check
            </div>
          ) : (
            <div className="space-y-3">
              {pendingJobsList.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition border border-gray-100"
                >
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-gray-900">{job.id}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          job.status === "Inspecting"
                            ? "bg-purple-100 text-purple-700"
                            : job.status === "Rework Required" || job.status === "QC Failed"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {job.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 truncate mt-0.5">
                      {job.vehicle || "No Vehicle"} • {job.customer || "Walk-in Customer"}
                    </div>
                  </div>
                  <Link
                    href="/dashboard/qc"
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-slate-900 font-bold text-xs transition shadow-2xs"
                  >
                    Inspect
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Vehicle Check-ins */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-emerald-500" />
              <h3 className="font-bold text-gray-900 text-sm">Recent Vehicle Check-ins</h3>
            </div>
            <Link
              href="/dashboard/vehicle-inspection"
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {cars.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-xs">
              No vehicle check-in records found
            </div>
          ) : (
            <div className="space-y-3">
              {cars.slice(0, 5).map((car: any) => (
                <div
                  key={car.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition border border-gray-100"
                >
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-gray-900">
                        {car.vehicleNumber || car.vehicleNo || "N/A"}
                      </span>
                      <span className="text-[10px] text-gray-500 font-medium">
                        {car.model || car.vehicleModel || ""}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 truncate mt-0.5">
                      Customer: {car.customerName || "Customer"} • {car.phone || ""}
                    </div>
                  </div>
                  <Link
                    href="/dashboard/vehicle-inspection"
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition shadow-2xs"
                  >
                    View
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
`;

fs.writeFileSync("d:/shifters/Shifterz-frontend/src/components/dashboard/QualityInspectorDashboard.tsx", code, "utf8");
console.log("Created QualityInspectorDashboard.tsx successfully!");
